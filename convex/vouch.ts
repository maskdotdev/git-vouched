import { actionGeneric, mutationGeneric, queryGeneric } from "convex/server"
import { ConvexError, v } from "convex/values"

import { api } from "./api"

type ParsedEntry = {
  platform: string
  username: string
  type: "vouch" | "denounce"
  details?: string
}

const GITHUB_ACCEPT = "application/vnd.github+json"
const GITHUB_API_VERSION = "2022-11-28"

function decodeBase64Utf8(base64Content: string): string {
  const binary = atob(base64Content.replaceAll("\n", ""))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function normalizeGithubSlug(input: string): { owner: string; name: string; slug: string } {
  let value = input.trim()
  value = value.replace(/^https?:\/\/github\.com\//i, "")
  value = value.replace(/\.git$/i, "")
  value = value.replace(/^\/+|\/+$/g, "")

  const parts = value.split("/")
  if (parts.length < 2) {
    throw new ConvexError("Repository must be in owner/repo format")
  }

  const owner = parts[0]?.trim().toLowerCase()
  const name = parts[1]?.trim().toLowerCase()

  if (!owner || !name) {
    throw new ConvexError("Repository must be in owner/repo format")
  }

  return { owner, name, slug: `${owner}/${name}` }
}

function parseTrustdown(input: string): ParsedEntry[] {
  const records = new Map<string, ParsedEntry>()

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) {
      continue
    }

    const isDenounce = line.startsWith("-")
    const remainder = isDenounce ? line.slice(1).trim() : line
    if (!remainder) {
      continue
    }

    const match = remainder.match(/^(\S+)(?:\s+(.+))?$/)
    if (!match) {
      continue
    }

    const handlePart = match[1] ?? ""
    const details = match[2]?.trim()
    const split = handlePart.split(":", 2)
    const hasPlatform = split.length === 2
    const platform = (hasPlatform ? split[0] : "github")?.trim().toLowerCase()
    const usernameRaw = (hasPlatform ? split[1] : split[0])?.trim().replace(/^@/, "")
    const username = usernameRaw?.toLowerCase()

    if (!platform || !username) {
      continue
    }

    const key = `${platform}:${username}`
    records.set(key, {
      platform,
      username,
      type: isDenounce ? "denounce" : "vouch",
      details: details || undefined,
    })
  }

  return Array.from(records.values()).sort((a, b) => {
    const handleA = `${a.platform}:${a.username}`
    const handleB = `${b.platform}:${b.username}`
    return handleA.localeCompare(handleB)
  })
}

async function githubFetch(
  path: string,
  token?: string
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; message: string }> {
  const headers: Record<string, string> = {
    Accept: GITHUB_ACCEPT,
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`https://api.github.com${path}`, { headers })
  const text = await response.text()

  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof (payload as { message?: unknown }).message === "string"
        ? ((payload as { message: string }).message ?? "GitHub request failed")
        : `GitHub request failed with status ${response.status}`

    return { ok: false, status: response.status, message }
  }

  return { ok: true, data: payload }
}

export const setRepositoryStatus = mutationGeneric({
  args: {
    slug: v.string(),
    owner: v.string(),
    name: v.string(),
    defaultBranch: v.string(),
    status: v.union(
      v.literal("new"),
      v.literal("indexed"),
      v.literal("missing_file"),
      v.literal("missing_repo"),
      v.literal("error")
    ),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("repositories")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique()

    const patch = {
      owner: args.owner,
      name: args.name,
      source: "github" as const,
      defaultBranch: args.defaultBranch,
      status: args.status,
      lastError: args.lastError,
      lastIndexedAt: args.status === "indexed" ? Date.now() : existing?.lastIndexedAt ?? 0,
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch)
      return existing._id
    }

    return await ctx.db.insert("repositories", {
      slug: args.slug,
      ...patch,
    })
  },
})

export const replaceRepositorySnapshot = mutationGeneric({
  args: {
    slug: v.string(),
    owner: v.string(),
    name: v.string(),
    defaultBranch: v.string(),
    commitSha: v.string(),
    filePath: v.string(),
    entries: v.array(
      v.object({
        platform: v.string(),
        username: v.string(),
        type: v.union(v.literal("vouch"), v.literal("denounce")),
        details: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    let repo = await ctx.db
      .query("repositories")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique()

    const repoPayload = {
      slug: args.slug,
      owner: args.owner,
      name: args.name,
      source: "github" as const,
      defaultBranch: args.defaultBranch,
      status: "indexed" as const,
      lastIndexedAt: now,
      lastError: undefined,
    }

    if (!repo) {
      const repoId = await ctx.db.insert("repositories", repoPayload)
      repo = await ctx.db.get(repoId)
    } else {
      await ctx.db.patch(repo._id, repoPayload)
      repo = await ctx.db.get(repo._id)
    }

    if (!repo) {
      throw new ConvexError("Failed to initialize repository record")
    }

    const existingEntries = await ctx.db
      .query("entries")
      .withIndex("by_repo", (q) => q.eq("repoId", repo._id))
      .collect()

    for (const entry of existingEntries) {
      await ctx.db.delete(entry._id)
    }

    const existingSnapshots = await ctx.db
      .query("snapshots")
      .withIndex("by_repo", (q) => q.eq("repoId", repo._id))
      .collect()

    for (const snapshot of existingSnapshots) {
      await ctx.db.delete(snapshot._id)
    }

    const snapshotId = await ctx.db.insert("snapshots", {
      repoId: repo._id,
      commitSha: args.commitSha,
      filePath: args.filePath,
      indexedAt: now,
    })

    for (const entry of args.entries) {
      await ctx.db.insert("entries", {
        repoId: repo._id,
        snapshotId,
        platform: entry.platform,
        username: entry.username,
        handle: `${entry.platform}:${entry.username}`,
        type: entry.type,
        details: entry.details,
      })
    }

    return {
      repoId: repo._id,
      indexedAt: now,
      entriesIndexed: args.entries.length,
    }
  },
})

export const indexGithubRepo = actionGeneric({
  args: {
    repo: v.string(),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeGithubSlug(args.repo)
    const token = process.env.GITHUB_TOKEN

    const repoResponse = await githubFetch(`/repos/${normalized.slug}`, token)
    if (!repoResponse.ok) {
      await ctx.runMutation(api.vouch.setRepositoryStatus, {
        slug: normalized.slug,
        owner: normalized.owner,
        name: normalized.name,
        defaultBranch: "main",
        status: repoResponse.status === 404 ? "missing_repo" : "error",
        lastError: repoResponse.message,
      })

      return {
        status: repoResponse.status === 404 ? "missing_repo" : "error",
        slug: normalized.slug,
        message: repoResponse.message,
      } as const
    }

    const repoData = repoResponse.data as {
      default_branch?: string
      pushed_at?: string
    }
    const defaultBranch = repoData.default_branch ?? "main"

    const candidates = [".github/VOUCHED.td", "VOUCHED.td"]
    let selectedPath: string | null = null
    let fileContent: string | null = null
    let commitSha = ""

    for (const path of candidates) {
      const fileResponse = await githubFetch(
        `/repos/${normalized.slug}/contents/${path}?ref=${encodeURIComponent(defaultBranch)}`,
        token
      )

      if (!fileResponse.ok) {
        if (fileResponse.status === 404) {
          continue
        }

        await ctx.runMutation(api.vouch.setRepositoryStatus, {
          slug: normalized.slug,
          owner: normalized.owner,
          name: normalized.name,
          defaultBranch,
          status: "error",
          lastError: fileResponse.message,
        })

        return {
          status: "error",
          slug: normalized.slug,
          message: fileResponse.message,
        } as const
      }

      const payload = fileResponse.data as {
        content?: string
        sha?: string
      }

      const content = payload.content
      if (!content) {
        continue
      }

      selectedPath = path
      commitSha = payload.sha ?? repoData.pushed_at ?? ""
      fileContent = decodeBase64Utf8(content)
      break
    }

    if (!selectedPath || !fileContent) {
      await ctx.runMutation(api.vouch.setRepositoryStatus, {
        slug: normalized.slug,
        owner: normalized.owner,
        name: normalized.name,
        defaultBranch,
        status: "missing_file",
        lastError: "VOUCHED.td was not found in this repository.",
      })

      return {
        status: "missing_file",
        slug: normalized.slug,
        message: "No VOUCHED.td file was found.",
      } as const
    }

    const entries = parseTrustdown(fileContent)
    const result = await ctx.runMutation(api.vouch.replaceRepositorySnapshot, {
      slug: normalized.slug,
      owner: normalized.owner,
      name: normalized.name,
      defaultBranch,
      commitSha,
      filePath: selectedPath,
      entries,
    })

    return {
      status: "indexed",
      slug: normalized.slug,
      filePath: selectedPath,
      entriesIndexed: result.entriesIndexed,
    } as const
  },
})

export const listTrackedRepoSlugs = queryGeneric({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100)
    const repos = await ctx.db
      .query("repositories")
      .withIndex("by_last_indexed")
      .order("asc")
      .take(limit)

    return repos
      .filter((repo) => repo.status !== "missing_repo")
      .map((repo) => repo.slug)
  },
})

export const reindexTrackedRepos = actionGeneric({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const slugs = await ctx.runQuery(api.vouch.listTrackedRepoSlugs, {
      limit: args.limit ?? 25,
    })

    let indexed = 0
    let failed = 0
    let missingFile = 0
    let missingRepo = 0
    const results: Array<
      {
        slug: string
      } & (
        | { status: "indexed"; entriesIndexed: number }
        | { status: "missing_file" | "missing_repo" | "error"; message: string }
      )
    > = []

    for (const slug of slugs) {
      const result = await ctx.runAction(api.vouch.indexGithubRepo, { repo: slug })

      if (result.status === "indexed") {
        indexed += 1
        results.push({
          slug,
          status: "indexed",
          entriesIndexed: result.entriesIndexed,
        })
        continue
      }

      if (result.status === "missing_file") {
        missingFile += 1
      } else if (result.status === "missing_repo") {
        missingRepo += 1
      } else {
        failed += 1
      }

      results.push({
        slug,
        status: result.status,
        message: result.message,
      })
    }

    return {
      attempted: slugs.length,
      indexed,
      missingFile,
      missingRepo,
      failed,
      results,
    }
  },
})

export const listRecentRepos = queryGeneric({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 12, 1), 50)
    const rows = await ctx.db
      .query("repositories")
      .withIndex("by_last_indexed")
      .order("desc")
      .take(limit)

    return rows
  },
})

export const getRepository = queryGeneric({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeGithubSlug(args.slug)
    const repo = await ctx.db
      .query("repositories")
      .withIndex("by_slug", (q) => q.eq("slug", normalized.slug))
      .unique()

    if (!repo) {
      return null
    }

    const entries = await ctx.db
      .query("entries")
      .withIndex("by_repo", (q) => q.eq("repoId", repo._id))
      .collect()
    const snapshot = await ctx.db
      .query("snapshots")
      .withIndex("by_repo", (q) => q.eq("repoId", repo._id))
      .first()

    entries.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type.localeCompare(b.type)
      }
      return a.handle.localeCompare(b.handle)
    })

    return {
      repo,
      snapshot,
      entries,
      counts: {
        vouched: entries.filter((entry) => entry.type === "vouch").length,
        denounced: entries.filter((entry) => entry.type === "denounce").length,
      },
    }
  },
})

export const getUserOverview = queryGeneric({
  args: {
    handle: v.string(),
  },
  handler: async (ctx, args) => {
    const input = args.handle.trim().toLowerCase().replace(/^@/, "")
    if (!input) {
      return null
    }

    const split = input.split(":", 2)
    const platformFilter = split.length === 2 ? split[0] : null
    const username = split.length === 2 ? split[1] : split[0]

    if (!username) {
      return null
    }

    const entries = await ctx.db
      .query("entries")
      .withIndex("by_username", (q) => q.eq("username", username))
      .collect()

    const filteredEntries = entries.filter((entry) =>
      platformFilter ? entry.platform === platformFilter : true
    )

    if (filteredEntries.length === 0) {
      return null
    }

    const repoMap = new Map<string, Awaited<ReturnType<typeof ctx.db.get>>>()
    for (const entry of filteredEntries) {
      const repoId = String(entry.repoId)
      if (!repoMap.has(repoId)) {
        const repo = await ctx.db.get(entry.repoId)
        repoMap.set(repoId, repo)
      }
    }

    const rows = filteredEntries
      .map((entry) => {
        const repo = repoMap.get(String(entry.repoId))
        if (!repo) return null
        return {
          entry,
          repo,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)

    rows.sort((a, b) => {
      if (a.entry.type !== b.entry.type) {
        return a.entry.type.localeCompare(b.entry.type)
      }
      return a.repo.slug.localeCompare(b.repo.slug)
    })

    return {
      handle: platformFilter ? `${platformFilter}:${username}` : username,
      counts: {
        vouched: rows.filter((row) => row.entry.type === "vouch").length,
        denounced: rows.filter((row) => row.entry.type === "denounce").length,
        repositories: new Set(rows.map((row) => row.repo.slug)).size,
      },
      rows,
    }
  },
})

export const searchHandles = queryGeneric({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 12, 1), 30)
    const raw = args.query.trim().toLowerCase().replace(/^@/, "")
    if (!raw) {
      return []
    }

    const core = raw.includes(":") ? raw.split(":", 2)[1] ?? raw : raw
    const username = core.trim()
    if (!username) {
      return []
    }

    const hits = await ctx.db
      .query("entries")
      .withSearchIndex("search_username", (q) => q.search("username", username))
      .take(250)

    const grouped = new Map<
      string,
      {
        platform: string
        username: string
        handle: string
        vouchedCount: number
        denouncedCount: number
        repoIds: Set<string>
      }
    >()

    for (const hit of hits) {
      const key = hit.handle
      const existing = grouped.get(key) ?? {
        platform: hit.platform,
        username: hit.username,
        handle: hit.handle,
        vouchedCount: 0,
        denouncedCount: 0,
        repoIds: new Set<string>(),
      }

      if (hit.type === "vouch") {
        existing.vouchedCount += 1
      } else {
        existing.denouncedCount += 1
      }
      existing.repoIds.add(hit.repoId)
      grouped.set(key, existing)
    }

    const rows = Array.from(grouped.values())
      .sort((a, b) => {
        const scoreA = a.vouchedCount - a.denouncedCount
        const scoreB = b.vouchedCount - b.denouncedCount
        if (scoreA !== scoreB) return scoreB - scoreA
        if (a.vouchedCount !== b.vouchedCount) return b.vouchedCount - a.vouchedCount
        return a.handle.localeCompare(b.handle)
      })
      .slice(0, limit)

    return rows.map((row) => ({
      ...row,
      repositories: row.repoIds.size,
    }))
  },
})

export const listTopHandles = queryGeneric({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 12, 1), 100)
    const entries = await ctx.db.query("entries").collect()

    const grouped = new Map<
      string,
      {
        platform: string
        username: string
        handle: string
        vouchedCount: number
        denouncedCount: number
        repoIds: Set<string>
      }
    >()

    for (const entry of entries) {
      const existing = grouped.get(entry.handle) ?? {
        platform: entry.platform,
        username: entry.username,
        handle: entry.handle,
        vouchedCount: 0,
        denouncedCount: 0,
        repoIds: new Set<string>(),
      }

      if (entry.type === "vouch") {
        existing.vouchedCount += 1
      } else {
        existing.denouncedCount += 1
      }
      existing.repoIds.add(String(entry.repoId))
      grouped.set(entry.handle, existing)
    }

    return Array.from(grouped.values())
      .map((row) => ({
        platform: row.platform,
        username: row.username,
        handle: row.handle,
        vouchedCount: row.vouchedCount,
        denouncedCount: row.denouncedCount,
        repositories: row.repoIds.size,
        score: row.vouchedCount - row.denouncedCount,
      }))
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score
        if (a.vouchedCount !== b.vouchedCount) return b.vouchedCount - a.vouchedCount
        if (a.denouncedCount !== b.denouncedCount) return a.denouncedCount - b.denouncedCount
        if (a.repositories !== b.repositories) return b.repositories - a.repositories
        return a.handle.localeCompare(b.handle)
      })
      .slice(0, limit)
  },
})

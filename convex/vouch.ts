import {
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  paginationOptsValidator,
  queryGeneric,
} from "convex/server"
import { ConvexError, v } from "convex/values"

import { internalApi } from "./api"

type ParsedEntry = {
  platform: string
  username: string
  type: "vouch" | "denounce"
  details?: string
}

type NormalizedEntry = ParsedEntry & {
  handle: string
}

type AuditChange = {
  platform: string
  username: string
  handle: string
  action: "added" | "removed" | "changed"
  beforeType?: "vouch" | "denounce"
  afterType?: "vouch" | "denounce"
  beforeDetails?: string
  afterDetails?: string
}

type LeaderboardDelta = {
  platform: string
  username: string
  handle: string
  vouchedDelta: number
  denouncedDelta: number
  repositoriesDelta: number
}

const GITHUB_ACCEPT = "application/vnd.github+json"
const GITHUB_API_VERSION = "2022-11-28"
const GITHUB_FETCH_TIMEOUT_MS = parsePositiveInteger(
  process.env.GITHUB_FETCH_TIMEOUT_MS,
  15_000
)

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

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

function parseUserHandle(input: string): { username: string; platformFilter: string | null } | null {
  const normalized = input.trim().toLowerCase().replace(/^@/, "")
  if (!normalized) {
    return null
  }

  const split = normalized.split(":", 2)
  const platformFilter = split.length === 2 ? split[0] : null
  const username = split.length === 2 ? split[1] : split[0]

  if (!username) {
    return null
  }

  return { username, platformFilter }
}

function emptyPaginationResult<T>() {
  return {
    page: [] as T[],
    isDone: true,
    continueCursor: "",
    splitCursor: null,
    pageStatus: null,
  }
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

function normalizeEntry(entry: ParsedEntry): NormalizedEntry {
  const platform = entry.platform.trim().toLowerCase()
  const username = entry.username.trim().toLowerCase().replace(/^@/, "")
  return {
    ...entry,
    platform,
    username,
    handle: `${platform}:${username}`,
  }
}

function normalizeStoredEntry(entry: {
  platform: string
  username: string
  type: "vouch" | "denounce"
  details?: string
}): NormalizedEntry {
  return normalizeEntry({
    platform: entry.platform,
    username: entry.username,
    type: entry.type,
    details: entry.details,
  })
}

function computeAuditChanges(previous: NormalizedEntry[], next: NormalizedEntry[]): AuditChange[] {
  const previousMap = new Map(previous.map((entry) => [entry.handle, entry]))
  const nextMap = new Map(next.map((entry) => [entry.handle, entry]))
  const handles = Array.from(new Set([...previousMap.keys(), ...nextMap.keys()])).sort((a, b) =>
    a.localeCompare(b)
  )

  const changes: AuditChange[] = []
  for (const handle of handles) {
    const before = previousMap.get(handle)
    const after = nextMap.get(handle)

    if (!before && after) {
      changes.push({
        platform: after.platform,
        username: after.username,
        handle: after.handle,
        action: "added",
        afterType: after.type,
        afterDetails: after.details,
      })
      continue
    }

    if (before && !after) {
      changes.push({
        platform: before.platform,
        username: before.username,
        handle: before.handle,
        action: "removed",
        beforeType: before.type,
        beforeDetails: before.details,
      })
      continue
    }

    if (!before || !after) {
      continue
    }

    const beforeDetails = before.details ?? undefined
    const afterDetails = after.details ?? undefined
    const changed = before.type !== after.type || beforeDetails !== afterDetails

    if (changed) {
      changes.push({
        platform: after.platform,
        username: after.username,
        handle: after.handle,
        action: "changed",
        beforeType: before.type,
        afterType: after.type,
        beforeDetails,
        afterDetails,
      })
    }
  }

  return changes
}

function computeLeaderboardDeltas(changes: AuditChange[]): LeaderboardDelta[] {
  const deltas = new Map<string, LeaderboardDelta>()

  for (const change of changes) {
    const current = deltas.get(change.handle) ?? {
      platform: change.platform,
      username: change.username,
      handle: change.handle,
      vouchedDelta: 0,
      denouncedDelta: 0,
      repositoriesDelta: 0,
    }

    if (change.action === "added") {
      if (change.afterType === "vouch") {
        current.vouchedDelta += 1
      } else if (change.afterType === "denounce") {
        current.denouncedDelta += 1
      }
      current.repositoriesDelta += 1
    } else if (change.action === "removed") {
      if (change.beforeType === "vouch") {
        current.vouchedDelta -= 1
      } else if (change.beforeType === "denounce") {
        current.denouncedDelta -= 1
      }
      current.repositoriesDelta -= 1
    } else {
      if (change.beforeType === "vouch") {
        current.vouchedDelta -= 1
      } else if (change.beforeType === "denounce") {
        current.denouncedDelta -= 1
      }

      if (change.afterType === "vouch") {
        current.vouchedDelta += 1
      } else if (change.afterType === "denounce") {
        current.denouncedDelta += 1
      }
    }

    deltas.set(change.handle, current)
  }

  return Array.from(deltas.values()).filter(
    (delta) =>
      delta.vouchedDelta !== 0 || delta.denouncedDelta !== 0 || delta.repositoriesDelta !== 0
  )
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function extractSourceUrl(message: string | undefined, slug: string): string | undefined {
  if (!message) {
    return undefined
  }

  const escapedSlug = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(
    `https://github\\.com/${escapedSlug}/(?:issues|discussions)/\\d+#(?:issuecomment|discussioncomment)-\\d+`,
    "i"
  )
  return message.match(pattern)?.[0]
}

function parseSourceCommentReference(sourceUrl: string): {
  kind: "issuecomment" | "discussioncomment"
  id: number
} | null {
  const match = sourceUrl.match(/#(issuecomment|discussioncomment)-(\d+)$/i)
  if (!match) {
    return null
  }

  const id = Number(match[2])
  if (!Number.isSafeInteger(id) || id <= 0) {
    return null
  }

  const kind = match[1]?.toLowerCase()
  if (kind !== "issuecomment" && kind !== "discussioncomment") {
    return null
  }

  return {
    kind,
    id,
  }
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

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), GITHUB_FETCH_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`https://api.github.com${path}`, {
      headers,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, status: 504, message: "GitHub API request timed out." }
    }

    const message = error instanceof Error ? error.message : "GitHub API request failed."
    return { ok: false, status: 502, message }
  } finally {
    clearTimeout(timeoutId)
  }

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

export const setRepositoryStatus = internalMutationGeneric({
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

export const getRepositorySnapshotMeta = internalQueryGeneric({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const repo = await ctx.db
      .query("repositories")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique()

    if (!repo) {
      return null
    }

    const snapshot = await ctx.db
      .query("snapshots")
      .withIndex("by_repo", (q) => q.eq("repoId", repo._id))
      .first()

    return {
      repoStatus: repo.status,
      commitSha: snapshot?.commitSha ?? null,
      filePath: snapshot?.filePath ?? null,
    }
  },
})

export const replaceRepositorySnapshot = internalMutationGeneric({
  args: {
    slug: v.string(),
    owner: v.string(),
    name: v.string(),
    defaultBranch: v.string(),
    commitSha: v.string(),
    filePath: v.string(),
    commitUrl: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    commitActor: v.optional(v.string()),
    commitTimestamp: v.optional(v.string()),
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
    const normalizedEntries = args.entries.map((entry) => normalizeEntry(entry))
    const vouchedCount = normalizedEntries.filter((entry) => entry.type === "vouch").length
    const denouncedCount = normalizedEntries.length - vouchedCount

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
      entryCount: normalizedEntries.length,
      vouchedCount,
      denouncedCount,
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

    const existingNormalizedEntries = existingEntries.map((entry) => normalizeStoredEntry(entry))
    const changes = computeAuditChanges(existingNormalizedEntries, normalizedEntries)
    const leaderboardDeltas = computeLeaderboardDeltas(changes)
    const previousBlock = await ctx.db
      .query("auditBlocks")
      .withIndex("by_repo_and_height", (q) => q.eq("repoId", repo._id))
      .order("desc")
      .first()

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

    for (const entry of normalizedEntries) {
      await ctx.db.insert("entries", {
        repoId: repo._id,
        repoSlug: repo.slug,
        snapshotId,
        platform: entry.platform,
        username: entry.username,
        handle: `${entry.platform}:${entry.username}`,
        type: entry.type,
        details: entry.details,
      })
    }

    for (const delta of leaderboardDeltas) {
      const existingLeaderboardRow = await ctx.db
        .query("leaderboardRows")
        .withIndex("by_handle", (q) => q.eq("handle", delta.handle))
        .unique()

      const vouchedCount = Math.max(0, (existingLeaderboardRow?.vouchedCount ?? 0) + delta.vouchedDelta)
      const denouncedCount = Math.max(
        0,
        (existingLeaderboardRow?.denouncedCount ?? 0) + delta.denouncedDelta
      )
      const repositories = Math.max(
        0,
        (existingLeaderboardRow?.repositories ?? 0) + delta.repositoriesDelta
      )

      if (repositories === 0 || (vouchedCount === 0 && denouncedCount === 0)) {
        if (existingLeaderboardRow) {
          await ctx.db.delete(existingLeaderboardRow._id)
        }
        continue
      }

      const leaderboardPayload = {
        platform: delta.platform,
        username: delta.username,
        handle: delta.handle,
        vouchedCount,
        denouncedCount,
        repositories,
        score: vouchedCount - denouncedCount,
        updatedAt: now,
      }

      if (existingLeaderboardRow) {
        await ctx.db.patch(existingLeaderboardRow._id, leaderboardPayload)
      } else {
        await ctx.db.insert("leaderboardRows", leaderboardPayload)
      }
    }

    let auditBlockHash: string | undefined
    let auditHeight: number | undefined
    const shouldRecordAuditBlock = previousBlock === null || changes.length > 0

    if (shouldRecordAuditBlock) {
      const addedCount = changes.filter((change) => change.action === "added").length
      const removedCount = changes.filter((change) => change.action === "removed").length
      const changedCount = changes.filter((change) => change.action === "changed").length

      auditHeight = (previousBlock?.height ?? 0) + 1
      const previousHash = previousBlock?.blockHash
      const serializedBlock = JSON.stringify({
        repo: args.slug,
        height: auditHeight,
        previousHash: previousHash ?? null,
        snapshotId: String(snapshotId),
        indexedAt: now,
        filePath: args.filePath,
        commitSha: args.commitSha,
        commitUrl: args.commitUrl ?? null,
        sourceUrl: args.sourceUrl ?? null,
        commitActor: args.commitActor ?? null,
        commitTimestamp: args.commitTimestamp ?? null,
        changes: changes.map((change) => ({
          handle: change.handle,
          action: change.action,
          beforeType: change.beforeType ?? null,
          afterType: change.afterType ?? null,
          beforeDetails: change.beforeDetails ?? null,
          afterDetails: change.afterDetails ?? null,
        })),
      })

      auditBlockHash = await sha256Hex(serializedBlock)
      const blockId = await ctx.db.insert("auditBlocks", {
        repoId: repo._id,
        snapshotId,
        height: auditHeight,
        indexedAt: now,
        source: "github",
        filePath: args.filePath,
        commitSha: args.commitSha,
        commitUrl: args.commitUrl,
        sourceUrl: args.sourceUrl,
        commitActor: args.commitActor,
        commitTimestamp: args.commitTimestamp,
        previousBlockId: previousBlock?._id,
        previousHash,
        blockHash: auditBlockHash,
        changeCount: changes.length,
        addedCount,
        removedCount,
        changedCount,
      })

      for (const change of changes) {
        await ctx.db.insert("auditChanges", {
          repoId: repo._id,
          blockId,
          platform: change.platform,
          username: change.username,
          handle: change.handle,
          action: change.action,
          beforeType: change.beforeType,
          afterType: change.afterType,
          beforeDetails: change.beforeDetails,
          afterDetails: change.afterDetails,
        })
      }
    }

    return {
      repoId: repo._id,
      indexedAt: now,
      entriesIndexed: normalizedEntries.length,
      changesDetected: changes.length,
      auditRecorded: shouldRecordAuditBlock,
      auditBlockHash,
      auditHeight,
    }
  },
})

export const indexGithubRepo = internalActionGeneric({
  args: {
    repo: v.string(),
    allowAuthenticatedGithub: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeGithubSlug(args.repo)
    const token = args.allowAuthenticatedGithub ? process.env.GITHUB_TOKEN : undefined

    const repoResponse = await githubFetch(`/repos/${normalized.slug}`, token)
    if (!repoResponse.ok) {
      await ctx.runMutation(internalApi.vouch.setRepositoryStatus, {
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
      private?: boolean
    }
    const defaultBranch = repoData.default_branch ?? "main"
    if (repoData.private) {
      const message = "Private repositories are not supported."
      await ctx.runMutation(internalApi.vouch.setRepositoryStatus, {
        slug: normalized.slug,
        owner: normalized.owner,
        name: normalized.name,
        defaultBranch,
        status: "error",
        lastError: message,
      })

      return {
        status: "error",
        slug: normalized.slug,
        message,
      } as const
    }

    const candidates = [".github/VOUCHED.td", "VOUCHED.td"]
    let selectedPath: string | null = null
    let fileContent: string | null = null
    let commitSha = ""
    let commitUrl: string | undefined
    let sourceUrl: string | undefined
    let commitActor: string | undefined
    let commitTimestamp: string | undefined

    for (const path of candidates) {
      const fileResponse = await githubFetch(
        `/repos/${normalized.slug}/contents/${path}?ref=${encodeURIComponent(defaultBranch)}`,
        token
      )

      if (!fileResponse.ok) {
        if (fileResponse.status === 404) {
          continue
        }

        await ctx.runMutation(internalApi.vouch.setRepositoryStatus, {
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
      await ctx.runMutation(internalApi.vouch.setRepositoryStatus, {
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

    const commitsResponse = await githubFetch(
      `/repos/${normalized.slug}/commits?path=${encodeURIComponent(selectedPath)}&sha=${encodeURIComponent(defaultBranch)}&per_page=1`,
      token
    )

    if (commitsResponse.ok) {
      const commits = Array.isArray(commitsResponse.data) ? commitsResponse.data : []
      const latestCommit = commits[0] as
        | {
            sha?: string
            html_url?: string
            author?: { login?: string | null } | null
            commit?: {
              message?: string | null
              author?: { name?: string | null; date?: string | null } | null
              committer?: { name?: string | null; date?: string | null } | null
            } | null
          }
        | undefined

      if (latestCommit) {
        commitSha = latestCommit.sha ?? commitSha
        commitUrl = latestCommit.html_url ?? undefined
        sourceUrl = extractSourceUrl(latestCommit.commit?.message ?? undefined, normalized.slug)
        commitActor =
          latestCommit.author?.login?.toLowerCase() ??
          latestCommit.commit?.author?.name ??
          latestCommit.commit?.committer?.name ??
          undefined
        commitTimestamp =
          latestCommit.commit?.author?.date ?? latestCommit.commit?.committer?.date ?? undefined
      }
    }

    const sourceRef = sourceUrl ? parseSourceCommentReference(sourceUrl) : null
    if (sourceRef && (!commitActor || commitActor.endsWith("[bot]"))) {
      const endpoint =
        sourceRef.kind === "issuecomment"
          ? `/repos/${normalized.slug}/issues/comments/${sourceRef.id}`
          : `/repos/${normalized.slug}/discussions/comments/${sourceRef.id}`
      const sourceResponse = await githubFetch(endpoint, token)

      if (sourceResponse.ok) {
        const sourceActor = (sourceResponse.data as { user?: { login?: string | null } }).user?.login
        if (sourceActor) {
          commitActor = sourceActor.toLowerCase()
        }
      }
    }

    const existingSnapshotMeta = await ctx.runQuery(internalApi.vouch.getRepositorySnapshotMeta, {
      slug: normalized.slug,
    })
    const isSnapshotUnchanged =
      commitSha.length > 0 &&
      existingSnapshotMeta?.repoStatus === "indexed" &&
      existingSnapshotMeta.commitSha === commitSha &&
      existingSnapshotMeta.filePath === selectedPath

    if (isSnapshotUnchanged) {
      await ctx.runMutation(internalApi.vouch.setRepositoryStatus, {
        slug: normalized.slug,
        owner: normalized.owner,
        name: normalized.name,
        defaultBranch,
        status: "indexed",
        lastError: undefined,
      })

      return {
        status: "indexed",
        slug: normalized.slug,
        filePath: selectedPath,
        entriesIndexed: 0,
        changesDetected: 0,
        auditRecorded: false,
        skippedNoChanges: true,
      } as const
    }

    const entries = parseTrustdown(fileContent)
    const result = await ctx.runMutation(internalApi.vouch.replaceRepositorySnapshot, {
      slug: normalized.slug,
      owner: normalized.owner,
      name: normalized.name,
      defaultBranch,
      commitSha,
      filePath: selectedPath,
      commitUrl,
      sourceUrl,
      commitActor,
      commitTimestamp,
      entries,
    })

    return {
      status: "indexed",
      slug: normalized.slug,
      filePath: selectedPath,
      entriesIndexed: result.entriesIndexed,
      changesDetected: result.changesDetected,
      auditRecorded: result.auditRecorded,
      auditBlockHash: result.auditBlockHash,
      auditHeight: result.auditHeight,
      skippedNoChanges: false,
    } as const
  },
})

export const listTrackedRepoSlugs = internalQueryGeneric({
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

export const reindexTrackedRepos = internalActionGeneric({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const slugs = await ctx.runQuery(internalApi.vouch.listTrackedRepoSlugs, {
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
      const result = await ctx.runAction(internalApi.vouch.indexGithubRepo, {
        repo: slug,
        allowAuthenticatedGithub: true,
      })

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

    const snapshot = await ctx.db
      .query("snapshots")
      .withIndex("by_repo", (q) => q.eq("repoId", repo._id))
      .first()

    let vouched = repo.vouchedCount
    let denounced = repo.denouncedCount

    // Backfill counts for older repository docs that predate materialized counters.
    if (typeof vouched !== "number" || typeof denounced !== "number") {
      const entries = await ctx.db
        .query("entries")
        .withIndex("by_repo", (q) => q.eq("repoId", repo._id))
        .collect()
      vouched = entries.filter((entry) => entry.type === "vouch").length
      denounced = entries.length - vouched
    }

    return {
      repo,
      snapshot,
      counts: {
        vouched: vouched ?? 0,
        denounced: denounced ?? 0,
      },
    }
  },
})

export const listRepositoryEntriesPaginated = queryGeneric({
  args: {
    slug: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const normalized = normalizeGithubSlug(args.slug)
    const repo = await ctx.db
      .query("repositories")
      .withIndex("by_slug", (q) => q.eq("slug", normalized.slug))
      .unique()

    if (!repo) {
      return emptyPaginationResult()
    }

    const result = await ctx.db
      .query("entries")
      .withIndex("by_repo", (q) => q.eq("repoId", repo._id))
      .paginate(args.paginationOpts)

    return result
  },
})

export const listRepositoryAudit = queryGeneric({
  args: {
    slug: v.string(),
    limit: v.optional(v.number()),
    changeLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeGithubSlug(args.slug)
    const limit = Math.min(Math.max(args.limit ?? 12, 1), 50)
    const changeLimit = Math.min(Math.max(args.changeLimit ?? 20, 1), 50)
    const repo = await ctx.db
      .query("repositories")
      .withIndex("by_slug", (q) => q.eq("slug", normalized.slug))
      .unique()

    if (!repo) {
      return null
    }

    const blocks = await ctx.db
      .query("auditBlocks")
      .withIndex("by_repo_and_indexed", (q) => q.eq("repoId", repo._id))
      .order("desc")
      .take(limit)

    const rows = await Promise.all(
      blocks.map(async (block) => {
        const changes = await ctx.db
          .query("auditChanges")
          .withIndex("by_block", (q) => q.eq("blockId", block._id))
          .take(changeLimit)

        changes.sort((a, b) => {
          if (a.action !== b.action) {
            return a.action.localeCompare(b.action)
          }
          return a.handle.localeCompare(b.handle)
        })

        return {
          block,
          changes,
          hasMoreChanges: block.changeCount > changes.length,
        }
      })
    )

    return {
      repo,
      rows,
    }
  },
})

export const getUserOverview = queryGeneric({
  args: {
    handle: v.string(),
  },
  handler: async (ctx, args) => {
    const parsed = parseUserHandle(args.handle)
    if (!parsed) {
      return null
    }

    const { username, platformFilter } = parsed
    if (platformFilter) {
      const row = await ctx.db
        .query("leaderboardRows")
        .withIndex("by_handle", (q) => q.eq("handle", `${platformFilter}:${username}`))
        .unique()
      if (!row) {
        return null
      }

      return {
        handle: row.handle,
        counts: {
          vouched: row.vouchedCount,
          denounced: row.denouncedCount,
          repositories: row.repositories,
        },
      }
    }

    const rows = await ctx.db
      .query("leaderboardRows")
      .withIndex("by_username", (q) => q.eq("username", username))
      .collect()

    if (rows.length === 0) {
      return null
    }

    let vouched = 0
    let denounced = 0
    let repositories = 0
    for (const row of rows) {
      vouched += row.vouchedCount
      denounced += row.denouncedCount
      repositories += row.repositories
    }

    return {
      handle: username,
      counts: {
        vouched,
        denounced,
        repositories,
      },
    }
  },
})

export const listUserEntriesPaginated = queryGeneric({
  args: {
    handle: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const parsed = parseUserHandle(args.handle)
    if (!parsed) {
      return emptyPaginationResult()
    }

    const { username, platformFilter } = parsed
    const result = platformFilter
      ? await ctx.db
          .query("entries")
          .withIndex("by_handle", (q) => q.eq("handle", `${platformFilter}:${username}`))
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("entries")
          .withIndex("by_username", (q) => q.eq("username", username))
          .paginate(args.paginationOpts)

    const repoSlugById = new Map<string, string>()
    for (const entry of result.page) {
      const repoId = String(entry.repoId)
      if (entry.repoSlug) {
        repoSlugById.set(repoId, entry.repoSlug)
        continue
      }

      if (!repoSlugById.has(repoId)) {
        const repo = await ctx.db.get(entry.repoId)
        if (repo) {
          repoSlugById.set(repoId, repo.slug)
        }
      }
    }

    const rows = result.page
      .map((entry) => {
        const repoSlug = repoSlugById.get(String(entry.repoId))
        if (!repoSlug) {
          return null
        }
        return {
          entry,
          repoSlug,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)

    return {
      ...result,
      page: rows,
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

    const split = raw.split(":", 2)
    const platformFilter = split.length === 2 ? split[0] : null
    const core = split.length === 2 ? split[1] ?? raw : raw
    const username = core.trim()
    if (!username) {
      return []
    }
    if (username.length < 2) {
      return []
    }

    const readLimit = Math.min(Math.max(limit * 10, 30), 120)
    const hits = await ctx.db
      .query("entries")
      .withSearchIndex("search_username", (q) =>
        platformFilter
          ? q.search("username", username).eq("platform", platformFilter)
          : q.search("username", username)
      )
      .take(readLimit)

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

    return rows.map(({ repoIds, ...row }) => ({
      ...row,
      repositories: repoIds.size,
    }))
  },
})

export const rebuildLeaderboardRows = internalMutationGeneric({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const existingLeaderboardRows = await ctx.db.query("leaderboardRows").collect()
    for (const row of existingLeaderboardRows) {
      await ctx.db.delete(row._id)
    }

    const entries = await ctx.db.query("entries").collect()
    const grouped = new Map<
      string,
      {
        platform: string
        username: string
        handle: string
        vouchedCount: number
        denouncedCount: number
        repositories: number
      }
    >()

    for (const entry of entries) {
      const current = grouped.get(entry.handle) ?? {
        platform: entry.platform,
        username: entry.username,
        handle: entry.handle,
        vouchedCount: 0,
        denouncedCount: 0,
        repositories: 0,
      }

      if (entry.type === "vouch") {
        current.vouchedCount += 1
      } else {
        current.denouncedCount += 1
      }
      current.repositories += 1
      grouped.set(entry.handle, current)
    }

    let inserted = 0
    for (const row of grouped.values()) {
      await ctx.db.insert("leaderboardRows", {
        platform: row.platform,
        username: row.username,
        handle: row.handle,
        vouchedCount: row.vouchedCount,
        denouncedCount: row.denouncedCount,
        repositories: row.repositories,
        score: row.vouchedCount - row.denouncedCount,
        updatedAt: now,
      })
      inserted += 1
    }

    return {
      entriesProcessed: entries.length,
      handlesMaterialized: inserted,
    }
  },
})

export const listTopHandles = queryGeneric({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 12, 1), 500)
    const rows = await ctx.db
      .query("leaderboardRows")
      .withIndex("by_score")
      .order("desc")
      .take(limit)

    return rows.map((row) => ({
      platform: row.platform,
      username: row.username,
      handle: row.handle,
      vouchedCount: row.vouchedCount,
      denouncedCount: row.denouncedCount,
      repositories: row.repositories,
      score: row.score,
    }))
  },
})

export const listTopHandlesPaginated = queryGeneric({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("leaderboardRows")
      .withIndex("by_score")
      .order("desc")
      .paginate(args.paginationOpts)

    return {
      ...result,
      page: result.page.map((row) => ({
        platform: row.platform,
        username: row.username,
        handle: row.handle,
        vouchedCount: row.vouchedCount,
        denouncedCount: row.denouncedCount,
        repositories: row.repositories,
        score: row.score,
      })),
    }
  },
})

import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

const RATE_WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 10
const MAX_GLOBAL_REQUESTS_PER_WINDOW = 30
const MAX_REPO_GLOBAL_REQUESTS_PER_WINDOW = 15
const INDEX_LOCK_TIMEOUT_MS = 60_000
const INDEXER_UPSTREAM_TIMEOUT_MS = parsePositiveInteger(
  process.env.INDEXER_UPSTREAM_TIMEOUT_MS,
  15_000
)

type RateBucket = {
  count: number
  resetAt: number
}

type RepoIndexLock = {
  expiresAt: number
}

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

function getIndexerSecret() {
  return process.env.INDEXER_SECRET?.trim() || null
}

function isPublicIndexingEnabled() {
  const raw = process.env.PUBLIC_INDEXING_ENABLED?.trim().toLowerCase()
  if (raw === "true") {
    return true
  }
  if (raw === "false") {
    return false
  }
  return process.env.NODE_ENV !== "production"
}

function parseAllowedOwners() {
  const raw = process.env.PUBLIC_INDEXING_ALLOWED_OWNERS?.trim()
  if (!raw) {
    return null
  }

  const owners = raw
    .split(",")
    .map((owner) => owner.trim().toLowerCase())
    .filter(Boolean)

  return owners.length > 0 ? new Set(owners) : null
}

function normalizeGithubRepoInput(input: string): { owner: string; name: string; slug: string } | null {
  let value = input.trim()
  value = value.replace(/^https?:\/\/github\.com\//i, "")
  value = value.replace(/^github\.com\//i, "")
  value = value.split(/[?#]/, 1)[0] ?? value
  value = value.replace(/\.git$/i, "")
  value = value.replace(/^\/+|\/+$/g, "")

  const parts = value.split("/")
  if (parts.length !== 2) {
    return null
  }

  const owner = parts[0]?.trim().toLowerCase()
  const name = parts[1]?.trim().toLowerCase()
  const validPart = /^[a-z0-9._-]+$/i

  if (!owner || !name || !validPart.test(owner) || !validPart.test(name)) {
    return null
  }

  return { owner, name, slug: `${owner}/${name}` }
}

function getConvexBaseUrl() {
  const raw =
    process.env.CONVEX_HTTP_URL?.trim() || process.env.NEXT_PUBLIC_CONVEX_URL?.trim()
  if (!raw) {
    return null
  }

  try {
    const parsed = new URL(raw)
    const hostname = parsed.hostname.toLowerCase()
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1"
    const allowInsecureLocal = process.env.NODE_ENV !== "production" && isLocalhost
    const allowedHosts = process.env.CONVEX_ALLOWED_HOSTS?.split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean)

    if (parsed.protocol === "http:" && !allowInsecureLocal) {
      return null
    }

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null
    }

    const isConvexCloud =
      hostname.endsWith(".convex.cloud") || hostname.endsWith(".convex.site")
    const isExplicitlyAllowed = allowedHosts?.includes(hostname) ?? false
    if (!isLocalhost && !isConvexCloud && !isExplicitlyAllowed) {
      return null
    }

    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "")
  } catch {
    return null
  }
}

function hasAllowedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (!origin) {
    return true
  }

  try {
    return new URL(origin).origin === request.nextUrl.origin
  } catch {
    return false
  }
}

function getClientIp(request: NextRequest) {
  const cfIp = request.headers.get("cf-connecting-ip")?.trim()
  if (cfIp) {
    return cfIp
  }

  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) {
      return first
    }
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown"
}

function getRateBuckets() {
  const globalWithBuckets = globalThis as typeof globalThis & {
    __repoIndexRateBuckets?: Map<string, RateBucket>
  }
  if (!globalWithBuckets.__repoIndexRateBuckets) {
    globalWithBuckets.__repoIndexRateBuckets = new Map()
  }
  return globalWithBuckets.__repoIndexRateBuckets
}

function getRepoLocks() {
  const globalWithLocks = globalThis as typeof globalThis & {
    __repoIndexLocks?: Map<string, RepoIndexLock>
  }
  if (!globalWithLocks.__repoIndexLocks) {
    globalWithLocks.__repoIndexLocks = new Map()
  }
  return globalWithLocks.__repoIndexLocks
}

function pruneExpiredBuckets(now: number) {
  const buckets = getRateBuckets()
  if (buckets.size < 5_000) {
    return
  }

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }
}

function pruneExpiredLocks(now: number) {
  const locks = getRepoLocks()
  for (const [key, lock] of locks) {
    if (lock.expiresAt <= now) {
      locks.delete(key)
    }
  }
}

function isRateLimited(key: string, now: number, maxRequests: number) {
  const buckets = getRateBuckets()
  const previous = buckets.get(key)
  if (!previous || previous.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + RATE_WINDOW_MS,
    })
    return false
  }

  previous.count += 1
  buckets.set(key, previous)
  return previous.count > maxRequests
}

function acquireRepoLock(repo: string, now: number) {
  const locks = getRepoLocks()
  const lock = locks.get(repo)
  if (lock && lock.expiresAt > now) {
    return false
  }
  locks.set(repo, { expiresAt: now + INDEX_LOCK_TIMEOUT_MS })
  return true
}

function releaseRepoLock(repo: string) {
  getRepoLocks().delete(repo)
}

export async function POST(request: NextRequest) {
  if (!isPublicIndexingEnabled()) {
    return NextResponse.json(
      { message: "Public indexing is disabled on this deployment." },
      { status: 403 }
    )
  }

  if (!hasAllowedOrigin(request)) {
    return NextResponse.json(
      { message: "Cross-origin indexing requests are not allowed." },
      { status: 403 }
    )
  }

  const payload = await request.json().catch(() => null)
  const rawRepo =
    typeof payload === "object" && payload !== null && "repo" in payload
      ? (payload as { repo?: unknown }).repo
      : undefined

  if (typeof rawRepo !== "string" || rawRepo.trim().length === 0 || rawRepo.trim().length > 200) {
    return NextResponse.json({ message: "Expected a non-empty repo string." }, { status: 400 })
  }

  const normalizedRepo = normalizeGithubRepoInput(rawRepo)
  if (!normalizedRepo) {
    return NextResponse.json(
      { message: "Repository must be a valid GitHub owner/repo or GitHub URL." },
      { status: 400 }
    )
  }

  const allowedOwners = parseAllowedOwners()
  if (allowedOwners && !allowedOwners.has(normalizedRepo.owner)) {
    return NextResponse.json(
      { message: `Indexing is restricted to approved owners.` },
      { status: 403 }
    )
  }

  const repo = normalizedRepo.slug
  if (repo.length > 200) {
    return NextResponse.json({ message: "Expected a non-empty repo string." }, { status: 400 })
  }

  const now = Date.now()
  pruneExpiredBuckets(now)
  pruneExpiredLocks(now)
  const ip = getClientIp(request)
  if (isRateLimited(`global:${ip}`, now, MAX_GLOBAL_REQUESTS_PER_WINDOW)) {
    return NextResponse.json(
      { message: "Too many indexing attempts from this IP. Please wait and retry." },
      { status: 429 }
    )
  }

  if (isRateLimited(`repo:${ip}:${repo.trim().toLowerCase()}`, now, MAX_REQUESTS_PER_WINDOW)) {
    return NextResponse.json(
      { message: "Too many indexing attempts. Please wait and retry." },
      { status: 429 }
    )
  }

  if (isRateLimited(`repo-global:${repo}`, now, MAX_REPO_GLOBAL_REQUESTS_PER_WINDOW)) {
    return NextResponse.json(
      { message: "This repository is being indexed too frequently. Please retry in a minute." },
      { status: 429 }
    )
  }

  const secret = getIndexerSecret()
  if (!secret) {
    return NextResponse.json(
      { message: "Indexer secret is not configured. Set INDEXER_SECRET." },
      { status: 503 }
    )
  }

  const convexBaseUrl = getConvexBaseUrl()
  if (!convexBaseUrl) {
    return NextResponse.json(
      { message: "Convex URL is missing or invalid. Set CONVEX_HTTP_URL (recommended)." },
      { status: 503 }
    )
  }

  if (!acquireRepoLock(repo, now)) {
    return NextResponse.json(
      { message: "This repository is already being indexed. Please wait a moment and retry." },
      { status: 409 }
    )
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), INDEXER_UPSTREAM_TIMEOUT_MS)

  try {
    const upstream = await fetch(`${convexBaseUrl}/index-repo`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-indexer-secret": secret,
      },
      body: JSON.stringify({ repo }),
      cache: "no-store",
      signal: controller.signal,
    })

    const result = await upstream.json().catch(() => null)
    if (!upstream.ok) {
      const message =
        typeof result === "object" &&
        result !== null &&
        "message" in result &&
        typeof (result as { message?: unknown }).message === "string"
          ? (result as { message: string }).message
          : "Indexing failed."

      return NextResponse.json({ message }, { status: upstream.status })
    }

    return NextResponse.json(result ?? { message: "Indexing failed." }, { status: 200 })
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { message: "Indexer service timed out. Please retry." },
        { status: 504 }
      )
    }

    return NextResponse.json({ message: "Failed to reach indexer service." }, { status: 502 })
  } finally {
    clearTimeout(timeoutId)
    releaseRepoLock(repo)
  }
}

import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

const RATE_WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 10
const MAX_GLOBAL_REQUESTS_PER_WINDOW = 30

type RateBucket = {
  count: number
  resetAt: number
}

function getIndexerSecret() {
  const explicit = process.env.INDEXER_SECRET?.trim()
  if (explicit) {
    return explicit
  }

  const fallback = process.env.GITHUB_TOKEN?.trim()
  return fallback || null
}

function getConvexBaseUrl() {
  const raw = process.env.NEXT_PUBLIC_CONVEX_URL?.trim()
  if (!raw) {
    return null
  }

  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null
    }
    return raw.replace(/\/+$/, "")
  } catch {
    return null
  }
}

function getClientIp(request: NextRequest) {
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

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null)
  const repo =
    typeof payload === "object" && payload !== null && "repo" in payload
      ? (payload as { repo?: unknown }).repo
      : undefined

  if (typeof repo !== "string" || repo.trim().length === 0 || repo.trim().length > 200) {
    return NextResponse.json({ message: "Expected a non-empty repo string." }, { status: 400 })
  }

  const now = Date.now()
  pruneExpiredBuckets(now)
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

  const secret = getIndexerSecret()
  if (!secret) {
    return NextResponse.json(
      { message: "Indexer secret is not configured on the server." },
      { status: 503 }
    )
  }

  const convexBaseUrl = getConvexBaseUrl()
  if (!convexBaseUrl) {
    return NextResponse.json(
      { message: "NEXT_PUBLIC_CONVEX_URL is missing or invalid." },
      { status: 503 }
    )
  }

  try {
    const upstream = await fetch(`${convexBaseUrl}/index-repo`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-indexer-secret": secret,
      },
      body: JSON.stringify({ repo: repo.trim() }),
      cache: "no-store",
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
  } catch {
    return NextResponse.json({ message: "Failed to reach indexer service." }, { status: 502 })
  }
}

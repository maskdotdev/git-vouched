import { NextRequest, NextResponse } from "next/server"

import { normalizeGithubRepoInput } from "@/lib/github-repo"
import { createRequesterIdentity } from "@/lib/indexer-requester"

export const runtime = "nodejs"

const INDEXER_UPSTREAM_TIMEOUT_MS = parsePositiveInteger(
  process.env.INDEXER_UPSTREAM_TIMEOUT_MS,
  15_000
)
const INDEXER_CLIENT_COOKIE_NAME = "__gv_idx"
const INDEXER_CLIENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365
const INDEXER_CLIENT_ID_PATTERN = /^[a-f0-9]{32}$/i

type ClientIdentifier = {
  value: string
  shouldSetCookie: boolean
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

function generateIndexerClientId() {
  return crypto.randomUUID().replaceAll("-", "")
}

function getClientIdentifier(request: NextRequest): ClientIdentifier {
  const raw = request.cookies.get(INDEXER_CLIENT_COOKIE_NAME)?.value?.trim()
  if (raw && INDEXER_CLIENT_ID_PATTERN.test(raw)) {
    return {
      value: raw.toLowerCase(),
      shouldSetCookie: false,
    }
  }
  return {
    value: generateIndexerClientId(),
    shouldSetCookie: true,
  }
}

function jsonWithClientCookie(
  body: unknown,
  status: number,
  clientIdentifier: ClientIdentifier
) {
  const response = NextResponse.json(body, { status })
  if (!clientIdentifier.shouldSetCookie) {
    return response
  }

  response.cookies.set({
    name: INDEXER_CLIENT_COOKIE_NAME,
    value: clientIdentifier.value,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: INDEXER_CLIENT_COOKIE_MAX_AGE_SECONDS,
  })
  return response
}

export async function POST(request: NextRequest) {
  const clientIdentifier = getClientIdentifier(request)
  const requesterIdentity = createRequesterIdentity(
    request.headers,
    clientIdentifier.value
  )
  const respond = (body: unknown, status: number) =>
    jsonWithClientCookie(body, status, clientIdentifier)

  if (!isPublicIndexingEnabled()) {
    return respond(
      { message: "Public indexing is disabled on this deployment." },
      403
    )
  }

  if (!hasAllowedOrigin(request)) {
    return respond(
      { message: "Cross-origin indexing requests are not allowed." },
      403
    )
  }

  const payload = await request.json().catch(() => null)
  const rawRepo =
    typeof payload === "object" && payload !== null && "repo" in payload
      ? (payload as { repo?: unknown }).repo
      : undefined

  if (typeof rawRepo !== "string" || rawRepo.trim().length === 0 || rawRepo.trim().length > 200) {
    return respond({ message: "Expected a non-empty repo string." }, 400)
  }

  const normalizedRepo = normalizeGithubRepoInput(rawRepo)
  if (!normalizedRepo) {
    return respond(
      { message: "Repository must be a valid GitHub owner/repo or GitHub URL." },
      400
    )
  }

  const allowedOwners = parseAllowedOwners()
  if (allowedOwners && !allowedOwners.has(normalizedRepo.owner)) {
    return respond(
      { message: `Indexing is restricted to approved owners.` },
      403
    )
  }

  const repo = normalizedRepo.slug
  if (repo.length > 200) {
    return respond({ message: "Expected a non-empty repo string." }, 400)
  }

  const secret = getIndexerSecret()
  if (!secret) {
    return respond(
      { message: "Indexer secret is not configured. Set INDEXER_SECRET." },
      503
    )
  }

  const convexBaseUrl = getConvexBaseUrl()
  if (!convexBaseUrl) {
    return respond(
      { message: "Convex URL is missing or invalid. Set CONVEX_HTTP_URL (recommended)." },
      503
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
        "x-indexer-client": requesterIdentity,
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

      return respond({ message }, upstream.status)
    }

    return respond(result ?? { message: "Indexing failed." }, 200)
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return respond(
        { message: "Indexer service timed out. Please retry." },
        504
      )
    }

    return respond({ message: "Failed to reach indexer service." }, 502)
  } finally {
    clearTimeout(timeoutId)
  }
}

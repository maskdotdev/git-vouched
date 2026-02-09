import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { NextRequest } from "next/server"

import { POST } from "@/app/api/index/route"

const ORIGINAL_ENV = { ...process.env }
const ORIGINAL_FETCH = globalThis.fetch
const VALID_COOKIE = "0123456789abcdef0123456789abcdef"

function resetEnv() {
  process.env = { ...ORIGINAL_ENV }
}

function createRequest({
  origin = "https://app.example",
  repo = "Owner/Repo",
  cookie,
}: {
  origin?: string
  repo?: string
  cookie?: string
}) {
  const headers = new Headers({
    "content-type": "application/json",
    origin,
  })
  if (cookie) {
    headers.set("cookie", cookie)
  }

  return new NextRequest("https://app.example/api/index", {
    method: "POST",
    headers,
    body: JSON.stringify({ repo }),
  })
}

describe("POST /api/index", () => {
  beforeEach(() => {
    resetEnv()
    process.env.NODE_ENV = "production"
    process.env.PUBLIC_INDEXING_ENABLED = "true"
    process.env.INDEXER_SECRET = "topsecret"
    process.env.CONVEX_HTTP_URL = "https://happy-animal-123.convex.cloud"
    globalThis.fetch = ORIGINAL_FETCH
  })

  afterEach(() => {
    resetEnv()
    globalThis.fetch = ORIGINAL_FETCH
  })

  it("rejects when public indexing is disabled", async () => {
    process.env.PUBLIC_INDEXING_ENABLED = "false"

    const response = await POST(createRequest({}))
    expect(response.status).toBe(403)

    const body = await response.json()
    expect(body.message).toContain("disabled")
  })

  it("rejects cross-origin requests", async () => {
    const response = await POST(
      createRequest({
        origin: "https://evil.example",
      })
    )

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.message).toContain("Cross-origin")
  })

  it("forwards normalized repo to convex and sets client cookie", async () => {
    const fetchMock = mock(async () => {
      return Response.json({
        status: "indexed",
        slug: "owner/repo",
        filePath: "VOUCHED.td",
        entriesIndexed: 4,
        changesDetected: 2,
        auditRecorded: true,
        auditHeight: 3,
      })
    })
    globalThis.fetch = fetchMock as typeof fetch

    const response = await POST(createRequest({ repo: "https://github.com/Owner/Repo" }))
    expect(response.status).toBe(200)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://happy-animal-123.convex.cloud/index-repo")
    expect(init.method).toBe("POST")

    const payload = JSON.parse(String(init.body))
    expect(payload).toEqual({ repo: "owner/repo" })
    expect(response.headers.get("set-cookie")).toContain("__gv_idx=")
  })

  it("does not rotate cookie when client id cookie is valid", async () => {
    const fetchMock = mock(async () => {
      return Response.json({
        status: "indexed",
        slug: "owner/repo",
        filePath: "VOUCHED.td",
        entriesIndexed: 0,
        changesDetected: 0,
        auditRecorded: false,
        skippedNoChanges: true,
      })
    })
    globalThis.fetch = fetchMock as typeof fetch

    const response = await POST(
      createRequest({
        repo: "owner/repo",
        cookie: `__gv_idx=${VALID_COOKIE}`,
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("set-cookie")).toBeNull()
  })
})

import { createHash } from "node:crypto"

import { describe, expect, it } from "bun:test"

import {
  createRequesterIdentity,
  getClientIpFromHeaders,
} from "@/lib/indexer-requester"

describe("indexer requester identity", () => {
  it("extracts a client IP from forwarded headers", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.20, 10.0.0.8",
    })

    expect(getClientIpFromHeaders(headers)).toBe("203.0.113.20")
  })

  it("hashes the IP into a stable requester identity", () => {
    const headers = new Headers({
      "x-real-ip": "198.51.100.10",
    })
    const expectedHash = createHash("sha256")
      .update("198.51.100.10")
      .digest("hex")

    expect(createRequesterIdentity(headers, "fallback-id")).toBe(`ip:${expectedHash}`)
  })

  it("falls back to cookie identity when no network address exists", () => {
    const headers = new Headers()

    expect(createRequesterIdentity(headers, "abcdef1234")).toBe("cookie:abcdef1234")
  })
})

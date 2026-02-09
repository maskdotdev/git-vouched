import { createHash } from "node:crypto"

const VALID_IPV4_OCTET = "(25[0-5]|2[0-4]\\d|1?\\d?\\d)"
const IPV4_WITH_PORT_PATTERN = new RegExp(
  `^(${VALID_IPV4_OCTET}(?:\\.${VALID_IPV4_OCTET}){3})(?::\\d{1,5})?$`,
  "i"
)
const VALID_IPV6_PATTERN = /^[0-9a-f:]+$/i

function normalizeCandidateIp(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed || trimmed === "unknown") {
    return null
  }

  let candidate = trimmed.split(",")[0]?.trim() ?? ""
  if (!candidate) {
    return null
  }

  const bracketed = candidate.match(/^\[([^[\]]+)\](?::\d{1,5})?$/)
  if (bracketed?.[1]) {
    candidate = bracketed[1]
  }

  const ipv4 = candidate.match(IPV4_WITH_PORT_PATTERN)?.[1]
  if (ipv4) {
    return ipv4
  }

  candidate = candidate.replace(/%.+$/, "")
  if (candidate.includes(":") && VALID_IPV6_PATTERN.test(candidate)) {
    return candidate
  }

  return null
}

export function getClientIpFromHeaders(headers: Headers): string | null {
  const candidates = [
    headers.get("x-vercel-forwarded-for"),
    headers.get("cf-connecting-ip"),
    headers.get("x-real-ip"),
    headers.get("x-forwarded-for"),
  ]

  for (const value of candidates) {
    if (!value) continue
    const normalized = normalizeCandidateIp(value)
    if (normalized) {
      return normalized
    }
  }

  return null
}

export function createRequesterIdentity(headers: Headers, fallbackClientId: string): string {
  const ip = getClientIpFromHeaders(headers)
  if (ip) {
    const digest = createHash("sha256").update(ip).digest("hex")
    return `ip:${digest}`
  }
  return `cookie:${fallbackClientId}`
}

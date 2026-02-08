export function getValidConvexUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_CONVEX_URL?.trim()
  if (!raw) {
    return null
  }

  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null
    }
    return raw
  } catch {
    return null
  }
}

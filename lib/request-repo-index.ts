import { type IndexRepoResult } from "@/convex/api"

const INDEX_REQUEST_TIMEOUT_MS = 20_000

export async function requestRepoIndex(repo: string): Promise<IndexRepoResult> {
  const normalizedRepo = repo.trim()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), INDEX_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch("/api/index", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ repo: normalizedRepo }),
      signal: controller.signal,
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const message =
        typeof payload === "object" &&
        payload !== null &&
        "message" in payload &&
        typeof (payload as { message?: unknown }).message === "string"
          ? (payload as { message: string }).message
          : "Indexing failed."

      return {
        status: "error",
        slug: normalizedRepo,
        message,
      }
    }

    return payload as IndexRepoResult
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        status: "error",
        slug: normalizedRepo,
        message: "Indexing timed out. Please retry.",
      }
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

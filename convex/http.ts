import { httpRouter } from "convex/server"

import { httpAction } from "./_generated/server"
import { internalApi } from "./api"

const http = httpRouter()

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  })
}

function getIndexerSecret() {
  const explicit = process.env.INDEXER_SECRET?.trim()
  if (explicit) {
    return explicit
  }

  const fallback = process.env.GITHUB_TOKEN?.trim()
  return fallback || null
}

http.route({
  path: "/index-repo",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const configuredSecret = getIndexerSecret()
    if (!configuredSecret) {
      return json(
        {
          message:
            "Indexer secret is not configured. Set INDEXER_SECRET (recommended) or GITHUB_TOKEN.",
        },
        503
      )
    }

    const providedSecret = request.headers.get("x-indexer-secret")?.trim()
    if (!providedSecret || providedSecret !== configuredSecret) {
      return json({ message: "Unauthorized." }, 401)
    }

    const payload = await request.json().catch(() => null)
    const repo =
      typeof payload === "object" && payload !== null && "repo" in payload
        ? (payload as { repo?: unknown }).repo
        : undefined

    if (typeof repo !== "string" || repo.trim().length === 0 || repo.trim().length > 200) {
      return json({ message: "Expected a non-empty repo string." }, 400)
    }

    try {
      const result = await ctx.runAction(internalApi.vouch.indexGithubRepo, {
        repo,
        allowAuthenticatedGithub: false,
      })
      return json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Indexing failed."
      return json({ message }, 500)
    }
  }),
})

export default http

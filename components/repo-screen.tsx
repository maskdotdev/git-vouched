"use client"

import Link from "next/link"
import { useAction, useQuery } from "convex/react"
import { DatabaseZap } from "lucide-react"
import { useState, useTransition } from "react"

import { api, RepositoryOverview } from "@/convex/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type RepoScreenProps = {
  slug: string
}

export function RepoScreen({ slug }: RepoScreenProps) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-10">
        <Card className="w-full max-w-xl border-slate-200 bg-white/90">
          <CardHeader>
            <CardTitle>Convex is not configured</CardTitle>
            <CardDescription>
              Set <code>NEXT_PUBLIC_CONVEX_URL</code> to load repository trust data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/" className="text-sm font-medium text-slate-700 underline">
              Back to home
            </Link>
          </CardContent>
        </Card>
      </main>
    )
  }

  return <RepoScreenConfigured slug={slug} />
}

function RepoScreenConfigured({ slug }: RepoScreenProps) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  const data = useQuery(api.vouch.getRepository, { slug }) as RepositoryOverview | undefined
  const indexRepo = useAction(api.vouch.indexGithubRepo)

  const handleReindex = () => {
    startTransition(async () => {
      setMessage(null)
      try {
        const result = await indexRepo({ repo: slug })
        setMessage(
          result.status === "indexed"
            ? `Indexed ${result.entriesIndexed} entries from ${result.filePath}.`
            : result.message ?? "Re-index failed."
        )
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Re-index failed.")
      }
    })
  }

  if (data === undefined) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-10">
        <p className="text-slate-600">Loading repository...</p>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-10">
        <Card className="w-full max-w-xl border-slate-200 bg-white/90">
          <CardHeader>
            <CardTitle>Repository not indexed</CardTitle>
            <CardDescription>
              Index this repository from the home page to view trust entries.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/" className="text-sm font-medium text-slate-700 underline">
              Back to home
            </Link>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="rounded-3xl border border-slate-200 bg-white/90 p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.12em] text-slate-500 uppercase">Repository</p>
            <h1 className="mt-1 font-[var(--font-display)] text-4xl font-semibold text-slate-900">
              {data.repo.slug}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Source file:{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                {data.repo.defaultBranch}:{data.snapshot?.filePath ?? "VOUCHED.td"}
              </code>
            </p>
          </div>
          <Button
            onClick={handleReindex}
            disabled={isPending}
            className="bg-amber-700 text-white hover:bg-amber-600"
          >
            <DatabaseZap className="size-4" />
            {isPending ? "Indexing..." : "Re-index"}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
            {data.counts.vouched} vouched
          </span>
          <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-700">
            {data.counts.denounced} denounced
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-slate-700">
            Status: {data.repo.status}
          </span>
        </div>

        {message ? <p className="mt-3 text-sm text-slate-700">{message}</p> : null}
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {data.entries.map((entry) => (
          <Card key={entry._id} className="border-slate-200 bg-white/90">
            <CardHeader>
              <CardTitle className="text-lg text-slate-900">{entry.handle}</CardTitle>
              <CardDescription className="capitalize">{entry.type}</CardDescription>
            </CardHeader>
            <CardContent>
              {entry.details ? (
                <p className="text-sm text-slate-700">{entry.details}</p>
              ) : (
                <p className="text-sm text-slate-500">No note provided.</p>
              )}
              <Link
                href={`/u/${encodeURIComponent(entry.handle)}`}
                className="mt-3 inline-block text-sm font-medium text-slate-700 underline"
              >
                View handle
              </Link>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  )
}

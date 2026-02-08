"use client"

import Link from "next/link"
import { useAction, useQuery } from "convex/react"
import { ArrowLeft, ArrowRight, DatabaseZap, Fingerprint, GitBranch, ShieldCheck, ShieldOff } from "lucide-react"
import { useState, useTransition } from "react"

import { type RepositoryOverview, api } from "@/convex/api"
import { Button } from "@/components/ui/button"
import { getValidConvexUrl } from "@/lib/convex-url"

type RepoScreenProps = {
  slug: string
}

export function RepoScreen({ slug }: RepoScreenProps) {
  if (!getValidConvexUrl()) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-10">
        <div className="card-paper w-full max-w-xl rounded-xl p-8">
          <h2 className="font-[var(--font-display)] text-xl font-semibold text-foreground">
            Convex is not configured
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Set <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_CONVEX_URL</code>{" "}
            to an absolute URL to load repository trust data.
          </p>
          <Link href="/" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent transition hover:text-accent/80">
            <ArrowLeft className="size-3.5" /> Back to home
          </Link>
        </div>
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
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-10">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="text-sm">Loading repository&hellip;</span>
        </div>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-10">
        <div className="card-paper w-full max-w-xl rounded-xl p-8 text-center">
          <Fingerprint className="mx-auto size-8 text-muted-foreground/40" />
          <h2 className="mt-4 font-[var(--font-display)] text-xl font-semibold text-foreground">
            Repository not indexed
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Index this repository from the home page to view its trust entries.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-accent transition hover:text-accent/80"
          >
            <ArrowLeft className="size-3.5" /> Back to home
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-14 md:px-10">

      {/* ─── Breadcrumb ─── */}
      <nav>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase transition hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          All repositories
        </Link>
      </nav>

      {/* ─── Header ─── */}
      <header className="panel-elevated rounded-2xl px-8 py-8 md:px-10 md:py-10">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Repository
            </p>
            <h1 className="font-[var(--font-display)] text-3xl font-medium tracking-tight text-foreground italic md:text-4xl">
              {data.repo.slug}
            </h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <GitBranch className="size-3.5" />
              <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                {data.repo.defaultBranch}:{data.snapshot?.filePath ?? "VOUCHED.td"}
              </code>
            </div>
          </div>
          <Button
            onClick={handleReindex}
            disabled={isPending}
            className="h-10 gap-2 rounded-lg bg-accent px-5 text-accent-foreground hover:bg-accent/90"
          >
            <DatabaseZap className="size-3.5" />
            {isPending ? "Indexing\u2026" : "Re-index"}
          </Button>
        </div>

        <hr className="rule-ornament my-6" />

        <div className="flex flex-wrap items-center gap-3">
          <span className="pill-vouch rounded-full px-3 py-1 text-xs font-semibold">
            {data.counts.vouched} vouched
          </span>
          <span className="pill-denounce rounded-full px-3 py-1 text-xs font-semibold">
            {data.counts.denounced} denounced
          </span>
          <span className="pill-neutral rounded-full px-3 py-1 text-xs font-semibold">
            Status: {data.repo.status}
          </span>
        </div>

        {message ? (
          <p className="mt-4 text-sm text-muted-foreground">{message}</p>
        ) : null}
      </header>

      {/* ─── Entries Grid ─── */}
      <section>
        <h2 className="mb-5 font-[var(--font-display)] text-lg font-semibold text-foreground">
          Trust entries
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {data.entries.map((entry, i) => (
            <Link
              key={entry._id}
              href={`/u/${encodeURIComponent(entry.handle)}`}
              className="animate-rise card-paper group rounded-xl p-5 transition-all hover:shadow-md"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  {entry.type === "vouch" ? (
                    <ShieldCheck className="size-4 text-chart-2 shrink-0" />
                  ) : (
                    <ShieldOff className="size-4 text-destructive shrink-0" />
                  )}
                  <span className="font-mono text-sm font-medium text-foreground">
                    {entry.handle}
                  </span>
                </div>
                <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5 shrink-0 mt-0.5" />
              </div>
              <span
                className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase ${
                  entry.type === "vouch" ? "pill-vouch" : "pill-denounce"
                }`}
              >
                {entry.type}
              </span>
              {entry.details ? (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {entry.details}
                </p>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground/50 italic">No note provided.</p>
              )}
            </Link>
          ))}
        </div>
        {data.entries.length === 0 && (
          <div className="card-paper rounded-xl border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">No trust entries found in this repository.</p>
          </div>
        )}
      </section>
    </main>
  )
}

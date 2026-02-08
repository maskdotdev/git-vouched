"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAction, useQuery } from "convex/react"
import {
  ArrowRight,
  BookOpen,
  DatabaseZap,
  Fingerprint,
  Search,
  Trophy,
} from "lucide-react"
import { type FormEvent, useState, useTransition } from "react"

import { type IndexRepoResult, type RepositoryDoc, api } from "@/convex/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getValidConvexUrl } from "@/lib/convex-url"

function normalizeHandle(input: string) {
  return input.trim().replace(/^@/, "")
}

export function HomeScreen() {
  if (!getValidConvexUrl()) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6 py-12">
        <div className="card-paper w-full rounded-xl p-8">
          <h2 className="font-[var(--font-display)] text-xl font-semibold text-ink">
            Convex is not configured
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Set <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_CONVEX_URL</code>{" "}
            to an absolute URL in <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">.env.local</code>{" "}
            and run <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">bun run convex:dev</code>.
          </p>
        </div>
      </main>
    )
  }

  return <HomeScreenConfigured />
}

function HomeScreenConfigured() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [repoInput, setRepoInput] = useState("")
  const [indexResult, setIndexResult] = useState<IndexRepoResult | null>(null)
  const [isPending, startTransition] = useTransition()
  const normalizedSearch = normalizeHandle(search)

  const recentRepos = (useQuery(api.vouch.listRecentRepos, { limit: 12 }) ?? []) as RepositoryDoc[]
  const searchMatches =
    useQuery(
      api.vouch.searchHandles,
      normalizedSearch ? { query: normalizedSearch, limit: 8 } : "skip"
    ) ?? []
  const leaderboard = useQuery(api.vouch.listTopHandles, { limit: 12 }) ?? []
  const indexRepo = useAction(api.vouch.indexGithubRepo)

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const handle = normalizedSearch
    if (!handle) return
    router.push(`/u/${encodeURIComponent(handle)}`)
  }

  const handleIndex = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!repoInput.trim()) return

    startTransition(async () => {
      try {
        const result = await indexRepo({ repo: repoInput })
        setIndexResult(result)
      } catch (error) {
        setIndexResult({
          status: "error",
          slug: repoInput,
          message: error instanceof Error ? error.message : "Indexing failed.",
        })
      }
    })
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-10 px-6 py-14 md:px-10">

      {/* ─── Nav Ribbon ─────────────────────────────────── */}
      <nav className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg border border-border bg-primary text-primary-foreground">
            <Fingerprint className="size-4" />
          </div>
          <span className="font-[var(--font-display)] text-lg font-semibold tracking-tight text-foreground">
            Git Vouched
          </span>
        </div>
        <a
          href="https://github.com/mitchellh/vouch"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:text-foreground"
        >
          <BookOpen className="size-3.5" />
          Docs
        </a>
      </nav>

      {/* ─── Hero ───────────────────────────────────────── */}
      <section className="panel-elevated rounded-2xl px-8 py-10 md:px-12 md:py-14">

        {/* ─── Search + Index Forms ─── */}
        <div className="grid gap-6 md:grid-cols-2">
          <form onSubmit={handleSearch} className="space-y-3">
            <label htmlFor="search-handle" className="block text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Search handle
            </label>
            <div className="flex gap-2">
              <Input
                id="search-handle"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="alice or github:alice"
                className="h-11 rounded-lg border-border bg-card font-mono text-sm placeholder:text-muted-foreground/60"
              />
              <Button type="submit" className="h-11 gap-2 rounded-lg bg-primary px-5 text-primary-foreground hover:bg-primary/90">
                <Search className="size-3.5" />
                Find
              </Button>
            </div>
          </form>

          <form onSubmit={handleIndex} className="space-y-3">
            <label htmlFor="index-repo" className="block text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Index a repository
            </label>
            <div className="flex gap-2">
              <Input
                id="index-repo"
                value={repoInput}
                onChange={(event) => setRepoInput(event.target.value)}
                placeholder="owner/repo or GitHub URL"
                className="h-11 rounded-lg border-border bg-card font-mono text-sm placeholder:text-muted-foreground/60"
              />
              <Button
                type="submit"
                disabled={isPending}
                className="h-11 gap-2 rounded-lg bg-accent px-5 text-accent-foreground hover:bg-accent/90"
              >
                <DatabaseZap className="size-3.5" />
                {isPending ? "Indexing\u2026" : "Index"}
              </Button>
            </div>
            {indexResult ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {indexResult.status === "indexed" ? (
                  <>
                    Indexed{" "}
                    <strong className="text-foreground">{indexResult.slug}</strong>{" "}
                    from{" "}
                    <code className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
                      {indexResult.filePath}
                    </code>{" "}
                    ({indexResult.entriesIndexed} entries).{" "}
                    <Link
                      className="font-medium text-accent underline decoration-accent/40 underline-offset-2 transition hover:decoration-accent"
                      href={`/r/${indexResult.slug}`}
                    >
                      View repo &rarr;
                    </Link>
                  </>
                ) : (
                  <>
                    <strong className="text-foreground">{indexResult.slug}</strong>:{" "}
                    {indexResult.message ?? "Indexing did not succeed."}
                  </>
                )}
              </p>
            ) : null}
          </form>
        </div>
      </section>

      {/* ─── Search Preview ─────────────────────────────── */}
      {normalizedSearch ? (
        <section className="panel-elevated rounded-2xl p-6 md:p-8">
          <h2 className="mb-5 flex items-center gap-2 font-[var(--font-display)] text-xl font-semibold text-foreground">
            <Search className="size-4 text-ring" />
            Search preview
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {searchMatches.map((row, i) => (
              <Link
                key={row.handle}
                href={`/u/${encodeURIComponent(row.handle)}`}
                className="animate-rise card-paper group rounded-xl p-5 transition-all hover:shadow-md"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <p className="font-mono text-sm font-medium text-foreground group-hover:text-accent transition-colors">
                  {row.handle}
                </p>
                <p className="mt-1 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                  {row.repositories} repo{row.repositories !== 1 && "s"}
                </p>
                <div className="mt-3 flex gap-2 text-xs">
                  <span className="pill-vouch rounded-full px-2 py-0.5 font-medium">
                    {row.vouchedCount} vouched
                  </span>
                  {row.denouncedCount > 0 && (
                    <span className="pill-denounce rounded-full px-2 py-0.5 font-medium">
                      {row.denouncedCount} denounced
                    </span>
                  )}
                </div>
              </Link>
            ))}
            {searchMatches.length === 0 ? (
              <p className="col-span-full text-sm text-muted-foreground">No matching handles yet.</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ─── Leaderboard ───────────────────────────────── */}
      <section className="panel-elevated rounded-2xl p-6 md:p-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-[var(--font-display)] text-xl font-semibold text-foreground">
            <Trophy className="size-4 text-ring" />
            Leaderboard
          </h2>
          <span className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            {leaderboard.length} handles
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {leaderboard.map((row, i) => (
            <Link
              key={row.handle}
              href={`/u/${encodeURIComponent(row.handle)}`}
              className="animate-rise card-paper group rounded-xl p-5 transition-all hover:shadow-md"
              style={{ animationDelay: `${i * 45}ms` }}
            >
              <div className="flex items-start justify-between">
                <span className="pill-neutral rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-[0.08em] uppercase">
                  #{i + 1}
                </span>
                <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5" />
              </div>
              <p className="mt-3 font-mono text-sm font-medium text-foreground group-hover:text-accent transition-colors">
                {row.handle}
              </p>
              <p className="mt-1 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                {row.repositories} repo{row.repositories !== 1 && "s"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="pill-vouch rounded-full px-2 py-0.5 font-medium">
                  {row.vouchedCount} vouched
                </span>
                {row.denouncedCount > 0 ? (
                  <span className="pill-denounce rounded-full px-2 py-0.5 font-medium">
                    {row.denouncedCount} denounced
                  </span>
                ) : null}
                <span className="pill-neutral rounded-full px-2 py-0.5 font-medium">
                  score {row.score >= 0 ? "+" : ""}
                  {row.score}
                </span>
              </div>
            </Link>
          ))}
          {leaderboard.length === 0 ? (
            <div className="col-span-full card-paper rounded-xl border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No indexed trust entries yet. Index a repository to populate the leaderboard.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {/* ─── Recently Indexed Repos ─────────────────────── */}
      <section className="panel-elevated rounded-2xl p-6 md:p-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-[var(--font-display)] text-xl font-semibold text-foreground">
            Recently indexed
          </h2>
          <span className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            {recentRepos.length} repositories
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recentRepos.map((repo, i) => (
            <Link
              key={repo._id}
              href={`/r/${repo.slug}`}
              className="animate-rise card-paper group flex flex-col justify-between rounded-xl p-5 transition-all hover:shadow-md"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase ${repo.status === "indexed"
                      ? "pill-vouch"
                      : repo.status === "error"
                        ? "pill-denounce"
                        : "pill-neutral"
                      }`}
                  >
                    {repo.status}
                  </span>
                  <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5" />
                </div>
                <p className="mt-3 font-mono text-sm font-medium text-foreground">
                  {repo.slug}
                </p>
              </div>
              {repo.lastError ? (
                <p className="mt-3 line-clamp-2 text-xs text-destructive">{repo.lastError}</p>
              ) : null}
            </Link>
          ))}
          {recentRepos.length === 0 ? (
            <div className="col-span-full card-paper rounded-xl border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No repositories indexed yet. Start by indexing a repo that has a{" "}
                <code className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
                  VOUCHED.td
                </code>{" "}
                file.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {/* ─── Footer ─────────────────────────────────────── */}
      <footer className="pb-4 text-center">
        <hr className="rule-ornament mb-6" />
        <p className="text-xs text-muted-foreground">
          Built on{" "}
          <a
            href="https://github.com/mitchellh/vouch"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline decoration-border underline-offset-2 transition hover:decoration-accent"
          >
            Vouch
          </a>{" "}
          by Mitchell Hashimoto &middot; Repository files are the source of truth
        </p>
      </footer>
    </main>
  )
}

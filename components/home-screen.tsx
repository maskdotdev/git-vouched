"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAction, useQuery } from "convex/react"
import { Compass, DatabaseZap, Search, ShieldCheck } from "lucide-react"
import { FormEvent, useState, useTransition } from "react"

import { api, IndexRepoResult, RepositoryDoc } from "@/convex/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

function normalizeHandle(input: string) {
  return input.trim().replace(/^@/, "")
}

export function HomeScreen() {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6 py-12">
        <Card className="w-full border-slate-200 bg-white/90">
          <CardHeader>
            <CardTitle>Convex is not configured</CardTitle>
            <CardDescription>
              Set <code>NEXT_PUBLIC_CONVEX_URL</code> in{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5">.env.local</code> and run{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5">bun run convex:dev</code>.
            </CardDescription>
          </CardHeader>
        </Card>
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
  const indexRepo = useAction(api.vouch.indexGithubRepo)

  const indexed = recentRepos.filter((repo) => repo.status === "indexed").length
  const stats = {
    indexed,
    tracked: recentRepos.length,
  }

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
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-12 md:px-10">
      <section className="rounded-3xl border border-slate-200/70 bg-white/85 p-8 shadow-[0_16px_44px_-28px_rgba(15,23,42,0.65)] backdrop-blur md:p-10">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div className="space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-amber-400/60 bg-amber-100/60 px-3 py-1 text-xs tracking-[0.08em] text-amber-900 uppercase">
              <Compass className="size-3.5" />
              Vouch Discovery
            </p>
            <h1 className="max-w-2xl font-[var(--font-display)] text-4xl leading-[1.1] font-semibold tracking-tight text-slate-900 md:text-5xl">
              A read-only map of who projects vouch for.
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-slate-600">
              Keep repository files as the source of truth. This site just indexes and surfaces
              them.
            </p>
          </div>
          <div className="grid min-w-[220px] grid-cols-2 gap-3 text-center">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-2xl font-semibold text-slate-900">{stats.tracked}</p>
              <p className="text-xs tracking-wide text-slate-500 uppercase">Tracked repos</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-2xl font-semibold text-slate-900">{stats.indexed}</p>
              <p className="text-xs tracking-wide text-slate-500 uppercase">Indexed</p>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <form onSubmit={handleSearch} className="rounded-2xl border border-slate-200 bg-white p-4">
            <label className="mb-2 block text-sm font-medium text-slate-700">Search handle</label>
            <div className="flex gap-2">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="alice or github:alice"
                className="h-10"
              />
              <Button type="submit" className="h-10 bg-slate-900 hover:bg-slate-800">
                <Search className="size-4" />
                Find
              </Button>
            </div>
          </form>

          <form onSubmit={handleIndex} className="rounded-2xl border border-slate-200 bg-white p-4">
            <label className="mb-2 block text-sm font-medium text-slate-700">Index repository</label>
            <div className="flex gap-2">
              <Input
                value={repoInput}
                onChange={(event) => setRepoInput(event.target.value)}
                placeholder="owner/repo or GitHub URL"
                className="h-10"
              />
              <Button type="submit" disabled={isPending} className="h-10 bg-amber-700 hover:bg-amber-600">
                <DatabaseZap className="size-4" />
                {isPending ? "Indexing..." : "Index"}
              </Button>
            </div>
            {indexResult ? (
              <p className="mt-3 text-sm text-slate-600">
                {indexResult.status === "indexed" ? (
                  <>
                    Indexed <strong>{indexResult.slug}</strong> from{" "}
                    <code className="rounded bg-slate-100 px-1 py-0.5">{indexResult.filePath}</code>
                    {" ("}
                    {indexResult.entriesIndexed} entries).{" "}
                    <Link
                      className="underline decoration-slate-300 hover:decoration-slate-700"
                      href={`/r/${indexResult.slug}`}
                    >
                      View repo
                    </Link>
                  </>
                ) : (
                  <>
                    <strong>{indexResult.slug}</strong>: {indexResult.message ?? "Indexing did not succeed."}
                  </>
                )}
              </p>
            ) : null}
          </form>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-slate-200 bg-white/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <ShieldCheck className="size-4 text-emerald-700" />
              Zero lock-in
            </CardTitle>
            <CardDescription>Repository files remain canonical.</CardDescription>
          </CardHeader>
        </Card>
        <Card className="border-slate-200 bg-white/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <Search className="size-4 text-sky-700" />
              Fast lookup
            </CardTitle>
            <CardDescription>See where a user is vouched or denounced.</CardDescription>
          </CardHeader>
        </Card>
        <Card className="border-slate-200 bg-white/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <DatabaseZap className="size-4 text-amber-700" />
              Light touch
            </CardTitle>
            <CardDescription>No account required for discovery.</CardDescription>
          </CardHeader>
        </Card>
      </section>

      {normalizedSearch ? (
        <section className="rounded-3xl border border-slate-200/70 bg-white/85 p-6">
          <h2 className="mb-4 font-[var(--font-display)] text-2xl font-semibold text-slate-900">
            Search preview
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {searchMatches.map((row) => (
              <Link
                key={row.handle}
                href={`/u/${encodeURIComponent(row.handle)}`}
                className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
              >
                <p className="text-base font-semibold text-slate-900">{row.handle}</p>
                <p className="mt-1 text-xs text-slate-500 uppercase">
                  {row.repositories} repositories
                </p>
                <p className="mt-2 text-sm text-emerald-700">{row.vouchedCount} vouched</p>
                <p className="text-sm text-rose-700">{row.denouncedCount} denounced</p>
              </Link>
            ))}
            {searchMatches.length === 0 ? (
              <p className="col-span-full text-sm text-slate-600">No matching handles yet.</p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-slate-200/70 bg-white/85 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-[var(--font-display)] text-2xl font-semibold text-slate-900">
            Recently indexed repositories
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recentRepos.map((repo) => (
            <Link
              key={repo._id}
              href={`/r/${repo.slug}`}
              className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
            >
              <p className="text-sm tracking-wider text-slate-500 uppercase">{repo.status}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{repo.slug}</p>
              {repo.lastError ? <p className="mt-2 text-sm text-rose-600">{repo.lastError}</p> : null}
            </Link>
          ))}
          {recentRepos.length === 0 ? (
            <Card className="col-span-full border-dashed border-slate-300 bg-white/70">
              <CardContent className="py-8 text-sm text-slate-600">
                No repositories indexed yet. Start with a repo that already has a `VOUCHED.td`
                file.
              </CardContent>
            </Card>
          ) : null}
        </div>
      </section>
    </main>
  )
}

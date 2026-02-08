"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import { ArrowLeft, ArrowRight, Fingerprint, ShieldCheck, ShieldOff } from "lucide-react"

import { api } from "@/convex/api"
import { getValidConvexUrl } from "@/lib/convex-url"

type UserScreenProps = {
  handle: string
}

export function UserScreen({ handle }: UserScreenProps) {
  if (!getValidConvexUrl()) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-10">
        <div className="card-paper w-full max-w-xl rounded-xl p-8">
          <h2 className="font-[var(--font-display)] text-xl font-semibold text-foreground">
            Convex is not configured
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Set <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_CONVEX_URL</code>{" "}
            to an absolute URL to load user trust data.
          </p>
          <Link href="/" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent transition hover:text-accent/80">
            <ArrowLeft className="size-3.5" /> Back to home
          </Link>
        </div>
      </main>
    )
  }

  return <UserScreenConfigured handle={handle} />
}

function UserScreenConfigured({ handle }: UserScreenProps) {
  const data = useQuery(api.vouch.getUserOverview, { handle })

  if (data === undefined) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-10">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="text-sm">Loading user profile&hellip;</span>
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
            No records found
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This handle is not in any indexed trust list yet.
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

  const vouchCount = data.counts.vouched
  const denounceCount = data.counts.denounced
  const totalRepos = data.counts.repositories

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-14 md:px-10">

      {/* ─── Breadcrumb ─── */}
      <nav>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase transition hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          Home
        </Link>
      </nav>

      {/* ─── Header ─── */}
      <header className="panel-elevated rounded-2xl px-8 py-8 md:px-10 md:py-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Handle
            </p>
            <h1 className="font-[var(--font-display)] text-3xl font-medium tracking-tight text-foreground italic md:text-4xl">
              {data.handle}
            </h1>
          </div>

          {/* Quick Stats */}
          <div className="flex gap-6">
            <div className="text-center">
              <p className="font-[var(--font-display)] text-3xl font-medium tabular-nums text-chart-2">
                {vouchCount}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Vouched
              </p>
            </div>
            <div className="h-10 w-px self-center bg-border" />
            <div className="text-center">
              <p className="font-[var(--font-display)] text-3xl font-medium tabular-nums text-destructive">
                {denounceCount}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Denounced
              </p>
            </div>
            <div className="h-10 w-px self-center bg-border" />
            <div className="text-center">
              <p className="font-[var(--font-display)] text-3xl font-medium tabular-nums text-foreground">
                {totalRepos}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Repos
              </p>
            </div>
          </div>
        </div>

        <hr className="rule-ornament my-6" />

        <div className="flex flex-wrap gap-3">
          <span className="pill-vouch rounded-full px-3 py-1 text-xs font-semibold">
            {vouchCount} vouched
          </span>
          {denounceCount > 0 && (
            <span className="pill-denounce rounded-full px-3 py-1 text-xs font-semibold">
              {denounceCount} denounced
            </span>
          )}
          <span className="pill-neutral rounded-full px-3 py-1 text-xs font-semibold">
            {totalRepos} repositor{totalRepos !== 1 ? "ies" : "y"}
          </span>
        </div>
      </header>

      {/* ─── Trust Entries ─── */}
      <section>
        <h2 className="mb-5 font-[var(--font-display)] text-lg font-semibold text-foreground">
          Trust across repositories
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {data.rows.map((row, i) => (
            <Link
              key={row.entry._id}
              href={`/r/${row.repo.slug}`}
              className="animate-rise card-paper group rounded-xl p-5 transition-all hover:shadow-md"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  {row.entry.type === "vouch" ? (
                    <ShieldCheck className="size-4 text-chart-2 shrink-0" />
                  ) : (
                    <ShieldOff className="size-4 text-destructive shrink-0" />
                  )}
                  <span className="font-mono text-sm font-medium text-foreground">
                    {row.repo.slug}
                  </span>
                </div>
                <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5 shrink-0 mt-0.5" />
              </div>
              <span
                className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase ${
                  row.entry.type === "vouch" ? "pill-vouch" : "pill-denounce"
                }`}
              >
                {row.entry.type}
              </span>
              {row.entry.details ? (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {row.entry.details}
                </p>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground/50 italic">No note provided.</p>
              )}
            </Link>
          ))}
        </div>
        {data.rows.length === 0 && (
          <div className="card-paper rounded-xl border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">No trust entries found for this handle.</p>
          </div>
        )}
      </section>
    </main>
  )
}

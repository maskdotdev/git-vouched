"use client"

import Link from "next/link"
import { usePaginatedQuery } from "convex/react"
import {
  ArrowLeft,
  BookOpen,
  Fingerprint,
  Trophy,
} from "lucide-react"

import { type LeaderboardRow, api } from "@/convex/api"
import { Button } from "@/components/ui/button"
import { LeaderboardTable } from "@/components/leaderboard-table"
import { getValidConvexUrl } from "@/lib/convex-url"

type LeaderboardScreenProps = {
  initialRows?: LeaderboardRow[]
}

export function LeaderboardScreen({ initialRows = [] }: LeaderboardScreenProps) {
  if (!getValidConvexUrl()) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6 py-12">
        <div className="card-paper w-full rounded-xl p-8">
          <h2 className="font-[var(--font-display)] text-xl font-semibold text-ink">
            Convex is not configured
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Set <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_CONVEX_URL</code>{" "}
            in <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">.env.local</code>.
          </p>
        </div>
      </main>
    )
  }

  return <LeaderboardScreenConfigured initialRows={initialRows} />
}

function LeaderboardScreenConfigured({ initialRows }: { initialRows: LeaderboardRow[] }) {
  const {
    results: liveLeaderboard,
    isLoading,
    loadMore,
    status,
  } = usePaginatedQuery(api.vouch.listTopHandlesPaginated, {}, { initialNumItems: 100 })
  const leaderboard =
    liveLeaderboard.length > 0 || !isLoading
      ? (liveLeaderboard as LeaderboardRow[])
      : initialRows
  const isInitialLoading = isLoading && leaderboard.length === 0
  const canLoadMore = status === "CanLoadMore"
  const isLoadingMore = status === "LoadingMore"

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-10 px-6 py-14 md:px-10">

      {/* ─── Nav Ribbon ─────────────────────────────────── */}
      <nav className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-70">
            <div className="flex size-8 items-center justify-center rounded-lg border border-border bg-primary text-primary-foreground">
              <Fingerprint className="size-4" />
            </div>
            <span className="font-[var(--font-display)] text-lg font-semibold tracking-tight text-foreground">
              Git Vouched
            </span>
          </Link>
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

      {/* ─── Back link ─── */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to home
        </Link>
      </div>

      {/* ─── Header ──────────────────────────────────────── */}
      <section className="panel-elevated rounded-2xl px-8 py-10 md:px-12 md:py-12">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-ring/10">
            <Trophy className="size-5 text-ring" />
          </div>
          <div>
            <h1 className="font-[var(--font-display)] text-2xl font-semibold text-foreground">
              Leaderboard
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Most vouched handles across all indexed repositories
            </p>
          </div>
        </div>
        <div className="rule-ornament mt-8" />
        <div className="mt-4 flex gap-6 text-sm">
          <div>
            <span className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Ranked handles
            </span>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
              {leaderboard.length}
            </p>
          </div>
          {leaderboard.length > 0 && (
            <div>
              <span className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                Top score
              </span>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                +{leaderboard[0].score}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ─── Full Table ──────────────────────────────────── */}
      <section>
        {isInitialLoading ? (
          <div className="card-paper rounded-xl p-8 text-center">
            <p className="text-sm text-muted-foreground">Loading leaderboard…</p>
          </div>
        ) : (
          <LeaderboardTable rows={leaderboard} />
        )}
        {canLoadMore || isLoadingMore ? (
          <div className="mt-4 flex justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={() => loadMore(100)}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "Loading more…" : "Load 100 more"}
            </Button>
          </div>
        ) : null}
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

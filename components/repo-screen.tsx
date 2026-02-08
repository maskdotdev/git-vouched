"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import {
  ArrowLeft,
  ArrowRight,
  Blocks,
  Clock3,
  DatabaseZap,
  Fingerprint,
  GitBranch,
  GitCommitVertical,
  Link2,
  ShieldCheck,
  ShieldOff,
  UserRound,
} from "lucide-react"
import { useState, useTransition } from "react"

import { type RepositoryAuditOverview, type RepositoryOverview, api } from "@/convex/api"
import { Button } from "@/components/ui/button"
import { getValidConvexUrl } from "@/lib/convex-url"

type RepoScreenProps = {
  slug: string
}

async function requestRepoIndex(repo: string): Promise<
  | {
      status: "indexed"
      entriesIndexed: number
      filePath: string
      changesDetected: number
      auditRecorded: boolean
      auditHeight?: number
    }
  | {
      status: "error" | "missing_file" | "missing_repo"
      message: string
    }
> {
  const response = await fetch("/api/index", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ repo }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof (payload as { message?: unknown }).message === "string"
        ? (payload as { message: string }).message
        : "Re-index failed."

    return {
      status: "error",
      message,
    }
  }

  return payload as
    | {
        status: "indexed"
        entriesIndexed: number
        filePath: string
        changesDetected: number
        auditRecorded: boolean
        auditHeight?: number
      }
    | {
        status: "error" | "missing_file" | "missing_repo"
        message: string
      }
}

function formatDateTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp))
}

function shortHash(input?: string | null) {
  if (!input) return "none"
  return input.slice(0, 12)
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
  const _audit = useQuery(api.vouch.listRepositoryAudit, { slug, limit: 12 }) as
    | RepositoryAuditOverview
    | undefined

  // ── DEBUG: inject a dummy Block #2 to preview the multi-block UI ──
  const audit: RepositoryAuditOverview | undefined = _audit
    ? {
        ..._audit,
        rows: [
          {
            block: {
              _id: "__dummy_block_2__",
              repoId: _audit.rows[0]?.block.repoId ?? "",
              snapshotId: _audit.rows[0]?.block.snapshotId ?? "",
              height: (_audit.rows[0]?.block.height ?? 0) + 1,
              indexedAt: Date.now(),
              source: "github" as const,
              filePath: ".github/VOUCHED.td",
              commitSha: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
              commitUrl: "https://github.com/example/repo/commit/a1b2c3d",
              commitActor: "maskd",
              previousBlockId: _audit.rows[0]?.block._id,
              previousHash: _audit.rows[0]?.block.blockHash,
              blockHash: "f4e3d2c1b0a9f4e3d2c1b0a9f4e3d2c1b0a9f4e3d2c1b0a9f4e3d2c1b0a9abcd",
              changeCount: 4,
              addedCount: 2,
              removedCount: 1,
              changedCount: 1,
            },
            changes: [
              {
                _id: "__dummy_change_1__",
                repoId: _audit.rows[0]?.block.repoId ?? "",
                blockId: "__dummy_block_2__",
                platform: "github",
                username: "alice",
                handle: "github:alice",
                action: "added" as const,
                afterType: "vouch" as const,
              },
              {
                _id: "__dummy_change_2__",
                repoId: _audit.rows[0]?.block.repoId ?? "",
                blockId: "__dummy_block_2__",
                platform: "github",
                username: "bob",
                handle: "github:bob",
                action: "added" as const,
                afterType: "vouch" as const,
              },
              {
                _id: "__dummy_change_3__",
                repoId: _audit.rows[0]?.block.repoId ?? "",
                blockId: "__dummy_block_2__",
                platform: "github",
                username: "eve",
                handle: "github:eve",
                action: "removed" as const,
                beforeType: "vouch" as const,
              },
              {
                _id: "__dummy_change_4__",
                repoId: _audit.rows[0]?.block.repoId ?? "",
                blockId: "__dummy_block_2__",
                platform: "github",
                username: "carol",
                handle: "github:carol",
                action: "changed" as const,
                beforeType: "vouch" as const,
                afterType: "denounce" as const,
              },
            ],
          },
          ..._audit.rows,
        ],
      }
    : _audit
  // ── END DEBUG ──

  const handleReindex = () => {
    startTransition(async () => {
      setMessage(null)
      try {
        const result = await requestRepoIndex(slug)
        setMessage(
          result.status === "indexed"
            ? `Indexed ${result.entriesIndexed} entries from ${result.filePath}. ${result.changesDetected} change${result.changesDetected === 1 ? "" : "s"} detected${result.auditRecorded ? `, chain block #${result.auditHeight ?? "?"} recorded.` : ", no new block recorded."}`
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

      <section>
        <h2 className="mb-5 flex items-center gap-2 font-[var(--font-display)] text-lg font-semibold text-foreground">
          <Blocks className="size-4 text-ring" />
          Audit chain
        </h2>

        {audit === undefined ? (
          <div className="card-paper rounded-xl p-8 text-center">
            <p className="text-sm text-muted-foreground">Loading chain history&hellip;</p>
          </div>
        ) : audit?.rows.length ? (
          <div className="audit-graph relative">
            {audit.rows.map((row, i) => {
              const isFirst = i === 0
              const isLast = i === audit.rows.length - 1
              const hasChanges = row.block.changeCount > 0

              return (
                <div
                  key={row.block._id}
                  className="audit-commit animate-rise relative grid"
                  style={{
                    gridTemplateColumns: "32px 16px 1fr",
                    animationDelay: `${i * 60}ms`,
                  }}
                >
                  {/* ── Branch rail ── */}
                  <div className="relative flex flex-col items-center">
                    {/* Vertical line – top half */}
                    {!isFirst && (
                      <div className="audit-rail-segment w-px grow bg-border" />
                    )}
                    {isFirst && <div className="grow" />}

                    {/* Commit node */}
                    <div
                      className={`relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2 ${
                        hasChanges
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border bg-muted text-muted-foreground"
                      }`}
                    >
                      <GitCommitVertical className="size-3.5" />
                    </div>

                    {/* Vertical line – bottom half */}
                    {!isLast && (
                      <div className="audit-rail-segment w-px grow bg-border" />
                    )}
                    {isLast && <div className="grow" />}
                  </div>

                  {/* ── Horizontal connector ── */}
                  <div className="audit-connector relative flex items-center">
                    <div className={`h-px w-full ${hasChanges ? "bg-primary/40" : "bg-border"}`} />
                  </div>

                  {/* ── Block card ── */}
                  <article className="card-paper my-1.5 rounded-xl p-5">
                    {/* Header: block # + hash + timestamp */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <span className="pill-neutral rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
                          Block #{row.block.height}
                        </span>
                        <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-primary/80">
                          {shortHash(row.block.blockHash)}
                        </code>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock3 className="size-3.5" />
                        <span>{formatDateTime(row.block.indexedAt)}</span>
                      </div>
                    </div>

                    {/* Meta row: prev hash, actor, links */}
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 font-mono">
                        <span className="text-muted-foreground/50">parent</span>{" "}
                        <code className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px]">
                          {shortHash(row.block.previousHash)}
                        </code>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="size-3.5" />
                        {row.block.commitActor ?? "unknown"}
                      </span>
                      {row.block.commitUrl ? (
                        <a
                          href={row.block.commitUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-accent hover:text-accent/80"
                        >
                          <Link2 className="size-3.5" />
                          commit
                        </a>
                      ) : null}
                      {row.block.sourceUrl ? (
                        <a
                          href={row.block.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-accent hover:text-accent/80"
                        >
                          <Link2 className="size-3.5" />
                          source
                        </a>
                      ) : null}
                    </div>

                    {/* Diff stats */}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {row.block.addedCount > 0 && (
                        <span className="pill-vouch rounded-full px-2 py-0.5 font-medium">
                          +{row.block.addedCount} added
                        </span>
                      )}
                      {row.block.removedCount > 0 && (
                        <span className="pill-denounce rounded-full px-2 py-0.5 font-medium">
                          &minus;{row.block.removedCount} removed
                        </span>
                      )}
                      {row.block.changedCount > 0 && (
                        <span className="pill-neutral rounded-full px-2 py-0.5 font-medium">
                          ~{row.block.changedCount} changed
                        </span>
                      )}
                      {row.block.changeCount === 0 && (
                        <span className="pill-neutral rounded-full px-2 py-0.5 font-medium">
                          no changes
                        </span>
                      )}
                    </div>

                    {/* Diff detail */}
                    {row.changes.length > 0 ? (
                      <ul className="mt-4 space-y-1 border-l-2 border-border pl-3 text-sm">
                        {row.changes.slice(0, 8).map((change) => (
                          <li
                            key={change._id}
                            className="font-mono text-muted-foreground"
                          >
                            <span
                              className={
                                change.action === "added"
                                  ? "text-chart-2"
                                  : change.action === "removed"
                                    ? "text-destructive"
                                    : "text-chart-1"
                              }
                            >
                              {change.action === "added"
                                ? "+"
                                : change.action === "removed"
                                  ? "−"
                                  : "~"}
                            </span>{" "}
                            <span className="text-foreground/90">{change.handle}</span>
                            {change.action === "changed" ? (
                              <span className="text-muted-foreground/60">
                                {" "}
                                ({change.beforeType ?? "?"} → {change.afterType ?? "?"})
                              </span>
                            ) : null}
                          </li>
                        ))}
                        {row.changes.length > 8 ? (
                          <li className="text-xs text-muted-foreground/50">
                            … {row.changes.length - 8} more
                          </li>
                        ) : null}
                      </ul>
                    ) : null}
                  </article>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="card-paper rounded-xl border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">No chain history recorded yet.</p>
          </div>
        )}
      </section>
    </main>
  )
}

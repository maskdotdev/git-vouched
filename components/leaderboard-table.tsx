import Link from "next/link"

import type { LeaderboardRow } from "@/convex/api"

const RANK_STYLES: Record<number, { bg: string; text: string; ring: string }> = {
  1: {
    bg: "bg-[oklch(0.28_0.06_35)]",
    text: "text-[oklch(0.78_0.16_35)]",
    ring: "ring-[oklch(0.50_0.14_35/40%)]",
  },
  2: {
    bg: "bg-[oklch(0.24_0.01_255)]",
    text: "text-[oklch(0.72_0.01_255)]",
    ring: "ring-[oklch(0.45_0.01_255/40%)]",
  },
  3: {
    bg: "bg-[oklch(0.26_0.04_55)]",
    text: "text-[oklch(0.68_0.08_55)]",
    ring: "ring-[oklch(0.42_0.06_55/35%)]",
  },
}

function RankCell({ rank }: { rank: number }) {
  const style = RANK_STYLES[rank]

  if (style) {
    return (
      <span
        className={`inline-flex size-7 items-center justify-center rounded-full text-xs font-extrabold ring-1 ${style.bg} ${style.text} ${style.ring}`}
      >
        {rank}
      </span>
    )
  }

  return (
    <span className="inline-flex size-7 items-center justify-center text-xs font-semibold tabular-nums text-muted-foreground">
      {rank}
    </span>
  )
}

export function LeaderboardTable({
  rows,
  compact = false,
}: {
  rows: LeaderboardRow[]
  compact?: boolean
}) {
  if (rows.length === 0) {
    return (
      <div className="card-paper rounded-xl border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No indexed trust entries yet. Index a repository to populate the leaderboard.
        </p>
      </div>
    )
  }

  const maxScore = rows[0]?.score || 1

  return (
    <div className="card-paper overflow-hidden rounded-xl">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border/60 text-[10px] font-semibold tracking-[0.12em] uppercase text-muted-foreground">
            <th className="w-12 py-2.5 pl-4 pr-1 text-center">#</th>
            <th className="py-2.5 pl-2">Handle</th>
            {!compact && (
              <th className="hidden py-2.5 pr-3 text-right sm:table-cell">Repos</th>
            )}
            <th className="py-2.5 pr-3 text-right">Vouched</th>
            <th className="py-2.5 pr-3 text-right">Denounced</th>
            <th className="py-2.5 pr-4 text-right">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const rank = i + 1
            const barWidth = Math.max(6, (row.score / maxScore) * 100)

            return (
              <tr key={row.handle} className="group transition-colors hover:bg-muted/40">
                <td className="py-0">
                  <Link
                    href={`/u/${encodeURIComponent(row.handle)}`}
                    className="flex items-center justify-center py-2.5 pl-4 pr-1"
                  >
                    <RankCell rank={rank} />
                  </Link>
                </td>
                <td className="py-0">
                  <Link
                    href={`/u/${encodeURIComponent(row.handle)}`}
                    className="flex items-center gap-2 py-2.5 pl-2"
                  >
                    <span className="truncate font-mono text-sm font-medium text-foreground transition-colors group-hover:text-accent">
                      {row.handle}
                    </span>
                    {compact && (
                      <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
                        {row.repositories} repo{row.repositories !== 1 && "s"}
                      </span>
                    )}
                  </Link>
                </td>
                {!compact && (
                  <td className="hidden py-0 sm:table-cell">
                    <Link
                      href={`/u/${encodeURIComponent(row.handle)}`}
                      className="flex items-center justify-end py-2.5 pr-3 text-sm tabular-nums text-muted-foreground"
                    >
                      {row.repositories}
                    </Link>
                  </td>
                )}
                <td className="py-0">
                  <Link
                    href={`/u/${encodeURIComponent(row.handle)}`}
                    className="flex items-center justify-end py-2.5 pr-3 text-sm font-medium tabular-nums text-[oklch(0.72_0.15_145)]"
                  >
                    {row.vouchedCount}
                  </Link>
                </td>
                <td className="py-0">
                  <Link
                    href={`/u/${encodeURIComponent(row.handle)}`}
                    className={`flex items-center justify-end py-2.5 pr-3 text-sm tabular-nums ${
                      row.denouncedCount > 0
                        ? "font-medium text-destructive/80"
                        : "text-muted-foreground/50"
                    }`}
                  >
                    {row.denouncedCount}
                  </Link>
                </td>
                <td className="py-0">
                  <Link
                    href={`/u/${encodeURIComponent(row.handle)}`}
                    className="flex items-center justify-end gap-2 py-2.5 pr-4"
                  >
                    <div className="hidden h-1 w-12 overflow-hidden rounded-full bg-muted sm:block">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[oklch(0.50_0.14_145)] to-[oklch(0.62_0.17_145)] transition-all duration-500"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold tabular-nums text-foreground">
                      {row.score >= 0 ? "+" : ""}
                      {row.score}
                    </span>
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

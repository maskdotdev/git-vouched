"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import { AlertTriangle, ShieldCheck } from "lucide-react"

import { api } from "@/convex/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type UserScreenProps = {
  handle: string
}

export function UserScreen({ handle }: UserScreenProps) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-10">
        <Card className="w-full max-w-xl border-slate-200 bg-white/90">
          <CardHeader>
            <CardTitle>Convex is not configured</CardTitle>
            <CardDescription>
              Set <code>NEXT_PUBLIC_CONVEX_URL</code> to load user trust data.
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

  return <UserScreenConfigured handle={handle} />
}

function UserScreenConfigured({ handle }: UserScreenProps) {
  const data = useQuery(api.vouch.getUserOverview, { handle })

  if (data === undefined) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-10">
        <p className="text-slate-600">Loading user profile...</p>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-10">
        <Card className="w-full max-w-xl border-slate-200 bg-white/90">
          <CardHeader>
            <CardTitle>No records found</CardTitle>
            <CardDescription>
              This handle is not in any indexed trust list yet.
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
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="rounded-3xl border border-slate-200 bg-white/90 p-7">
        <p className="text-xs tracking-[0.12em] text-slate-500 uppercase">Handle</p>
        <h1 className="mt-1 font-[var(--font-display)] text-4xl font-semibold text-slate-900">
          {data.handle}
        </h1>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
            {data.counts.vouched} vouched
          </span>
          <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-700">
            {data.counts.denounced} denounced
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-slate-700">
            {data.counts.repositories} repositories
          </span>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {data.rows.map((row) => (
          <Card key={row.entry._id} className="border-slate-200 bg-white/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                {row.entry.type === "vouch" ? (
                  <ShieldCheck className="size-4 text-emerald-700" />
                ) : (
                  <AlertTriangle className="size-4 text-rose-700" />
                )}
                {row.repo.slug}
              </CardTitle>
              <CardDescription className="capitalize">{row.entry.type}</CardDescription>
            </CardHeader>
            <CardContent>
              {row.entry.details ? (
                <p className="text-sm text-slate-700">{row.entry.details}</p>
              ) : (
                <p className="text-sm text-slate-500">No note provided.</p>
              )}
              <Link
                href={`/r/${row.repo.slug}`}
                className="mt-3 inline-block text-sm font-medium text-slate-700 underline"
              >
                View repository
              </Link>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  )
}

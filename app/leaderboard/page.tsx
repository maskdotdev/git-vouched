import { fetchQuery } from "convex/nextjs"

import { LeaderboardScreen } from "@/components/leaderboard-screen"
import { type LeaderboardRow, api } from "@/convex/api"
import { getValidConvexUrl } from "@/lib/convex-url"

export const metadata = {
  title: "Leaderboard – Git Vouched",
  description: "Most vouched handles across all indexed VOUCHED.td repositories.",
}

export default async function LeaderboardPage() {
  let initialRows: LeaderboardRow[] = []

  if (getValidConvexUrl()) {
    try {
      const rows = await fetchQuery(api.vouch.listTopHandles, { limit: 100 })
      initialRows = rows as LeaderboardRow[]
    } catch {
      // Render normally and let client-side reactive queries populate.
    }
  }

  return <LeaderboardScreen initialRows={initialRows} />
}

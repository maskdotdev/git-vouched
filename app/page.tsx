import { fetchQuery } from "convex/nextjs"

import { HomeScreen } from "@/components/home-screen"
import { type LeaderboardRow, type RepositoryDoc, api } from "@/convex/api"
import { getValidConvexUrl } from "@/lib/convex-url"

export default async function Home() {
  let initialRecentRepos: RepositoryDoc[] = []
  let initialLeaderboard: LeaderboardRow[] = []

  if (getValidConvexUrl()) {
    try {
      const [recentRepos, leaderboard] = await Promise.all([
        fetchQuery(api.vouch.listRecentRepos, { limit: 12 }),
        fetchQuery(api.vouch.listTopHandles, { limit: 20 }),
      ])
      initialRecentRepos = recentRepos as RepositoryDoc[]
      initialLeaderboard = leaderboard as LeaderboardRow[]
    } catch {
      // Render normally and let client-side reactive queries populate.
    }
  }

  return (
    <HomeScreen
      initialRecentRepos={initialRecentRepos}
      initialLeaderboard={initialLeaderboard}
    />
  )
}

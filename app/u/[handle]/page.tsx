import { fetchQuery } from "convex/nextjs"
import { UserScreen } from "@/components/user-screen"
import { type UserEntryRow, type UserOverview, api } from "@/convex/api"
import { getValidConvexUrl } from "@/lib/convex-url"

export default async function UserPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  let initialOverview: UserOverview | undefined
  let initialEntries: UserEntryRow[] = []

  if (getValidConvexUrl()) {
    try {
      const [overview, entries] = await Promise.all([
        fetchQuery(api.vouch.getUserOverview, { handle }),
        fetchQuery(api.vouch.listUserEntriesPreview, { handle, limit: 50 }),
      ])
      initialOverview = overview as UserOverview
      initialEntries = entries as UserEntryRow[]
    } catch {
      // Render normally and let client-side reactive queries populate.
    }
  }

  return (
    <UserScreen
      handle={handle}
      initialOverview={initialOverview}
      initialEntries={initialEntries}
    />
  )
}

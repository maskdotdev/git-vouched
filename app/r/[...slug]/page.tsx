import { fetchQuery } from "convex/nextjs"
import { RepoScreen } from "@/components/repo-screen"
import {
  type EntryDoc,
  type RepositoryAuditOverview,
  type RepositoryOverview,
  api,
} from "@/convex/api"
import { getValidConvexUrl } from "@/lib/convex-url"
import { notFound } from "next/navigation"

export default async function RepoPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  if (slug.length !== 2) {
    notFound()
  }

  const owner = slug[0]?.trim().toLowerCase()
  const name = slug[1]?.trim().toLowerCase()
  const validPart = /^[a-z0-9._-]+$/i

  if (!owner || !name || !validPart.test(owner) || !validPart.test(name)) {
    notFound()
  }

  const normalizedSlug = `${owner}/${name}`
  let initialRepository: RepositoryOverview | undefined
  let initialAudit: RepositoryAuditOverview | undefined
  let initialEntries: EntryDoc[] = []

  if (getValidConvexUrl()) {
    try {
      const [repository, audit, entries] = await Promise.all([
        fetchQuery(api.vouch.getRepository, { slug: normalizedSlug }),
        fetchQuery(api.vouch.listRepositoryAudit, {
          slug: normalizedSlug,
          limit: 12,
          changeLimit: 20,
        }),
        fetchQuery(api.vouch.listRepositoryEntriesPreview, {
          slug: normalizedSlug,
          limit: 50,
        }),
      ])
      initialRepository = repository as RepositoryOverview
      initialAudit = audit as RepositoryAuditOverview
      initialEntries = entries as EntryDoc[]
    } catch {
      // Render normally and let client-side reactive queries populate.
    }
  }

  return (
    <RepoScreen
      slug={normalizedSlug}
      initialRepository={initialRepository}
      initialAudit={initialAudit}
      initialEntries={initialEntries}
    />
  )
}

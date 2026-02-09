import { RepoScreen } from "@/components/repo-screen"
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

  return <RepoScreen slug={`${owner}/${name}`} />
}

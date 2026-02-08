import { RepoScreen } from "@/components/repo-screen"

export default async function RepoPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  return <RepoScreen slug={slug.join("/")} />
}

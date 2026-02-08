import { UserScreen } from "@/components/user-screen"

export default async function UserPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  return <UserScreen handle={handle} />
}

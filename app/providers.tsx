"use client"

import { ConvexProvider, ConvexReactClient } from "convex/react"
import { ReactNode, useMemo } from "react"

import { getValidConvexUrl } from "@/lib/convex-url"

export function Providers({ children }: { children: ReactNode }) {
  const convexUrl = getValidConvexUrl()
  const convex = useMemo(() => {
    if (!convexUrl) {
      return null
    }
    return new ConvexReactClient(convexUrl)
  }, [convexUrl])

  if (!convex) {
    return <>{children}</>
  }

  return <ConvexProvider client={convex}>{children}</ConvexProvider>
}

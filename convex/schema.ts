import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  repositories: defineTable({
    slug: v.string(),
    owner: v.string(),
    name: v.string(),
    source: v.literal("github"),
    defaultBranch: v.string(),
    status: v.union(
      v.literal("new"),
      v.literal("indexed"),
      v.literal("missing_file"),
      v.literal("missing_repo"),
      v.literal("error")
    ),
    lastIndexedAt: v.number(),
    lastError: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_last_indexed", ["lastIndexedAt"]),

  snapshots: defineTable({
    repoId: v.id("repositories"),
    commitSha: v.string(),
    filePath: v.string(),
    indexedAt: v.number(),
  }).index("by_repo", ["repoId"]),

  entries: defineTable({
    repoId: v.id("repositories"),
    snapshotId: v.id("snapshots"),
    platform: v.string(),
    username: v.string(),
    handle: v.string(),
    type: v.union(v.literal("vouch"), v.literal("denounce")),
    details: v.optional(v.string()),
  })
    .index("by_repo", ["repoId"])
    .index("by_snapshot", ["snapshotId"])
    .index("by_username", ["username"])
    .index("by_repo_and_type", ["repoId", "type"])
    .searchIndex("search_username", {
      searchField: "username",
      filterFields: ["platform", "type"],
    }),
})


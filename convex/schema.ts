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

  leaderboardRows: defineTable({
    platform: v.string(),
    username: v.string(),
    handle: v.string(),
    vouchedCount: v.number(),
    denouncedCount: v.number(),
    repositories: v.number(),
    score: v.number(),
    updatedAt: v.number(),
  })
    .index("by_handle", ["handle"])
    .index("by_score", ["score", "handle"]),

  auditBlocks: defineTable({
    repoId: v.id("repositories"),
    snapshotId: v.id("snapshots"),
    height: v.number(),
    indexedAt: v.number(),
    source: v.literal("github"),
    filePath: v.string(),
    commitSha: v.string(),
    commitUrl: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    commitActor: v.optional(v.string()),
    commitTimestamp: v.optional(v.string()),
    previousBlockId: v.optional(v.id("auditBlocks")),
    previousHash: v.optional(v.string()),
    blockHash: v.string(),
    changeCount: v.number(),
    addedCount: v.number(),
    removedCount: v.number(),
    changedCount: v.number(),
  })
    .index("by_repo_and_height", ["repoId", "height"])
    .index("by_repo_and_indexed", ["repoId", "indexedAt"])
    .index("by_block_hash", ["blockHash"]),

  auditChanges: defineTable({
    repoId: v.id("repositories"),
    blockId: v.id("auditBlocks"),
    platform: v.string(),
    username: v.string(),
    handle: v.string(),
    action: v.union(v.literal("added"), v.literal("removed"), v.literal("changed")),
    beforeType: v.optional(v.union(v.literal("vouch"), v.literal("denounce"))),
    afterType: v.optional(v.union(v.literal("vouch"), v.literal("denounce"))),
    beforeDetails: v.optional(v.string()),
    afterDetails: v.optional(v.string()),
  })
    .index("by_block", ["blockId"])
    .index("by_repo", ["repoId"])
    .index("by_handle", ["handle"]),
})

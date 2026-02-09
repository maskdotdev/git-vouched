import { anyApi, FunctionReference, type PaginationOptions, type PaginationResult } from "convex/server"

export type RepoStatus = "new" | "indexed" | "missing_file" | "missing_repo" | "error"

export type RepositoryDoc = {
  _id: string
  slug: string
  owner: string
  name: string
  source: "github"
  defaultBranch: string
  status: RepoStatus
  lastIndexedAt: number
  lastError?: string
  entryCount?: number
  vouchedCount?: number
  denouncedCount?: number
}

export type SnapshotDoc = {
  _id: string
  repoId: string
  commitSha: string
  filePath: string
  indexedAt: number
}

export type EntryDoc = {
  _id: string
  repoId: string
  repoSlug?: string
  snapshotId: string
  platform: string
  username: string
  handle: string
  type: "vouch" | "denounce"
  details?: string
}

export type AuditBlockDoc = {
  _id: string
  repoId: string
  snapshotId: string
  height: number
  indexedAt: number
  source: "github"
  filePath: string
  commitSha: string
  commitUrl?: string
  sourceUrl?: string
  commitActor?: string
  commitTimestamp?: string
  previousBlockId?: string
  previousHash?: string
  blockHash: string
  changeCount: number
  addedCount: number
  removedCount: number
  changedCount: number
}

export type AuditChangeDoc = {
  _id: string
  repoId: string
  blockId: string
  platform: string
  username: string
  handle: string
  action: "added" | "removed" | "changed"
  beforeType?: "vouch" | "denounce"
  afterType?: "vouch" | "denounce"
  beforeDetails?: string
  afterDetails?: string
}

export type IndexRepoResult =
  | {
      status: "indexed"
      slug: string
      filePath: string
      entriesIndexed: number
      changesDetected: number
      auditRecorded: boolean
      auditBlockHash?: string
      auditHeight?: number
      skippedNoChanges?: boolean
    }
  | {
      status: "missing_file" | "missing_repo" | "error"
      slug: string
      message: string
    }

export type ReindexTrackedReposResult = {
  attempted: number
  indexed: number
  missingFile: number
  missingRepo: number
  failed: number
  results: Array<
    | {
        slug: string
        status: "indexed"
        entriesIndexed: number
      }
    | {
        slug: string
        status: "missing_file" | "missing_repo" | "error"
        message: string
      }
  >
}

export type RepositoryOverview = {
  repo: RepositoryDoc
  snapshot: SnapshotDoc | null
  counts: {
    vouched: number
    denounced: number
  }
} | null

export type RepositoryAuditOverview = {
  repo: RepositoryDoc
  rows: Array<{
    block: AuditBlockDoc
    changes: AuditChangeDoc[]
    hasMoreChanges: boolean
  }>
} | null

export type UserOverview = {
  handle: string
  counts: {
    vouched: number
    denounced: number
    repositories: number
  }
} | null

export type UserEntryRow = {
  entry: EntryDoc
  repoSlug: string
}

export type HandleSearchRow = {
  platform: string
  username: string
  handle: string
  vouchedCount: number
  denouncedCount: number
  repositories: number
}

export type LeaderboardRow = {
  platform: string
  username: string
  handle: string
  vouchedCount: number
  denouncedCount: number
  repositories: number
  score: number
}

type ApiShape = {
  vouch: {
    listRecentRepos: FunctionReference<"query", "public", { limit?: number }, RepositoryDoc[]>
    getRepository: FunctionReference<"query", "public", { slug: string }, RepositoryOverview>
    listRepositoryEntriesPaginated: FunctionReference<
      "query",
      "public",
      { slug: string; paginationOpts: PaginationOptions },
      PaginationResult<EntryDoc>
    >
    listRepositoryEntriesPreview: FunctionReference<
      "query",
      "public",
      { slug: string; limit?: number },
      EntryDoc[]
    >
    listRepositoryAudit: FunctionReference<
      "query",
      "public",
      { slug: string; limit?: number; changeLimit?: number },
      RepositoryAuditOverview
    >
    getUserOverview: FunctionReference<"query", "public", { handle: string }, UserOverview>
    listUserEntriesPaginated: FunctionReference<
      "query",
      "public",
      { handle: string; paginationOpts: PaginationOptions },
      PaginationResult<UserEntryRow>
    >
    listUserEntriesPreview: FunctionReference<
      "query",
      "public",
      { handle: string; limit?: number },
      UserEntryRow[]
    >
    searchHandles: FunctionReference<
      "query",
      "public",
      { query: string; limit?: number },
      HandleSearchRow[]
    >
    listTopHandles: FunctionReference<"query", "public", { limit?: number }, LeaderboardRow[]>
    listTopHandlesPaginated: FunctionReference<
      "query",
      "public",
      { paginationOpts: PaginationOptions },
      PaginationResult<LeaderboardRow>
    >
  }
}

type InternalApiShape = {
  vouch: {
    acquireIndexPermit: FunctionReference<
      "mutation",
      "internal",
      { repo: string; requester: string; skipRateLimit?: boolean },
      { ok: true } | { ok: false; status: number; message: string }
    >
    releaseRepoIndexLock: FunctionReference<"mutation", "internal", { repo: string }, void>
    setRepositoryStatus: FunctionReference<
      "mutation",
      "internal",
      {
        slug: string
        owner: string
        name: string
        defaultBranch: string
        status: RepoStatus
        lastError?: string
      },
      string
    >
    getRepositorySnapshotMeta: FunctionReference<
      "query",
      "internal",
      { slug: string },
      {
        repoStatus: RepoStatus
        commitSha: string | null
        filePath: string | null
      } | null
    >
    replaceRepositorySnapshot: FunctionReference<
      "mutation",
      "internal",
      {
        slug: string
        owner: string
        name: string
        defaultBranch: string
        commitSha: string
        filePath: string
        commitUrl?: string
        sourceUrl?: string
        commitActor?: string
        commitTimestamp?: string
        entries: Array<{
          platform: string
          username: string
          type: "vouch" | "denounce"
          details?: string
        }>
      },
      {
        repoId: string
        indexedAt: number
        entriesIndexed: number
        changesDetected: number
        auditRecorded: boolean
        auditBlockHash?: string
        auditHeight?: number
      }
    >
    indexGithubRepo: FunctionReference<
      "action",
      "internal",
      { repo: string; allowAuthenticatedGithub?: boolean },
      IndexRepoResult
    >
    rebuildLeaderboardRows: FunctionReference<
      "mutation",
      "internal",
      Record<string, never>,
      {
        entriesProcessed: number
        handlesMaterialized: number
      }
    >
    listTrackedRepoSlugs: FunctionReference<"query", "internal", { limit?: number }, string[]>
    reindexTrackedRepos: FunctionReference<
      "action",
      "internal",
      { limit?: number },
      ReindexTrackedReposResult
    >
  }
}

export const api = anyApi as unknown as ApiShape
export const internalApi = anyApi as unknown as InternalApiShape

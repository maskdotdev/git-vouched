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
  entries: EntryDoc[]
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
  }>
} | null

export type UserOverview = {
  handle: string
  counts: {
    vouched: number
    denounced: number
    repositories: number
  }
  rows: Array<{
    entry: EntryDoc
    repo: RepositoryDoc
  }>
} | null

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
    listRepositoryAudit: FunctionReference<
      "query",
      "public",
      { slug: string; limit?: number },
      RepositoryAuditOverview
    >
    getUserOverview: FunctionReference<"query", "public", { handle: string }, UserOverview>
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

import { anyApi, FunctionReference } from "convex/server"

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

export type IndexRepoResult =
  | {
      status: "indexed"
      slug: string
      filePath: string
      entriesIndexed: number
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
    indexGithubRepo: FunctionReference<"action", "public", { repo: string }, IndexRepoResult>
    reindexTrackedRepos: FunctionReference<
      "action",
      "public",
      { limit?: number },
      ReindexTrackedReposResult
    >
    listTrackedRepoSlugs: FunctionReference<"query", "public", { limit?: number }, string[]>
    listRecentRepos: FunctionReference<"query", "public", { limit?: number }, RepositoryDoc[]>
    getRepository: FunctionReference<"query", "public", { slug: string }, RepositoryOverview>
    getUserOverview: FunctionReference<"query", "public", { handle: string }, UserOverview>
    searchHandles: FunctionReference<
      "query",
      "public",
      { query: string; limit?: number },
      HandleSearchRow[]
    >
    listTopHandles: FunctionReference<"query", "public", { limit?: number }, LeaderboardRow[]>
    setRepositoryStatus: FunctionReference<"mutation", "public", Record<string, unknown>, string>
    replaceRepositorySnapshot: FunctionReference<
      "mutation",
      "public",
      Record<string, unknown>,
      { repoId: string; indexedAt: number; entriesIndexed: number }
    >
  }
}

export const api = anyApi as unknown as ApiShape

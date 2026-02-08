import { cronJobs } from "convex/server"

import { internalApi } from "./api"

const crons = cronJobs()

// Reindex tracked repos in the background so new vouches appear without manual action.
crons.interval(
  "reindex tracked repositories",
  { hours: 1 },
  internalApi.vouch.reindexTrackedRepos,
  {
    limit: 25,
  }
)

export default crons

import { cronJobs } from "convex/server"

import { api } from "./_generated/api"

const crons = cronJobs()

// Reindex tracked repos in the background so new vouches appear without manual action.
crons.interval(
  "reindex tracked repositories",
  { hours: 1 },
  api.vouch.reindexTrackedRepos,
  {
    limit: 25,
  }
)

export default crons

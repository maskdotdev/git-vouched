export type NormalizedGithubRepo = {
  owner: string
  name: string
  slug: string
}

const VALID_REPO_PART = /^[a-z0-9._-]+$/i

export function normalizeGithubRepoInput(input: string): NormalizedGithubRepo | null {
  let value = input.trim()
  value = value.replace(/^https?:\/\/github\.com\//i, "")
  value = value.replace(/^github\.com\//i, "")
  value = value.split(/[?#]/, 1)[0] ?? value
  value = value.replace(/\.git$/i, "")
  value = value.replace(/^\/+|\/+$/g, "")

  const parts = value.split("/").filter(Boolean)
  if (parts.length !== 2) {
    return null
  }

  const owner = parts[0]?.trim().toLowerCase()
  const name = parts[1]?.trim().toLowerCase()
  if (!owner || !name) {
    return null
  }
  if (!VALID_REPO_PART.test(owner) || !VALID_REPO_PART.test(name)) {
    return null
  }

  return { owner, name, slug: `${owner}/${name}` }
}

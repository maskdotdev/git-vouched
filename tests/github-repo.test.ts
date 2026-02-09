import { describe, expect, it } from "bun:test"

import { normalizeGithubRepoInput } from "@/lib/github-repo"

describe("normalizeGithubRepoInput", () => {
  it("normalizes owner/repo slugs", () => {
    expect(normalizeGithubRepoInput("Foo/Bar")).toEqual({
      owner: "foo",
      name: "bar",
      slug: "foo/bar",
    })
  })

  it("normalizes full GitHub URLs", () => {
    expect(normalizeGithubRepoInput("https://github.com/Foo/Bar.git?tab=readme")).toEqual({
      owner: "foo",
      name: "bar",
      slug: "foo/bar",
    })
  })

  it("rejects malformed slugs", () => {
    expect(normalizeGithubRepoInput("foo")).toBeNull()
    expect(normalizeGithubRepoInput("foo/bar/baz")).toBeNull()
    expect(normalizeGithubRepoInput("foo/ba r")).toBeNull()
  })
})

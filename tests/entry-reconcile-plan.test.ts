import { describe, expect, it } from "bun:test"

import { planEntryReconciliation } from "@/convex/entry_reconcile_plan"

describe("planEntryReconciliation", () => {
  it("returns delta-only mutations", () => {
    const plan = planEntryReconciliation(
      [
        {
          id: "a",
          snapshotId: "snap-1",
          repoSlug: "foo/bar",
          platform: "github",
          username: "alice",
          handle: "github:alice",
          type: "vouch",
        },
        {
          id: "b",
          snapshotId: "snap-1",
          repoSlug: "foo/bar",
          platform: "github",
          username: "bob",
          handle: "github:bob",
          type: "vouch",
        },
      ],
      [
        {
          platform: "github",
          username: "alice",
          handle: "github:alice",
          type: "denounce",
          details: "updated",
        },
        {
          platform: "github",
          username: "charlie",
          handle: "github:charlie",
          type: "vouch",
        },
      ],
      "foo/bar",
      "snap-2"
    )

    expect(plan.duplicateDeleteIds).toEqual([])
    expect(plan.deleteIds).toEqual(["b"])
    expect(plan.patches).toEqual([
      {
        id: "a",
        patch: {
          platform: "github",
          username: "alice",
          handle: "github:alice",
          type: "denounce",
          details: "updated",
          snapshotId: "snap-2",
          repoSlug: "foo/bar",
        },
      },
    ])
    expect(plan.inserts).toEqual([
      {
        platform: "github",
        username: "charlie",
        handle: "github:charlie",
        type: "vouch",
      },
    ])
  })

  it("deduplicates pre-existing duplicate handles", () => {
    const plan = planEntryReconciliation(
      [
        {
          id: "a",
          snapshotId: "snap-1",
          repoSlug: "foo/bar",
          platform: "github",
          username: "alice",
          handle: "github:alice",
          type: "vouch",
        },
        {
          id: "b",
          snapshotId: "snap-1",
          repoSlug: "foo/bar",
          platform: "github",
          username: "alice",
          handle: "github:alice",
          type: "vouch",
        },
      ],
      [
        {
          platform: "github",
          username: "alice",
          handle: "github:alice",
          type: "vouch",
        },
      ],
      "foo/bar",
      "snap-1"
    )

    expect(plan.duplicateDeleteIds).toEqual(["b"])
    expect(plan.deleteIds).toEqual([])
    expect(plan.patches).toEqual([])
    expect(plan.inserts).toEqual([])
  })
})

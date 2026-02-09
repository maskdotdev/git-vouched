export type TrustEntry = {
  platform: string
  username: string
  handle: string
  type: "vouch" | "denounce"
  details?: string
}

export type ExistingTrustEntry<TId> = TrustEntry & {
  id: TId
  snapshotId: string
  repoSlug?: string
}

export type TrustEntryPatch = {
  platform: string
  username: string
  handle: string
  type: "vouch" | "denounce"
  details?: string
  snapshotId: string
  repoSlug: string
}

export type EntryReconciliationPlan<TId> = {
  duplicateDeleteIds: TId[]
  deleteIds: TId[]
  patches: Array<{
    id: TId
    patch: TrustEntryPatch
  }>
  inserts: TrustEntry[]
}

function normalizeDetails(details: string | undefined) {
  return details ?? undefined
}

export function planEntryReconciliation<TId>(
  existingEntries: ExistingTrustEntry<TId>[],
  nextEntries: TrustEntry[],
  expectedRepoSlug: string,
  expectedSnapshotId: string
): EntryReconciliationPlan<TId> {
  const dedupedExistingByHandle = new Map<string, ExistingTrustEntry<TId>>()
  const duplicateDeleteIds: TId[] = []

  for (const existing of existingEntries) {
    const seen = dedupedExistingByHandle.get(existing.handle)
    if (!seen) {
      dedupedExistingByHandle.set(existing.handle, existing)
      continue
    }

    duplicateDeleteIds.push(existing.id)
  }

  const nextByHandle = new Map(nextEntries.map((entry) => [entry.handle, entry]))
  const deleteIds: TId[] = []
  const patches: Array<{
    id: TId
    patch: TrustEntryPatch
  }> = []

  for (const existing of dedupedExistingByHandle.values()) {
    const next = nextByHandle.get(existing.handle)
    if (!next) {
      deleteIds.push(existing.id)
      continue
    }

    const nextDetails = normalizeDetails(next.details)
    const existingDetails = normalizeDetails(existing.details)
    const needsPatch =
      existing.platform !== next.platform ||
      existing.username !== next.username ||
      existing.handle !== next.handle ||
      existing.type !== next.type ||
      existingDetails !== nextDetails ||
      existing.snapshotId !== expectedSnapshotId ||
      existing.repoSlug !== expectedRepoSlug

    if (needsPatch) {
      patches.push({
        id: existing.id,
        patch: {
          platform: next.platform,
          username: next.username,
          handle: next.handle,
          type: next.type,
          details: nextDetails,
          snapshotId: expectedSnapshotId,
          repoSlug: expectedRepoSlug,
        },
      })
    }

    nextByHandle.delete(existing.handle)
  }

  return {
    duplicateDeleteIds,
    deleteIds,
    patches,
    inserts: Array.from(nextByHandle.values()),
  }
}

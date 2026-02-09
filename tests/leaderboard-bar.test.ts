import { describe, expect, it } from "bun:test"

import { getMaxAbsScore, getScoreBarWidth } from "@/lib/leaderboard-bar"

describe("leaderboard bar sizing", () => {
  it("scales based on absolute score magnitude", () => {
    const maxAbsScore = getMaxAbsScore([-10, -3, 5])
    expect(maxAbsScore).toBe(10)
    expect(getScoreBarWidth(-10, maxAbsScore)).toBe(100)
    expect(getScoreBarWidth(5, maxAbsScore)).toBe(50)
  })

  it("clamps score bars to a visible minimum", () => {
    expect(getScoreBarWidth(0, 10)).toBe(6)
    expect(getScoreBarWidth(1, 100)).toBe(6)
  })
})

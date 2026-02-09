export function getMaxAbsScore(scores: number[]) {
  return scores.reduce((max, score) => Math.max(max, Math.abs(score)), 1)
}

export function getScoreBarWidth(score: number, maxAbsScore: number) {
  if (maxAbsScore <= 0) {
    return 6
  }

  return Math.min(100, Math.max(6, (Math.abs(score) / maxAbsScore) * 100))
}

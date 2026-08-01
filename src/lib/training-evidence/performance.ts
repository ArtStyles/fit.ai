export type EvidenceSet = {
  weightKg: number
  reps: number
  rpe: number | null
}

export type ExercisePerformanceSummary = {
  sets: EvidenceSet[]
  completedSets: number
  volumeKg: number
  bestSet: EvidenceSet | null
  averageRpe: number | null
}

export function buildEvidenceSets(
  weights: number[] | null,
  reps: number[] | null,
  rpes: (number | null)[] | null = null,
): EvidenceSet[] {
  const size = Math.max(weights?.length ?? 0, reps?.length ?? 0, rpes?.length ?? 0)

  return Array.from({ length: size }, (_, index) => {
    const rpe = rpes?.[index]
    return {
      weightKg: Number(weights?.[index]) || 0,
      reps: Number(reps?.[index]) || 0,
      rpe: typeof rpe === 'number' ? rpe : null,
    }
  })
}

export function summarizeExercisePerformance(
  weights: number[] | null,
  reps: number[] | null,
  rpes: (number | null)[] | null = null,
): ExercisePerformanceSummary {
  const sets = buildEvidenceSets(weights, reps, rpes)
  const bestSet = sets.reduce<EvidenceSet | null>((best, set) => {
    if (!best || set.weightKg > best.weightKg) return set
    if (set.weightKg === best.weightKg && set.reps > best.reps) return set
    return best
  }, null)
  const recordedRpes = sets.flatMap(set => set.rpe === null ? [] : [set.rpe])

  return {
    sets,
    completedSets: sets.length,
    volumeKg: Math.round(sets.reduce((sum, set) => sum + set.weightKg * set.reps, 0)),
    bestSet,
    averageRpe: recordedRpes.length === 0
      ? null
      : Math.round((recordedRpes.reduce((sum, value) => sum + value, 0) / recordedRpes.length) * 10) / 10,
  }
}

export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

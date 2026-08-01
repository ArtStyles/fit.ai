import { describe, expect, it } from 'vitest'
import {
  buildEvidenceSets,
  percentChange,
  summarizeExercisePerformance,
} from '../performance'

describe('training evidence performance', () => {
  it('zips uneven set arrays without inventing values', () => {
    expect(buildEvidenceSets([40, 45], [10], [7, null])).toEqual([
      { weightKg: 40, reps: 10, rpe: 7 },
      { weightKg: 45, reps: 0, rpe: null },
    ])
  })

  it('uses load then reps to choose the best set', () => {
    expect(summarizeExercisePerformance([40, 45, 45], [10, 6, 8], [7, 8, 9])).toMatchObject({
      volumeKg: 1030,
      bestSet: { weightKg: 45, reps: 8, rpe: 9 },
      averageRpe: 8,
    })
  })

  it('requires a non-zero prior value for percentage change', () => {
    expect(percentChange(120, 100)).toBe(20)
    expect(percentChange(120, 0)).toBeNull()
  })
})

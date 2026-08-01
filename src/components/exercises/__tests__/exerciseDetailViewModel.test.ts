import { describe, expect, it } from 'vitest'
import { buildExerciseDetailView, filterExercisePoints } from '../exerciseDetailViewModel'

describe('exercise detail view model', () => {
  it('keeps all points and separates latest stimulus from all-time totals', () => {
    const view = buildExerciseDetailView([
      { logId: 'new', completedAt: '2026-08-20T10:00:00Z', weightsKg: [60], repsCompleted: [5], rpeValues: [8] },
      { logId: 'old', completedAt: '2026-07-01T10:00:00Z', weightsKg: [55], repsCompleted: [6], rpeValues: [7] },
    ], 'es', 'America/Havana')

    expect(view.points).toHaveLength(2)
    expect(view.latest).toMatchObject({ maxWeightKg: 60, volumeKg: 300, averageRpe: 8 })
    expect(view.best).toMatchObject({ maxWeightKg: 60 })
  })

  it('filters points by an exact week window', () => {
    const points = [
      { logId: 'a', date: '2026-08-20', completedAt: '2026-08-20T10:00:00Z', maxWeightKg: 60, repsAtMaxWeight: 5, volumeKg: 300, averageRpe: 8 },
      { logId: 'b', date: '2026-06-01', completedAt: '2026-06-01T10:00:00Z', maxWeightKg: 50, repsAtMaxWeight: 5, volumeKg: 250, averageRpe: 7 },
    ]

    expect(filterExercisePoints(points, '2026-08-28', 4).map(point => point.logId)).toEqual(['a'])
  })

  it('uses baseline when recent points have no valid load', () => {
    const view = buildExerciseDetailView([
      { logId: 'a', completedAt: '2026-08-20T10:00:00Z', weightsKg: [0], repsCompleted: [12], rpeValues: [7] },
    ], 'en', 'UTC')

    expect(view.trend).toBe('baseline')
  })
})

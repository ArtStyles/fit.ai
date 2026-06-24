import { describe, it, expect } from 'vitest'
import { buildSessionSnapshot, buildRoutineSnapshot } from '../snapshots'

describe('buildSessionSnapshot', () => {
  const names = new Map([['e1', 'Press de banca'], ['e2', 'Sentadilla']])

  it('arma sets por serie y suma el volumen total', () => {
    const snap = buildSessionSnapshot(
      { completed_at: '2026-06-24T18:00:00Z', duration_minutes: 60 },
      'Push A',
      [
        { exercise_id: 'e1', reps_completed: [8, 8], weights_kg: [80, 80] }, // 1280
        { exercise_id: 'e2', reps_completed: [10], weights_kg: [100] },      // 1000
      ],
      names,
      new Set(['e1']),
    )
    expect(snap.workout_name).toBe('Push A')
    expect(snap.duration_minutes).toBe(60)
    expect(snap.total_volume_kg).toBe(2280)
    expect(snap.exercises[0]).toEqual({
      name: 'Press de banca',
      sets: [{ reps: 8, weight_kg: 80 }, { reps: 8, weight_kg: 80 }],
      is_pr: true,
    })
    expect(snap.exercises[1].is_pr).toBe(false)
  })

  it('tolera arrays null y pesos sin valor', () => {
    const snap = buildSessionSnapshot(
      { completed_at: '2026-06-24T18:00:00Z', duration_minutes: null },
      'Cardio',
      [{ exercise_id: 'e1', reps_completed: null, weights_kg: null }],
      names,
    )
    expect(snap.total_volume_kg).toBe(0)
    expect(snap.exercises[0].sets).toEqual([])
    expect(snap.exercises[0].is_pr).toBe(false)
  })
})

describe('buildRoutineSnapshot', () => {
  it('ordena workouts por order_in_plan y ejercicios por order_index', () => {
    const plan = { name: 'Full Body', goal: 'build_muscle', days_per_week: 3, difficulty: 'intermediate' }
    const workouts = [
      { id: 'w2', name: 'Día B', day_of_week: 3, order_in_plan: 1 },
      { id: 'w1', name: 'Día A', day_of_week: 1, order_in_plan: 0 },
    ]
    const byWorkout = new Map([
      ['w1', [
        { exercise_id: 'e2', name: 'Sentadilla', order_index: 1, sets: 4, reps: 8, rest_seconds: 120, weight_kg: null },
        { exercise_id: 'e1', name: 'Press', order_index: 0, sets: 3, reps: 10, rest_seconds: 90, weight_kg: 60 },
      ]],
      ['w2', []],
    ])
    const snap = buildRoutineSnapshot(plan, workouts, byWorkout)
    expect(snap.name).toBe('Full Body')
    expect(snap.workouts.map(w => w.name)).toEqual(['Día A', 'Día B'])
    expect(snap.workouts[0].exercises.map(e => e.name)).toEqual(['Press', 'Sentadilla'])
  })
})

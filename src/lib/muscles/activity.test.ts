import { describe, expect, it } from 'vitest'
import { buildMuscleActivity } from './activity'
import { buildHistoricalMuscleActivity } from './history'

describe('muscle activity', () => {
  it('deduplicates aliases within a movement and keeps all its recorded muscle groups', () => {
    const result = buildMuscleActivity([
      { muscleGroups: ['Chest', 'pecho', 'Pectorales', 'Tríceps'], sets: 3 },
      { muscleGroups: ['triceps'], sets: 2 },
    ])
    expect(result.groups.find(group => group.id === 'chest')?.sets).toBe(3)
    expect(result.groups.find(group => group.id === 'triceps')?.sets).toBe(5)
    expect(result.groups.find(group => group.id === 'back')?.sets).toBe(0)
    expect(result.totalSets).toBe(5)
  })

  it('filters by inclusive civil date and ignores invalid counts without losing unclassified work', () => {
    const result = buildMuscleActivity([
      { muscleGroups: ['Quadriceps'], sets: 3, date: '2026-09-01' },
      { muscleGroups: ['cuádriceps'], sets: 2, date: '2026-09-10' },
      { muscleGroups: ['quads'], sets: 9, date: '2026-08-31' },
      { muscleGroups: ['quads'], sets: 7, date: '2026-09-11' },
      { muscleGroups: ['pecho'], sets: NaN, date: '2026-09-05' },
      { muscleGroups: ['espalda'], sets: -2, date: '2026-09-05' },
      { muscleGroups: ['cardio', 'Cardio'], sets: 1, date: '2026-09-05' },
      { muscleGroups: [], sets: 2, date: '2026-09-05' },
    ], { from: '2026-09-01', to: '2026-09-10' })
    expect(result.groups.find(group => group.id === 'quads')?.sets).toBe(5)
    expect(result.totalSets).toBe(8)
    expect(result.unmapped).toEqual([{ label: 'cardio', sets: 1 }])
    expect(result.withoutMuscleSets).toBe(2)
  })

  it('keeps zero-data groups neutral and does not infer a specific muscle from a broad label', () => {
    const result = buildMuscleActivity([{ muscleGroups: ['Piernas'], sets: 3 }])
    expect(result.groups.every(group => group.sets === 0 && group.level === 0)).toBe(true)
    expect(result.unmapped).toEqual([{ label: 'Piernas', sets: 3 }])
  })
})

describe('historical muscle activity', () => {
  const id = '44444444-4444-4444-8444-444444444444'
  const snapshot = {
    version: 1,
    workout: { id: '11111111-1111-4111-8111-111111111111', name: 'Sesión', focus: null, dayOfWeek: 1 },
    plan: null,
    exercises: [{ exerciseId: id, name: 'Plank', nameEs: 'Plancha', muscleGroups: ['abdominals'], muscleGroupsEs: ['abdominales'], isCompound: false }],
  }
  it('counts timed and bodyweight completed sets and prefers the historical muscles over renamed catalog rows', () => {
    const result = buildHistoricalMuscleActivity([
      { progress_log_id: 'log', exercise_id: id, sets_completed: 2, exercise: { name: 'Renamed', muscle_groups: ['chest'] } },
      { progress_log_id: 'log', exercise_id: 'bodyweight', sets_completed: 3, exercise: { name: 'Push-up', muscle_groups: ['chest'] } },
      { progress_log_id: 'log', exercise_id: 'skipped', sets_completed: 0, exercise: { name: 'Row', muscle_groups: ['back'] } },
      { progress_log_id: 'absent', exercise_id: id, sets_completed: 8, exercise: null },
    ], [{ id: 'log', completed_at: '2026-09-11T02:00:00Z', session_context_snapshot: snapshot }], 'America/Havana', 'es')
    expect(result).toEqual([
      { muscleGroups: ['abdominales'], sets: 2, date: '2026-09-10' },
      { muscleGroups: ['chest'], sets: 3, date: '2026-09-10' },
    ])
  })
})

import { describe, expect, it } from 'vitest'
import { projectFitnessCard } from './projection'

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const chestPress = '11111111-1111-4111-8111-111111111111'
const chestFly = '22222222-2222-4222-8222-222222222222'
const plank = '33333333-3333-4333-8333-333333333333'

const exercises = [
  { id: chestPress, name: 'Bench press live', name_es: 'Press actual', muscle_groups: ['back'], muscle_groups_es: ['espalda'] },
  { id: chestFly, name: 'Fly', name_es: 'Aperturas', muscle_groups: ['chest'], muscle_groups_es: ['pecho'] },
  { id: plank, name: 'Plank', name_es: 'Plancha', muscle_groups: ['core'], muscle_groups_es: ['abdominales'] },
]

function context(rows = [
  { exerciseId: chestPress, name: 'Historic bench', nameEs: 'Press histórico', muscleGroups: ['chest'], muscleGroupsEs: ['pecho'], isCompound: true },
  { exerciseId: chestFly, name: 'Historic fly', nameEs: 'Aperturas históricas', muscleGroups: ['chest'], muscleGroupsEs: ['pecho'], isCompound: false },
]) {
  return { version: 1, workout: { id: '99999999-9999-4999-8999-999999999999', name: 'Torso', focus: null, dayOfWeek: 1 }, plan: null, exercises: rows }
}

const now = new Date('2026-09-12T16:00:00.000Z')

describe('projectFitnessCard', () => {
  it('deduplicates client sessions, bounds historic labels and rejects impossible instants', () => {
    const logs = [
      { id: 'canonical', client_session_id: owner, user_id: owner, completed_at: '2026-09-11T12:00:00Z' },
      { id: 'copy', client_session_id: owner, user_id: owner, completed_at: '2026-09-11T12:00:00Z' },
      { id: 'invalid', user_id: owner, completed_at: '2026-02-30T12:00:00Z' },
    ]
    const exerciseLogs = logs.map((log, index) => ({ id: `detail-${index}`, progress_log_id: log.id, exercise_id: chestPress, sets_completed: 1, weights_kg: [index ? 100 : 40], reps_completed: [8] }))
    const result = projectFitnessCard({ ownerId: owner, logs, exerciseLogs, exercises: [{ id: chestPress, name: 'A'.repeat(161), muscle_groups: ['chest'] }], timeZone: 'UTC', language: 'en', now })
    expect(result.totalSessions).toBe(1)
    expect(result.muscles.find(row => row.id === 'chest')?.sessions).toBe(1)
    expect(result.records[0]).toMatchObject({ name: 'A'.repeat(160), weightKg: 40 })
  })
  it('counts each owned completed session once per muscle and preserves frozen presentation', () => {
    const logs = [
      { id: 'log-1', user_id: owner, completed_at: '2026-09-12T14:00:00.000Z', session_context_snapshot: context() },
      { id: 'log-2', user_id: owner, completed_at: '2026-09-11T14:00:00.000Z', session_context_snapshot: context() },
      { id: 'foreign', user_id: other, completed_at: '2026-09-12T14:00:00.000Z', session_context_snapshot: context() },
    ]
    const exerciseLogs = [
      { id: 'set-1', progress_log_id: 'log-1', exercise_id: chestPress, sets_completed: 1, weights_kg: [50], reps_completed: [8] },
      { id: 'set-2', progress_log_id: 'log-1', exercise_id: chestFly, sets_completed: 1, weights_kg: [10], reps_completed: [12] },
      { id: 'set-3', progress_log_id: 'log-2', exercise_id: chestPress, sets_completed: 1, weights_kg: [55], reps_completed: [6] },
      { id: 'foreign-set', progress_log_id: 'foreign', exercise_id: chestPress, sets_completed: 1, weights_kg: [200], reps_completed: [2] },
    ]

    const result = projectFitnessCard({ ownerId: owner, logs, exerciseLogs, exercises, timeZone: 'America/Havana', language: 'es', now })

    expect(result.muscles.find(row => row.id === 'chest')?.sessions).toBe(2)
    expect(result.records[0]).toMatchObject({ exerciseId: chestPress, name: 'Press histórico', kind: 'strength', weightKg: 55, reps: 6, date: '2026-09-11' })
    expect(result.totalSessions).toBe(2)
    expect(result.rangeFrom).toBe('2026-06-21')
    expect(result.rangeTo).toBe('2026-09-12')
  })

  it('uses lifetime records through today while limiting muscle counts to 84 civil days', () => {
    const logs = [
      { id: 'old-best', user_id: owner, completed_at: '2026-01-01T15:00:00.000Z', session_context_snapshot: context() },
      { id: 'recent', user_id: owner, completed_at: '2026-09-12T15:00:00.000Z', session_context_snapshot: context() },
      { id: 'future', user_id: owner, completed_at: '2026-09-13T15:00:00.000Z', session_context_snapshot: context() },
    ]
    const exerciseLogs = [
      { id: 'old', progress_log_id: 'old-best', exercise_id: chestPress, sets_completed: 1, weights_kg: [100], reps_completed: [5] },
      { id: 'recent', progress_log_id: 'recent', exercise_id: chestPress, sets_completed: 1, weights_kg: [60], reps_completed: [10] },
      { id: 'future', progress_log_id: 'future', exercise_id: chestPress, sets_completed: 1, weights_kg: [150], reps_completed: [3] },
    ]

    const result = projectFitnessCard({ ownerId: owner, logs, exerciseLogs, exercises, timeZone: 'America/Havana', language: 'en', now })

    expect(result.records[0]).toMatchObject({ name: 'Historic bench', weightKg: 100, reps: 5, date: '2026-01-01' })
    expect(result.muscles.find(row => row.id === 'chest')?.sessions).toBe(1)
    expect(result.totalSessions).toBe(1)
  })

  it('excludes attendance, skipped and malformed evidence without inventing bodyweight records', () => {
    const logs = [
      { id: 'attendance', user_id: owner, completed_at: '2026-09-10T15:00:00.000Z', mobile_session_kind: 'free', mobile_free_training: { detailLevel: 'attendance' }, session_context_snapshot: context() },
      { id: 'partial', user_id: owner, completed_at: '2026-09-11T15:00:00.000Z', mobile_session_kind: 'free', mobile_free_training: { detailLevel: 'partial' }, session_context_snapshot: context() },
    ]
    const exerciseLogs = [
      { id: 'attendance-set', progress_log_id: 'attendance', exercise_id: chestPress, sets_completed: 1, weights_kg: [90], reps_completed: [5] },
      { id: 'skipped', progress_log_id: 'partial', exercise_id: chestPress, sets_completed: 1, weights_kg: [80], reps_completed: [6], status: 'skipped' },
      { id: 'missing-weight', progress_log_id: 'partial', exercise_id: chestFly, sets_completed: 1, weights_kg: [null], reps_completed: [20] },
    ]

    const result = projectFitnessCard({ ownerId: owner, logs, exerciseLogs, exercises, timeZone: 'UTC', language: 'es', now })

    expect(result.records).toEqual([])
    expect(result.muscles.every(row => row.sessions === 0)).toBe(true)
    expect(result.totalSessions).toBe(2)
    expect(result.partialSessions).toBe(1)
  })

  it('accepts explicit zero-weight bodyweight sets and persisted per-set duration only', () => {
    const durationContext = context([{ exerciseId: plank, name: 'Plank', nameEs: 'Plancha histórica', muscleGroups: ['core'], muscleGroupsEs: ['abdominales'], isCompound: false }])
    const logs = [
      { id: 'body', user_id: owner, completed_at: '2026-09-10T15:00:00.000Z', session_context_snapshot: context() },
      { id: 'timed', user_id: owner, completed_at: '2026-09-11T15:00:00.000Z', session_context_snapshot: durationContext,
        mobile_session_payload: { exercises: [{ exerciseId: plank, status: 'completed', sets: [{ completed: true, weightKg: '0', reps: '0', durationSeconds: 75 }] }] } },
    ]
    const exerciseLogs = [
      { id: 'body-set', progress_log_id: 'body', exercise_id: chestPress, sets_completed: 1, weights_kg: [0], reps_completed: [18] },
      { id: 'timed-set', progress_log_id: 'timed', exercise_id: plank, sets_completed: 1, weights_kg: [0], reps_completed: [0], duration_seconds: 75 },
    ]

    const result = projectFitnessCard({ ownerId: owner, logs, exerciseLogs, exercises, timeZone: 'UTC', language: 'es', now })

    expect(result.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ exerciseId: chestPress, kind: 'strength', weightKg: 0, reps: 18 }),
      expect.objectContaining({ exerciseId: plank, kind: 'duration', weightKg: null, reps: null, seconds: 75 }),
    ]))
  })

  it('rejects per-set duration metadata without a matching completed exercise row', () => {
    const durationContext = context([{ exerciseId: plank, name: 'Plank', nameEs: 'Plancha', muscleGroups: ['core'], muscleGroupsEs: ['abdominales'], isCompound: false }])
    const logs = [{
      id: 'timed', user_id: owner, completed_at: '2026-09-11T15:00:00.000Z', session_context_snapshot: durationContext,
      mobile_session_payload: { exercises: [{ exerciseId: plank, status: 'completed', sets: [{ completed: true, weightKg: '0', reps: '0', durationSeconds: 75 }] }] },
    }]
    const exerciseLogs = [{ id: 'timed-set', progress_log_id: 'timed', exercise_id: plank, sets_completed: null, weights_kg: [0], reps_completed: [0], duration_seconds: 75 }]

    const result = projectFitnessCard({ ownerId: owner, logs, exerciseLogs, exercises, timeZone: 'UTC', language: 'es', now })

    expect(result.records).toEqual([])
    expect(result.muscles.every(row => row.sessions === 0)).toBe(true)
  })

  it('deduplicates repeated rows and returns at most twelve deterministic records', () => {
    const catalog = Array.from({ length: 13 }, (_, index) => ({ id: `exercise-${index}`, name: `Exercise ${index}`, muscle_groups: ['chest'] }))
    const logs = [{ id: 'one', user_id: owner, completed_at: '2026-09-12T15:00:00.000Z', session_context_snapshot: null }]
    const exerciseLogs = catalog.flatMap((exercise, index) => {
      const row = { id: `row-${index}`, progress_log_id: 'one', exercise_id: exercise.id, sets_completed: 1, weights_kg: [index + 1], reps_completed: [5] }
      return index === 12 ? [row, { ...row }] : [row]
    })

    const result = projectFitnessCard({ ownerId: owner, logs, exerciseLogs, exercises: catalog, timeZone: 'UTC', language: 'en', now })

    expect(result.records).toHaveLength(12)
    expect(result.records.map(row => row.weightKg)).toEqual([13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
    expect(result.muscles.find(row => row.id === 'chest')?.sessions).toBe(1)
  })
})

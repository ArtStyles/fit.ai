import { describe, expect, it } from 'vitest'
import { buildMuscleActivity, buildMuscleBreakdown, type MuscleActivityInput } from './activity'
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
      { muscleGroups: ['abdominales'], sets: 2, date: '2026-09-10', exerciseId: id, exerciseName: 'Plancha', sessionId: 'log', sessionName: 'Sesión', completedAt: '2026-09-11T02:00:00Z' },
      { muscleGroups: ['chest'], sets: 3, date: '2026-09-10', exerciseId: 'bodyweight', exerciseName: 'Push-up', sessionId: 'log', sessionName: 'Sesión', completedAt: '2026-09-11T02:00:00Z' },
    ])
  })

  it('preserves the frozen names and muscles for each session after catalogue changes', () => {
    const earlier = { ...snapshot, workout: { ...snapshot.workout, name: 'Torso original' }, exercises: [
      { ...snapshot.exercises[0], name: 'Press', nameEs: 'Press antiguo', muscleGroups: ['chest'], muscleGroupsEs: ['pecho'] },
    ] }
    const later = { ...snapshot, workout: { ...snapshot.workout, name: 'Torso nuevo' }, exercises: [
      { ...snapshot.exercises[0], name: 'Row', nameEs: 'Remo nuevo', muscleGroups: ['back'], muscleGroupsEs: ['espalda'] },
    ] }
    const result = buildHistoricalMuscleActivity([
      { id: 'el-old', progress_log_id: 'old', exercise_id: id, sets_completed: 3, exercise: null },
      { id: 'el-new', progress_log_id: 'new', exercise_id: id, sets_completed: 4, exercise: { name: 'Unrelated current name', muscle_groups: ['legs'] } },
    ], [
      { id: 'old', completed_at: '2026-09-04T16:00:00Z', session_context_snapshot: earlier },
      { id: 'new', completed_at: '2026-09-10T16:00:00Z', session_context_snapshot: later },
    ], 'UTC', 'es')
    expect(result[0]).toMatchObject({ exerciseLogId: 'el-old', exerciseId: id, exerciseName: 'Press antiguo', muscleGroups: ['pecho'], sessionName: 'Torso original' })
    expect(result[1]).toMatchObject({ exerciseLogId: 'el-new', exerciseName: 'Remo nuevo', muscleGroups: ['espalda'], sessionName: 'Torso nuevo' })
    expect(buildMuscleBreakdown(result, 'chest').exercises[0]).toMatchObject({ exerciseName: 'Press antiguo', sets: 3 })
    expect(buildMuscleBreakdown(result, 'back').exercises[0]).toMatchObject({ exerciseName: 'Remo nuevo', sets: 4 })
  })

  it('does not infer a deleted exercise id from snapshot position and localizes absent session metadata', () => {
    const rows = [{ id: 'el-unknown', progress_log_id: 'log', exercise_id: null, sets_completed: 2, exercise: null }]
    const result = buildHistoricalMuscleActivity(rows,
      [{ id: 'log', completed_at: '2026-09-10T16:00:00Z', session_context_snapshot: snapshot }], 'UTC', 'es')
    expect(result[0]).toMatchObject({ exerciseId: null, exerciseLogId: 'el-unknown', exerciseName: 'Ejercicio', muscleGroups: [], sessionName: 'Sesión' })
    const english = buildHistoricalMuscleActivity(rows,
      [{ id: 'log', completed_at: '2026-09-10T16:00:00Z', session_context_snapshot: null }], 'UTC', 'en')
    expect(english[0]).toMatchObject({ exerciseId: null, exerciseName: 'Exercise', sessionName: 'Workout' })
    const spanish = buildHistoricalMuscleActivity(rows,
      [{ id: 'log', completed_at: '2026-09-10T16:00:00Z', session_context_snapshot: null }], 'UTC', 'es')
    expect(spanish[0].sessionName).toBe('Entrenamiento')
  })
})

describe('muscle exercise breakdown', () => {
  const press: MuscleActivityInput = { exerciseId: 'press', exerciseName: 'Press', muscleGroups: ['chest', 'Pecho', 'Tríceps'], sets: 3, date: '2026-09-04', completedAt: '2026-09-04T16:00:00Z', sessionId: 'one', sessionName: 'Torso A' }
  const newerPress: MuscleActivityInput = { ...press, exerciseName: 'Press de banca', date: '2026-09-10', completedAt: '2026-09-10T16:00:00Z', sessionId: 'two', sessionName: 'Torso B' }
  const pushUps: MuscleActivityInput = { exerciseId: 'push-ups', exerciseName: 'Flexiones', muscleGroups: ['pecho', 'triceps'], sets: 6, date: '2026-09-10', sessionId: 'two', sessionName: 'Torso B' }

  it('explains 12 chest sets as six press and six bodyweight sets without duplicating aliases or compound work', () => {
    const rows = [press, newerPress, pushUps]
    const result = buildMuscleBreakdown(rows, 'chest', { from: '2026-09-04', to: '2026-09-10' })
    expect(result.sets).toBe(12)
    expect(result.exercises).toEqual([
      expect.objectContaining({ exerciseId: 'push-ups', exerciseName: 'Flexiones', sets: 6, sessions: [{ sessionId: 'two', sessionName: 'Torso B', date: '2026-09-10', sets: 6 }] }),
      expect.objectContaining({ exerciseId: 'press', exerciseName: 'Press de banca', sets: 6, sessions: [
        { sessionId: 'two', sessionName: 'Torso B', date: '2026-09-10', sets: 3 },
        { sessionId: 'one', sessionName: 'Torso A', date: '2026-09-04', sets: 3 },
      ] }),
    ])
    expect(buildMuscleBreakdown(rows, 'triceps').sets).toBe(12)
    expect(buildMuscleActivity(rows).totalSets).toBe(12)
    expect(buildMuscleBreakdown(rows, 'back')).toEqual({ sets: 0, exercises: [] })
  })

  it('keeps two adjacent seven-day periods disjoint and chooses a name from within each period', () => {
    const rows = [
      { ...press, date: '2026-08-27', sets: 20 },
      { ...press, date: '2026-08-28', completedAt: '2026-08-28T16:00:00Z', exerciseName: 'Press anterior', sets: 4 },
      { ...press, date: '2026-09-03', completedAt: '2026-09-03T16:00:00Z', exerciseName: 'Press anterior', sets: 5 },
      press, newerPress, pushUps,
      { ...press, date: '2026-09-11', sets: 20 },
    ]
    const current = buildMuscleBreakdown(rows, 'chest', { from: '2026-09-04', to: '2026-09-10' })
    const prior = buildMuscleBreakdown(rows, 'chest', { from: '2026-08-28', to: '2026-09-03' })
    expect(current.sets).toBe(12)
    expect(prior.sets).toBe(9)
    expect(prior.exercises[0].exerciseName).toBe('Press anterior')
    expect(current.exercises.find(row => row.exerciseId === 'press')?.exerciseName).toBe('Press de banca')
  })

  it('merges repeated entries of an identified exercise within a session while keeping unknown exercises separate', () => {
    const result = buildMuscleBreakdown([
      press, { ...press, sets: 2 },
      { ...press, exerciseId: null, exerciseLogId: 'missing-a', exerciseName: 'Ejercicio', sets: 1 },
      { ...press, exerciseId: null, exerciseLogId: 'missing-b', exerciseName: 'Ejercicio', sets: 1 },
      { ...press, exerciseId: null, exerciseName: 'Ejercicio', sets: 1 },
      { ...press, exerciseId: null, exerciseName: 'Ejercicio', sets: 1 },
      { ...press, exerciseId: 'deleted-but-frozen', exerciseName: 'Ejercicio retirado', sets: 2 },
    ], 'chest')
    expect(result.sets).toBe(11)
    expect(result.exercises).toHaveLength(6)
    expect(result.exercises[0]).toMatchObject({ exerciseId: 'press', sets: 5, sessions: [{ sessionId: 'one', sessionName: 'Torso A', date: '2026-09-04', sets: 5 }] })
    expect(result.exercises.find(row => row.exerciseId === 'deleted-but-frozen')?.sets).toBe(2)
    const unknown = result.exercises.filter(row => row.exerciseId === null)
    expect(unknown).toHaveLength(4)
    expect(new Set(unknown.map(row => row.key)).size).toBe(4)
  })

  it('applies identical valid-count and date rules to the map and its breakdown', () => {
    const rows = [
      { ...press, sets: 3.9 }, { ...press, sets: 0.9 }, { ...press, sets: -2 },
      { ...press, sets: NaN }, { ...press, sets: Infinity }, { ...press, sets: 0 },
      { ...press, date: '2026-09-99', sets: 50 },
      { ...press, date: '2026-09-05oops', sets: 50 },
      { ...press, date: undefined, sets: 50 },
    ]
    const range = { from: '2026-09-04', to: '2026-09-10' }
    expect(buildMuscleActivity(rows, range).totalSets).toBe(3)
    expect(buildMuscleBreakdown(rows, 'chest', range).sets).toBe(3)
    expect(buildMuscleBreakdown(rows, 'chest', { from: '2026-09-10', to: '2026-09-04' })).toEqual({ sets: 0, exercises: [] })
  })

  it('chooses the latest contributing name by timestamp and has deterministic ties independent of input order', () => {
    const rows = [newerPress, press, pushUps, { ...newerPress, exerciseName: 'Press vespertino', completedAt: '2026-09-10T20:00:00Z', sets: 1 }]
    const forward = buildMuscleBreakdown(rows, 'chest')
    expect(forward.exercises[0]).toMatchObject({ exerciseId: 'press', exerciseName: 'Press vespertino', sets: 7 })
    expect(buildMuscleBreakdown([...rows].reverse(), 'chest')).toEqual(forward)
    expect(buildMuscleBreakdown([{ muscleGroups: ['pecho'], sets: 2 }], 'chest').exercises[0]).toMatchObject({ exerciseId: null, sets: 2, sessions: [] })
  })

  it('lists sessions chronologically even when an older session contributed more sets', () => {
    const result = buildMuscleBreakdown([{ ...press, sets: 5 }, { ...newerPress, sets: 1 }], 'chest')
    expect(result.exercises[0].sessions.map(session => session.sessionId)).toEqual(['two', 'one'])
  })
})

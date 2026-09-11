import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NodeSqliteDriver } from '../../data/__tests__/node-sqlite-driver'
import { createAppStore, setAppStoreForTests } from '../storage'
import type { AppRow, AppState, AppStore } from '../types'
import { loadExerciseGoalsModel, removeExerciseGoal, saveExerciseGoal } from './data'

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SQUAT = '11111111-1111-4111-8111-111111111111'
const PLANK = '22222222-2222-4222-8222-222222222222'
const RETIRED = '33333333-3333-4333-8333-333333333333'
const PRESS = '44444444-4444-4444-8444-444444444444'
const GOAL_1 = 'aaaaaaaa-1111-4111-8111-111111111111'
const GOAL_2 = 'aaaaaaaa-2222-4222-8222-222222222222'
const GOAL_3 = 'aaaaaaaa-3333-4333-8333-333333333333'
const GOAL_4 = 'aaaaaaaa-4444-4444-8444-444444444444'

const drivers: NodeSqliteDriver[] = []
const snapshot = (workoutId: string, workoutName: string, exercises: Array<{ id: string; name: string; nameEs?: string; muscles?: string[]; musclesEs?: string[] }>) => ({
  version: 1,
  workout: { id: workoutId, name: workoutName, focus: null, dayOfWeek: null },
  plan: null,
  exercises: exercises.map(exercise => ({ exerciseId: exercise.id, name: exercise.name, nameEs: exercise.nameEs ?? null, muscleGroups: exercise.muscles ?? [], muscleGroupsEs: exercise.musclesEs ?? [], isCompound: false })),
})

function state(accountId = OWNER): AppState {
  return {
    version: 1, accountId, remoteUserId: accountId, email: '', revision: 0, remoteRevision: null, lastSyncedRevision: 0,
    tables: {
      profiles: [{ id: accountId, language: 'es', timezone: 'UTC' }],
      exercises: [
        { id: SQUAT, name: 'Squat', name_es: 'Sentadilla', muscle_groups: ['quadriceps'], muscle_groups_es: ['cuadriceps'], exercise_type: 'strength', is_public: true },
        { id: PLANK, name: 'Plank', name_es: 'Plancha', muscle_groups: ['core'], muscle_groups_es: ['zona media'], exercise_type: 'flexibility', is_public: true },
        { id: PRESS, name: 'Press', name_es: 'Press', muscle_groups: ['shoulders'], muscle_groups_es: ['hombros'], exercise_type: 'strength', is_public: true },
      ],
      progress_logs: [], exercise_logs: [],
    },
  }
}

async function setup(initial = state()): Promise<AppStore> {
  const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver)
  const store = await createAppStore(driver); await store.create(initial); setAppStoreForTests(store)
  return store
}

beforeEach(() => vi.setSystemTime(new Date('2026-09-11T18:00:00.000Z')))
afterEach(async () => {
  setAppStoreForTests(null); vi.useRealTimers()
  for (const driver of drivers.splice(0)) await driver.close()
})

describe('personal exercise goal mutations', () => {
  it('creates, idempotently retries, edits with CAS, and removes without touching history', async () => {
    const store = await setup()
    const create = { accountId: OWNER, id: GOAL_1, exerciseId: SQUAT, expectedVersion: null, target: { kind: 'strength' as const, weightKg: 60, reps: 10 } }
    expect(await saveExerciseGoal(create)).toEqual({ success: true })
    const revision = (await store.read())!.revision
    expect(await saveExerciseGoal(create)).toEqual({ success: true })
    expect((await store.read())!.revision).toBe(revision)

    expect(await saveExerciseGoal({ ...create, target: null })).toEqual({ success: false, error: 'Este objetivo cambió. Vuelve a abrirlo antes de guardar.' })
    expect(await saveExerciseGoal({ ...create, expectedVersion: 1, target: null })).toEqual({ success: true })
    const editedRevision = (await store.read())!.revision
    expect(await saveExerciseGoal({ ...create, expectedVersion: 1, target: null })).toEqual({ success: true })
    expect((await store.read())!.revision).toBe(editedRevision)
    expect((await loadExerciseGoalsModel()).goals[0]).toMatchObject({ id: GOAL_1, exerciseId: SQUAT, target: null, version: 2 })

    expect(await removeExerciseGoal({ accountId: OWNER, id: GOAL_1, expectedVersion: 1 })).toEqual({ success: false, error: 'Este objetivo cambió. Vuelve a abrirlo antes de quitarlo.' })
    expect(await removeExerciseGoal({ accountId: OWNER, id: GOAL_1, expectedVersion: 2 })).toEqual({ success: true })
    expect(await removeExerciseGoal({ accountId: OWNER, id: GOAL_1, expectedVersion: 2 })).toEqual({ success: true })
    expect((await store.read())!.tables.progress_logs).toEqual([])
  })

  it('enforces owner, UUID, numeric limits, unique exercises, and the three-goal maximum', async () => {
    const store = await setup()
    expect(await saveExerciseGoal({ accountId: OTHER, id: GOAL_1, exerciseId: SQUAT, expectedVersion: null, target: null })).toEqual({ success: false, error: 'La cuenta cambió. Vuelve a abrir esta pantalla.' })
    expect(await saveExerciseGoal({ accountId: OWNER, id: 'bad', exerciseId: SQUAT, expectedVersion: null, target: null })).toEqual({ success: false, error: 'Identificador de objetivo inválido.' })
    expect(await saveExerciseGoal({ accountId: OWNER, id: GOAL_1, exerciseId: SQUAT, expectedVersion: null, target: { kind: 'strength', weightKg: Infinity, reps: 10 } })).toEqual({ success: false, error: 'Revisa el peso y las repeticiones de la meta.' })
    expect(await saveExerciseGoal({ accountId: OWNER, id: GOAL_1, exerciseId: SQUAT, expectedVersion: null, target: null })).toEqual({ success: true })
    expect(await saveExerciseGoal({ accountId: OWNER, id: GOAL_2, exerciseId: SQUAT, expectedVersion: null, target: null })).toEqual({ success: false, error: 'Ya sigues este ejercicio.' })
    expect(await saveExerciseGoal({ accountId: OWNER, id: GOAL_2, exerciseId: PLANK, expectedVersion: null, target: { kind: 'duration', seconds: 60 } })).toEqual({ success: true })
    expect(await saveExerciseGoal({ accountId: OWNER, id: GOAL_3, exerciseId: PRESS, expectedVersion: null, target: null })).toEqual({ success: true })
    await store.mutate(draft => { draft.tables.exercises.push({ id: RETIRED, name: 'Retired', is_public: true, exercise_type: 'strength' }) })
    expect(await saveExerciseGoal({ accountId: OWNER, id: GOAL_4, exerciseId: RETIRED, expectedVersion: null, target: null })).toEqual({ success: false, error: 'Puedes seguir hasta tres ejercicios.' })
    expect((await loadExerciseGoalsModel()).goals).toHaveLength(3)
  })

  it('rejects a queued save after the active account changes', async () => {
    const store = await setup(); await store.create(state(OTHER)); await store.activate(OWNER)
    const switching = store.activate(OTHER)
    const saving = saveExerciseGoal({ accountId: OWNER, id: GOAL_1, exerciseId: SQUAT, expectedVersion: null, target: null })
    await switching
    expect(await saving).toEqual({ success: false, error: 'La cuenta cambió. Vuelve a abrir esta pantalla.' })
    expect((await store.read())!.tables.mobile_exercise_goals).toBeUndefined()
  })

  it('preserves an existing goal kind when the live catalog changes', async () => {
    const store = await setup()
    const input = { accountId: OWNER, id: GOAL_2, exerciseId: PLANK, expectedVersion: null, target: { kind: 'duration' as const, seconds: 40 } }
    expect(await saveExerciseGoal(input)).toEqual({ success: true })
    await store.mutate(draft => { draft.tables.exercises.find(row => row.id === PLANK)!.exercise_type = 'strength' })
    expect((await loadExerciseGoalsModel()).catalog.find(row => row.id === PLANK)?.kind).toBe('duration')
    expect(await saveExerciseGoal({ ...input, expectedVersion: 1, target: { kind: 'duration', seconds: 50 } })).toEqual({ success: true })
    expect((await loadExerciseGoalsModel()).goals[0]).toMatchObject({ kind: 'duration', target: { kind: 'duration', seconds: 50 }, version: 2 })
  })
})

describe('personal exercise goal evidence', () => {
  function addSession(tables: Record<string, AppRow[]>, input: {
    id: string; completedAt: string; exerciseId: string; weights?: unknown[]; reps?: unknown[]; skipReason?: string | null
    detailLevel?: 'attendance' | 'partial' | 'complete'; freeSets?: Array<{ weightKg: number; reps: number; durationSeconds?: number }>; historical?: { name: string; nameEs?: string }
  }) {
    const historical = input.historical ?? { name: input.exerciseId === RETIRED ? 'Old row' : 'Squat', nameEs: input.exerciseId === RETIRED ? 'Remo antiguo' : 'Sentadilla' }
    const workoutId = input.id.replace(/^(.{8})/, '99999999')
    tables.progress_logs.push({
      id: input.id, user_id: OWNER, completed_at: input.completedAt, workout_id: workoutId,
      session_context_snapshot: snapshot(workoutId, `Session ${input.id.slice(0, 4)}`, [{ id: input.exerciseId, ...historical, muscles: ['back'], musclesEs: ['espalda'] }]),
      ...(input.detailLevel ? { mobile_session_kind: 'free', mobile_free_training: { version: 1, detailLevel: input.detailLevel, exercises: [{ exerciseId: input.exerciseId, sets: input.freeSets ?? [] }] } } : {}),
    })
    tables.exercise_logs.push({ id: input.id.replace(/^(.{8})/, '88888888'), progress_log_id: input.id, exercise_id: input.exerciseId, sets_completed: Math.max(input.weights?.length ?? 0, input.reps?.length ?? 0, input.freeSets?.length ?? 0), weights_kg: input.weights, reps_completed: input.reps, duration_seconds: input.freeSets?.reduce((sum, set) => sum + (set.durationSeconds ?? 0), 0) ?? null, skip_reason: input.skipReason ?? null })
  }

  it('uses all valid owned strength history and requires weight plus reps from the same set', async () => {
    const initial = state()
    addSession(initial.tables, { id: '10000000-0000-4000-8000-000000000001', completedAt: '2020-01-01T12:00:00Z', exerciseId: SQUAT, weights: [60, 50], reps: [8, 12] })
    addSession(initial.tables, { id: '10000000-0000-4000-8000-000000000002', completedAt: '2026-01-01T12:00:00Z', exerciseId: SQUAT, weights: [65], reps: [5] })
    addSession(initial.tables, { id: '10000000-0000-4000-8000-000000000003', completedAt: '2026-02-01T12:00:00Z', exerciseId: SQUAT, weights: [null, 60, Number.NaN], reps: [20, 10, 30] })
    addSession(initial.tables, { id: '10000000-0000-4000-8000-000000000004', completedAt: '2027-01-01T12:00:00Z', exerciseId: SQUAT, weights: [100], reps: [10] })
    addSession(initial.tables, { id: '10000000-0000-4000-8000-000000000005', completedAt: '2026-03-01T12:00:00Z', exerciseId: SQUAT, weights: [80], reps: [10], skipReason: 'skipped' })
    await setup(initial)
    await saveExerciseGoal({ accountId: OWNER, id: GOAL_1, exerciseId: SQUAT, expectedVersion: null, target: { kind: 'strength', weightKg: 60, reps: 10 } })
    const goal = (await loadExerciseGoalsModel()).goals[0]
    expect(goal.points.map(point => point.sessionId)).toEqual([
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003',
    ])
    expect(goal.first?.best).toEqual({ weightKg: 60, reps: 8 })
    expect(goal.latest?.best).toEqual({ weightKg: 60, reps: 10 })
    expect(goal.best?.best).toEqual({ weightKg: 65, reps: 5 })
    expect(goal.achieved).toBe(true)
    expect(goal.achievedAt).toBe('2026-02-01T12:00:00Z')
  })

  it('uses validated free-workout seconds per set, never an older total, attendance, or malformed metadata', async () => {
    const initial = state()
    addSession(initial.tables, { id: '20000000-0000-4000-8000-000000000001', completedAt: '2025-01-01T12:00:00Z', exerciseId: PLANK, weights: [0, 0], reps: [0, 0], detailLevel: 'complete', freeSets: [{ weightKg: 0, reps: 0, durationSeconds: 45 }, { weightKg: 0, reps: 0, durationSeconds: 30 }] })
    addSession(initial.tables, { id: '20000000-0000-4000-8000-000000000002', completedAt: '2025-02-01T12:00:00Z', exerciseId: PLANK, weights: [0], reps: [0] })
    initial.tables.exercise_logs[1].duration_seconds = 75
    addSession(initial.tables, { id: '20000000-0000-4000-8000-000000000003', completedAt: '2025-03-01T12:00:00Z', exerciseId: PLANK, weights: [0], reps: [0], detailLevel: 'attendance', freeSets: [{ weightKg: 0, reps: 0, durationSeconds: 90 }] })
    addSession(initial.tables, { id: '20000000-0000-4000-8000-000000000004', completedAt: '2025-04-01T12:00:00Z', exerciseId: PLANK, weights: [0], reps: [0], detailLevel: 'partial', freeSets: [{ weightKg: 0, reps: 0, durationSeconds: Infinity }] })
    await setup(initial)
    await saveExerciseGoal({ accountId: OWNER, id: GOAL_2, exerciseId: PLANK, expectedVersion: null, target: { kind: 'duration', seconds: 50 } })
    const goal = (await loadExerciseGoalsModel()).goals[0]
    expect(goal.points).toHaveLength(1)
    expect(goal.points[0].sets).toEqual([{ weightKg: 0, reps: 0, seconds: 45 }, { weightKg: 0, reps: 0, seconds: 30 }])
    expect(goal.points[0].best).toEqual({ weightKg: 0, reps: 0, seconds: 45 })
    expect(goal.achieved).toBe(false)
  })

  it.each([false, true])('recognizes retired timed history regardless of session order (reverse=%s)', async reverse => {
    const initial = state()
    initial.tables.exercises = initial.tables.exercises.filter(row => row.id !== PLANK)
    addSession(initial.tables, { id: '20000000-0000-4000-8000-000000000001', completedAt: '2025-01-01T12:00:00Z', exerciseId: PLANK, weights: [0], reps: [0] })
    initial.tables.exercise_logs[0].duration_seconds = 90
    addSession(initial.tables, { id: '20000000-0000-4000-8000-000000000002', completedAt: '2025-02-01T12:00:00Z', exerciseId: PLANK, weights: [0], reps: [0], detailLevel: 'complete', freeSets: [{ weightKg: 0, reps: 0, durationSeconds: 45 }] })
    if (reverse) initial.tables.progress_logs.reverse()
    await setup(initial)
    expect((await loadExerciseGoalsModel()).catalog.find(row => row.id === PLANK)?.kind).toBe('duration')
    expect(await saveExerciseGoal({ accountId: OWNER, id: GOAL_2, exerciseId: PLANK, expectedVersion: null, target: { kind: 'duration', seconds: 40 } })).toEqual({ success: true })
    const goal = (await loadExerciseGoalsModel()).goals[0]
    expect(goal.points).toHaveLength(1)
    expect(goal.best?.best).toEqual({ weightKg: 0, reps: 0, seconds: 45 })
    expect(goal.achieved).toBe(true)
  })

  function addGuidedDuration(initial: AppState) {
    addSession(initial.tables, { id: '20000000-0000-4000-8000-000000000009', completedAt: '2025-01-01T12:00:00Z', exerciseId: PLANK, weights: [0, 0], reps: [0, 0] })
    const log = initial.tables.progress_logs.at(-1)!
    log.client_session_id = '20000000-0000-4000-8000-000000000099'
    log.mobile_session_payload = {
      clientSessionId: log.client_session_id, workoutId: log.workout_id,
      startedAt: Date.parse('2025-01-01T11:30:00Z'), finishedAt: Date.parse(log.completed_at), moodRating: null,
      exercises: [{ workoutExerciseId: '20000000-0000-4000-8000-000000000098', exerciseId: PLANK, name: 'Plank', targetReps: null, targetDuration: 45, status: 'active', sets: [
        { weightKg: '', reps: '', rpe: null, completed: true, durationSeconds: 45 },
        { weightKg: '', reps: '', rpe: null, completed: true, durationSeconds: 30 },
        { weightKg: '', reps: '', rpe: null, completed: false, durationSeconds: 120 },
      ] }],
    }
    initial.tables.exercise_logs.at(-1)!.duration_seconds = 75
    return log
  }

  it('uses completed individual durations in a guided session payload and recomputes after edits', async () => {
    const initial = state(); addGuidedDuration(initial)
    const store = await setup(initial)
    await saveExerciseGoal({ accountId: OWNER, id: GOAL_2, exerciseId: PLANK, expectedVersion: null, target: { kind: 'duration', seconds: 50 } })
    let goal = (await loadExerciseGoalsModel()).goals[0]
    expect(goal.points).toHaveLength(1)
    expect(goal.best?.best).toEqual({ weightKg: 0, reps: 0, seconds: 45 })
    expect(goal.points[0].sets).toEqual([{ weightKg: 0, reps: 0, seconds: 45 }, { weightKg: 0, reps: 0, seconds: 30 }])
    expect(goal.achieved).toBe(false)
    await store.mutate(draft => { draft.tables.progress_logs[0].mobile_session_payload.exercises[0].sets[0].durationSeconds = 60; draft.tables.exercise_logs[0].duration_seconds = 90 })
    goal = (await loadExerciseGoalsModel()).goals[0]
    expect(goal.best?.best.seconds).toBe(60)
    expect(goal.achieved).toBe(true)
  })

  it.each(['identity', 'finishedAt', 'skipped', 'duration', 'completed'] as const)('excludes invalid guided duration evidence: %s', async invalid => {
    const initial = state(); const log = addGuidedDuration(initial)
    if (invalid === 'identity') log.mobile_session_payload.clientSessionId = OTHER
    if (invalid === 'finishedAt') log.mobile_session_payload.finishedAt = Date.parse('2025-02-01T12:00:00Z')
    if (invalid === 'skipped') log.mobile_session_payload.exercises[0].status = 'skipped'
    if (invalid === 'duration') log.mobile_session_payload.exercises[0].sets[0].durationSeconds = -1
    if (invalid === 'completed') log.mobile_session_payload.exercises[0].sets.forEach((set: AppRow) => { set.completed = false })
    await setup(initial)
    await saveExerciseGoal({ accountId: OWNER, id: GOAL_2, exerciseId: PLANK, expectedVersion: null, target: { kind: 'duration', seconds: 20 } })
    const goal = (await loadExerciseGoalsModel()).goals[0]
    expect(goal.points).toEqual([])
    expect(goal.achieved).toBe(false)
  })

  it('includes public and own historical exercises with localized names and recomputes after a session edit', async () => {
    const initial = state()
    addSession(initial.tables, { id: '30000000-0000-4000-8000-000000000001', completedAt: '2025-01-01T12:00:00Z', exerciseId: RETIRED, weights: [30], reps: [8], historical: { name: 'Old row', nameEs: 'Remo antiguo' } })
    const store = await setup(initial)
    let model = await loadExerciseGoalsModel()
    expect(model.catalog.map(item => [item.id, item.name])).toEqual([
      [PLANK, 'Plancha'], [PRESS, 'Press'], [RETIRED, 'Remo antiguo'], [SQUAT, 'Sentadilla'],
    ])
    await saveExerciseGoal({ accountId: OWNER, id: GOAL_3, exerciseId: RETIRED, expectedVersion: null, target: { kind: 'strength', weightKg: 40, reps: 8 } })
    expect((await loadExerciseGoalsModel()).goals[0].latest?.best).toEqual({ weightKg: 30, reps: 8 })
    await store.mutate(draft => { draft.tables.exercise_logs[0].weights_kg = [40] })
    model = await loadExerciseGoalsModel()
    expect(model.goals[0]).toMatchObject({ name: 'Remo antiguo', achieved: true })
    expect(model.goals[0].latest?.best).toEqual({ weightKg: 40, reps: 8 })
  })
})

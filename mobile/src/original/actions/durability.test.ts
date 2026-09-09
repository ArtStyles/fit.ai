import { afterEach, describe, expect, it, vi } from 'vitest'
import { NodeSqliteDriver } from '../../data/__tests__/node-sqlite-driver'
import { createAppStore, setAppStoreForTests } from '../storage'
import { newLocalState } from '../defaults'
import { generatePlan } from './generatePlan'
import { authorizeSessionStart } from './authorizeSession'
import { saveSession, type SaveSessionPayload } from './saveSession'
import { saveOnboardingAnswers } from './onboarding'
import { defaultAnswers } from '@/app/onboarding/types'
import { previewStructuredPlanAdjustment, applyPlanAdjustment } from './adjustPlan'

const drivers: NodeSqliteDriver[] = []
afterEach(async () => { vi.useRealTimers(); vi.unstubAllGlobals(); setAppStoreForTests(null); for (const driver of drivers.splice(0)) await driver.close() })
async function setup() {
  const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver)
  const store = await createAppStore(driver); setAppStoreForTests(store)
  const initial = await newLocalState()
  Object.assign(initial.tables.profiles[0], { readiness_status: 'cleared', readiness_answers: {}, movement_limitations: [], cardio_preferences: ['walking'], preferred_workout_days: [2, 4, 6], timezone: 'UTC' })
  await store.create(initial)
  return { driver, store }
}
describe('original application actions on real SQLite', () => {
  it('generates the original engine plan offline and durably saves original session details exactly once', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-08T15:00:00Z'))
    const network = vi.fn(() => { throw new Error('Internet unavailable') }); vi.stubGlobal('fetch', network)
    const { store, driver } = await setup()
    const requestId = crypto.randomUUID()
    const generated = await generatePlan({ requestId })
    expect(generated.success, generated.error).toBe(true)
    expect(generated.daysCount).toBe(3)
    expect(await generatePlan({ requestId })).toEqual(generated)
    const initial = (await store.read())!
    expect(initial.tables.workout_plans).toHaveLength(1)
    expect(initial.tables.workout_plans[0].description).toBe('Ganar músculo')
    expect(initial.tables.workout_plans[0].goal).toBe('Ganar músculo')
    const workout = initial.tables.workouts.find(row => row.day_of_week === 2)!
    const prescribed = initial.tables.workout_exercises.filter(row => row.workout_id === workout.id)
    expect(prescribed.length).toBeGreaterThan(0)
    const clientSessionId = crypto.randomUUID()
    const authorization = await authorizeSessionStart(clientSessionId, workout.id)
    expect(authorization.success, 'Generated catalog IDs must pass the ORIGINAL context parser').toBe(true)
    const payload: SaveSessionPayload = { clientSessionId, workoutId: workout.id, startedAt: Date.now(), finishedAt: Date.now() + 60_000, moodRating: 4, exercises: prescribed.map((row, index) => ({ workoutExerciseId: row.id, exerciseId: row.exercise_id, name: initial.tables.exercises.find(ex => ex.id === row.exercise_id)!.name, targetSets: row.sets, targetReps: row.reps, targetRpe: row.target_rpe, status: index === 0 ? 'completed' : 'skipped', skipReason: index === 0 ? null : 'Sin tiempo', sets: index === 0 ? [{ weightKg: '10', reps: '8', rpe: 7, completed: true }, { weightKg: '12', reps: '9', rpe: null, completed: true }] : [] })) }
    driver.failNextCommit()
    expect((await saveSession(payload)).success).toBe(false)
    expect((await store.read())!.tables.progress_logs).toHaveLength(0)
    const saved = await Promise.all([saveSession(payload), saveSession(payload)])
    expect(saved[0].success, saved[0].error).toBe(true)
    expect(saved[0]).toEqual(saved[1])
    const final = (await store.read())!
    expect(final.tables.progress_logs).toHaveLength(1)
    expect(final.tables.progress_logs[0].mobile_session_payload).toEqual(payload)
    expect(final.tables.exercise_logs[0].rpe_values).toEqual([7, null])
    expect(final.tables.exercise_logs.slice(1).every(row => row.skip_reason === 'Sin tiempo')).toBe(true)
    expect(network).not.toHaveBeenCalled()
  })

  it('keeps the existing onboarding form fields and equipment in the local profile', async () => {
    const { store } = await setup()
    await saveOnboardingAnswers({ ...defaultAnswers, full_name: 'María', goal: 'build_muscle', fitness_level: 'beginner', days_per_week: 3, session_duration: 45, gym_type: 'home_basic', equipment: ['dumbbells'], cardio_preferences: ['walking'], activity_level: 'insufficiently_active', age: '30', weight_kg: '70', height_cm: '170', gender: 'female' })
    expect((await store.read())!.tables.profiles[0]).toMatchObject({ full_name: 'María', available_equipment: ['dumbbells'], height_cm: 170, weight_kg: 70, onboarding_done: true, readiness_status: 'cleared' })
    expect((await store.read())!.tables.profiles[0].preferred_workout_days).toEqual([2, 4, 6])
  })

  it('previews and applies a schedule adjustment using original engine lineage', async () => {
    const { store } = await setup()
    const generated = await generatePlan({ requestId: crypto.randomUUID() })
    expect(generated.success, generated.error).toBe(true)
    const before = (await store.read())!
    const preview = await previewStructuredPlanAdjustment(generated.planId!, { type: 'change_days', daysPerWeek: 2, preferredWorkoutDays: [2, 5] })
    expect(preview.success, preview.error).toBe(true)
    expect((await store.read())!.revision).toBe(before.revision)
    const requestId = crypto.randomUUID()
    const result = await applyPlanAdjustment(generated.planId!, preview.intent, requestId)
    expect(result.success, result.error).toBe(true)
    expect(await applyPlanAdjustment(generated.planId!, preview.intent, requestId)).toEqual(result)
    const after = (await store.read())!
    expect(after.tables.workout_plans).toHaveLength(2)
    expect(after.tables.workout_plans[0]).toMatchObject({ is_active: false, id: generated.planId })
    expect(after.tables.workout_plans[0].superseded_at).toBeTruthy()
    expect(after.tables.workout_plans[1].family_id).toBe(after.tables.workout_plans[0].family_id)
    expect(after.tables.profiles[0].preferred_workout_days).toEqual([2, 5])
  })
})

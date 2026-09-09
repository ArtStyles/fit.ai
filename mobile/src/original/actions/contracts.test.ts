import { describe, expect, it } from 'vitest'
import { authorizeInState } from './authorizeSession'
import { saveInState, type SaveSessionPayload } from './saveSession'
import { changeMeasurement } from './measurements'
import { createManualInState, reorderInState } from './plan'
import type { AppState } from '../storage'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
function fixture(): AppState {
  return { version: 1, accountId: id(1), remoteUserId: null, email: '', revision: 0, remoteRevision: null, lastSyncedRevision: 0, tables: {
    profiles: [{ id: id(1), readiness_status: 'cleared', timezone: 'UTC', subscription_tier: 'free' }],
    workout_plans: [{ id: id(2), family_id: id(2), user_id: id(1), name: 'Plan original', week_number: 1, is_active: true, prescription_locked: false, library_slot: 'personal' }],
    workouts: [{ id: id(3), user_id: id(1), plan_id: id(2), name: 'Rutina original', focus: 'Fuerza', day_of_week: 2 }],
    workout_exercises: [{ id: id(4), workout_id: id(3), exercise_id: id(5), sets: 2, reps: 8, target_rpe: 8, order_index: 1 }],
    exercises: [{ id: id(5), name: 'Squat', name_es: 'Sentadilla', muscle_groups: ['quadriceps'], muscle_groups_es: ['cuadriceps'], is_compound: true, is_public: true }],
    progress_logs: [], exercise_logs: [], measurements: [], session_authorizations: [],
  } }
}
const now = new Date('2026-09-08T15:00:00.000Z')
function payload(): SaveSessionPayload {
  return { clientSessionId: id(6), workoutId: id(3), startedAt: now.getTime(), finishedAt: now.getTime() + 60_000, moodRating: 4, exercises: [{ workoutExerciseId: id(4), exerciseId: id(5), name: 'Sentadilla', targetSets: 2, targetReps: 8, targetRpe: 8, status: 'completed', sets: [{ weightKg: '20', reps: '8', rpe: 7, completed: true }, { weightKg: '22', reps: '9', rpe: 8, completed: true }] }] }
}
describe('original screen action contracts', () => {
  it('keeps complete session details and frozen context; retries cannot duplicate or rewrite them', async () => {
    const state = fixture()
    expect((await authorizeInState(state, id(6), id(3), now)).success).toBe(true)
    const first = await saveInState(state, payload(), new Date(now.getTime() + 60_000))
    expect(first.success).toBe(true)
    state.tables.workouts[0].name = 'Otro nombre después'
    const retry = await saveInState(state, { ...payload(), moodRating: 1 }, new Date(now.getTime() + 120_000))
    expect(retry).toEqual(first)
    expect(state.tables.progress_logs).toHaveLength(1)
    expect(state.tables.progress_logs[0].mood_rating).toBe(4)
    expect((state.tables.progress_logs[0].session_context_snapshot as any).workout.name).toBe('Rutina original')
    expect(state.tables.exercise_logs[0]).toMatchObject({ weights_kg: [20, 22], reps_completed: [8, 9], rpe_values: [7, 8] })
    expect((await authorizeInState(state, id(6), id(3), new Date(now.getTime() + 120_000))).success).toBe(true)
  })
  it('reserves the original daily slot before completion, including plan switches', async () => {
    const state = fixture()
    expect((await authorizeInState(state, id(6), id(3), now)).success).toBe(true)
    expect((await authorizeInState(state, id(7), id(3), now)).success).toBe(false)
    expect(state.tables.session_authorizations).toHaveLength(1)
    expect(state.tables.session_authorizations[0].policy_timezone).toBe('UTC')
    expect(state.tables.session_authorizations[0].policy_date).toBe('2026-09-08')
    expect(Date.parse(state.tables.session_authorizations[0].expires_at)).toBe(now.getTime() + 12 * 60 * 60_000)
  })
  it('rejects readiness blocks and a second session on the same day', async () => {
    const state = fixture()
    state.tables.profiles[0].readiness_status = 'professional_clearance_required'
    expect((await authorizeInState(state, id(6), id(3), now)).success).toBe(false)
    state.tables.profiles[0].readiness_status = 'cleared'
    await authorizeInState(state, id(6), id(3), now)
    await saveInState(state, payload(), new Date(now.getTime() + 60_000))
    expect((await authorizeInState(state, id(7), id(3), now)).success).toBe(false)
  })
  it('retains all eight optional measurement fields and their original validation', () => {
    const state = fixture()
    const value = { weight_kg: 78, body_fat_percentage: 20, muscle_mass_kg: 30, chest_cm: 90, waist_cm: 80, hips_cm: 95, arms_cm: 32, legs_cm: 55, notes: 'Control' }
    expect(changeMeasurement(state, 'create', null, value).success).toBe(true)
    expect(state.tables.measurements[0]).toMatchObject(value)
    expect(changeMeasurement(state, 'create', null, { weight_kg: -1 }).success).toBe(false)
    expect(state.tables.measurements).toHaveLength(1)
  })
  it('keeps personal tier limits and rejects foreign reorder IDs atomically', () => {
    const state = fixture()
    const form = new FormData(); form.set('name', 'Segundo'); form.set('daysPerWeek', '3')
    createManualInState(state, form)
    expect(() => createManualInState(state, form)).toThrow('plan_limit')
    const before = structuredClone(state.tables.workout_exercises)
    expect(reorderInState(state, id(2), id(3), [id(99)])).toBe(false)
    expect(state.tables.workout_exercises).toEqual(before)
  })
  it('does not permit modifying a professional prescription through session payloads or plan actions', async () => {
    const state = fixture()
    Object.assign(state.tables.workout_plans[0], { prescription_locked: true, trainer_assignment_id: id(20), trainer_assignment_version_id: id(21) })
    expect((await authorizeInState(state, id(6), id(3), now)).success).toBe(true)
    const original = structuredClone(state.tables.workout_exercises)
    expect(reorderInState(state, id(2), id(3), [id(4)])).toBe(false)
    const changed = payload(); changed.exercises[0].source = 'replacement'
    expect((await saveInState(state, changed, now)).success).toBe(false)
    expect(state.tables.progress_logs).toHaveLength(0)
    const saved = await saveInState(state, payload(), new Date(now.getTime() + 60_000))
    expect(saved.success).toBe(true)
    expect(state.tables.workout_exercises).toEqual(original)
    expect((state.tables.progress_logs[0].session_context_snapshot as any).plan).toMatchObject({ prescriptionLocked: true, trainerAssignmentId: id(20), trainerAssignmentVersionId: id(21) })
  })
  it('preserves one-day replacement and timed series without changing the plan exercise', async () => {
    const state = fixture()
    state.tables.exercises.push({ id: id(8), name: 'Bodyweight squat', name_es: 'Sentadilla sin peso', muscle_groups: ['quadriceps'], muscle_groups_es: ['cuadriceps'], is_compound: true, is_public: true })
    await authorizeInState(state, id(6), id(3), now)
    const changed = payload()
    Object.assign(changed.exercises[0], { exerciseId: id(8), originalExerciseId: id(5), originalName: 'Sentadilla', name: 'Sentadilla sin peso', source: 'replacement', targetReps: null, targetDuration: 45, sets: [{ weightKg: '', reps: '', completed: true, rpe: 6, durationSeconds: 45 }] })
    expect((await saveInState(state, changed, new Date(now.getTime() + 60_000))).success).toBe(true)
    expect(state.tables.exercise_logs[0]).toMatchObject({ exercise_id: id(8), duration_seconds: 45, notes: 'Cambio solo por hoy: reemplaza Sentadilla.' })
    expect(state.tables.progress_logs[0].mobile_session_payload).toEqual(changed)
    expect(state.tables.workout_exercises[0].exercise_id).toBe(id(5))
  })
})

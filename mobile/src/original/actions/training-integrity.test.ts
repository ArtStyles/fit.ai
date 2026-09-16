import { describe, expect, it } from 'vitest'
import { getWorkoutStartAccess } from '@/lib/workouts/access'
import { buildSchedulePresentation } from '@/lib/workouts/occurrences'
import { buildWeekContinuity, type WeekContinuityLog } from '@/lib/dashboard/weekContinuity'
import { authorizeInState } from './authorizeSession'
import { saveInState, type SaveSessionPayload } from './saveSession'
import { rescheduleInState, scheduleInState } from './rescheduleWorkout'
import { stateClient } from './state'
import { saveFreeTrainingInState } from '../free-training/data'
import type { FreeTrainingInput } from '../free-training/types'
import type { AppState } from '../types'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const now = new Date('2026-09-08T15:00:00Z')
const finish = new Date('2026-09-08T15:01:00Z')
function fixture(): AppState {
  return { version: 1, accountId: id(1), remoteUserId: null, email: '', revision: 0, remoteRevision: null, lastSyncedRevision: 0, tables: {
    profiles: [{ id: id(1), readiness_status: 'cleared', timezone: 'UTC', language: 'es' }],
    workout_plans: [{ id: id(2), family_id: id(2), user_id: id(1), name: 'Plan', week_number: 1, is_active: true, prescription_locked: true, trainer_assignment_id: id(20), trainer_assignment_version_id: id(21) }],
    workouts: [{ id: id(3), user_id: id(1), plan_id: id(2), name: 'Martes', focus: 'Fuerza', day_of_week: 2 }],
    workout_exercises: [{ id: id(4), workout_id: id(3), exercise_id: id(5), sets: 1, reps: 8, target_rpe: 8, order_index: 1 }],
    exercises: [{ id: id(5), name: 'Squat', name_es: 'Sentadilla', muscle_groups: ['quadriceps'], is_compound: true, is_public: true }],
    progress_logs: [], exercise_logs: [], session_authorizations: [],
  } }
}
function free(overrides: Partial<FreeTrainingInput> = {}): FreeTrainingInput {
  return { accountId: id(1), sessionId: id(30), operationId: id(31), expectedVersion: null, date: '2026-09-08', name: 'Libre', durationMinutes: null, notes: '', detailLevel: 'attendance', exercises: [], ...overrides }
}
function payload(): SaveSessionPayload {
  return { clientSessionId: id(6), workoutId: id(3), startedAt: now.getTime(), finishedAt: finish.getTime(), moodRating: 4,
    exercises: [{ workoutExerciseId: id(4), exerciseId: id(5), name: 'Sentadilla', status: 'completed', sets: [{ weightKg: '20', reps: '8', rpe: 7, completed: true }] }] }
}
const access = (state: AppState) => getWorkoutStartAccess({ supabase: stateClient(state), userId: state.accountId, workoutId: id(3), date: now, timeZone: 'UTC', localSchedule: scheduleInState(state) })

describe('guided quota alongside free training', () => {
  it.each(['before-authorization', 'during-guided', 'after-guided'] as const)('keeps free evidence %s independent of the guided slot and retries', async order => {
    const state = fixture()
    const prescription = structuredClone(state.tables.workout_exercises)
    if (order === 'before-authorization') expect(saveFreeTrainingInState(state, free(), now).success).toBe(true)
    const authorized = await authorizeInState(state, id(6), id(3), now)
    expect(authorized.success).toBe(true)
    const lease = structuredClone(state.tables.session_authorizations[0])
    if (order === 'during-guided') expect(saveFreeTrainingInState(state, free(), now).success).toBe(true)
    expect(await authorizeInState(state, id(6), id(3), now)).toEqual(authorized)
    expect((await authorizeInState(state, id(7), id(3), now)).success).toBe(false)
    const saved = await saveInState(state, payload(), finish)
    expect(saved.success, saved.error).toBe(true)
    if (order === 'after-guided') expect(saveFreeTrainingInState(state, free(), finish).success).toBe(true)
    const beforeRetry = structuredClone(state)
    expect(await saveInState(state, { ...payload(), moodRating: 1 }, finish)).toEqual(saved)
    expect(saveFreeTrainingInState(state, free({ name: 'Changed retry' }), finish).success).toBe(true)
    expect(state).toEqual(beforeRetry)
    expect(state.tables.progress_logs).toHaveLength(2)
    expect(state.tables.exercise_logs).toHaveLength(1)
    expect(state.tables.session_authorizations).toHaveLength(1)
    expect(state.tables.session_authorizations[0]).toEqual({ ...lease, consumed_at: finish.toISOString() })
    expect(state.tables.workout_exercises).toEqual(prescription)
    expect(state.tables.progress_logs.find(row => row.workout_id === id(3))?.session_context_snapshot).toMatchObject({ plan: { prescriptionLocked: true, trainerAssignmentId: id(20), trainerAssignmentVersionId: id(21) } })
    expect((await access(state)).allowed).toBe(false)
    expect((await authorizeInState(state, id(7), id(3), finish)).success).toBe(false)
    expect((await authorizeInState(state, id(8), id(3), new Date('2026-09-09T15:00:00Z'))).success).toBe(false)
  })

  it('keeps calendar start and rescheduling available after attendance while retaining weekly evidence', async () => {
    const state = fixture()
    expect(saveFreeTrainingInState(state, free(), now).success).toBe(true)
    const schedule = scheduleInState(state)
    expect(await access(state)).toMatchObject({ allowed: true })
    expect(buildSchedulePresentation(state.tables.workouts as any, schedule, now, 'UTC').startableWorkoutIds).toEqual([id(3)])
    // Dashboard history queries omit mobile metadata; the local schedule has the full record.
    const weekLog = { ...state.tables.progress_logs[0] }; delete weekLog.mobile_session_kind
    const [today] = buildWeekContinuity({ activeWorkouts: state.tables.workouts as any, weekLogs: [weekLog as WeekContinuityLog],
      dates: [{ isoDay: 2, dateStr: '2026-09-08' }], today: '2026-09-08', timeZone: 'UTC', localSchedule: schedule })
    expect(today).toMatchObject({ hasTrainingEvidence: true, canStartScheduledWorkout: true, isScheduledWorkoutCompleted: false, completedEvidence: { logId: id(30) } })
    state.tables.workouts[0].day_of_week = 3
    expect(rescheduleInState(state, { accountId: id(1), planId: id(2), workoutId: id(3), sourceDate: '2026-09-09', targetDate: '2026-09-08' }, now).success).toBe(true)
  })

  it('can finish after an earlier free entry is moved into the authorized day', async () => {
    const state = fixture()
    expect(saveFreeTrainingInState(state, free({ date: '2026-09-07' }), now).success).toBe(true)
    expect((await authorizeInState(state, id(6), id(3), now)).success).toBe(true)
    expect(saveFreeTrainingInState(state, free({ expectedVersion: 1, operationId: id(32) }), now).success).toBe(true)
    expect((await saveInState(state, payload(), finish)).success).toBe(true)
  })

  it.each([{}, { mobile_session_kind: 'unknown' }, { mobile_session_kind: 'free', workout_id: id(40) }])('retains daily blocking for legacy or guided records: %j', metadata => {
    const state = fixture()
    state.tables.progress_logs.push({ id: id(50), user_id: id(1), workout_id: null, completed_at: now.toISOString(), ...metadata })
    expect(buildSchedulePresentation(state.tables.workouts as any, scheduleInState(state), now, 'UTC').startableWorkoutIds).toEqual([])
  })

  it('ignores foreign evidence without borrowing foreign workouts or leases', async () => {
    const state = fixture()
    state.tables.progress_logs.push({ id: id(50), user_id: id(99), workout_id: id(3), completed_at: now.toISOString() })
    const foreign = fixture(); foreign.accountId = id(99); foreign.tables.profiles[0].id = id(99)
    const source = fixture(); await authorizeInState(source, id(6), id(3), now)
    state.tables.session_authorizations.push({ ...source.tables.session_authorizations[0], user_id: id(99), consumed_at: now.toISOString() })
    expect((await authorizeInState(state, id(6), id(3), now)).success).toBe(true)
    expect((await saveInState(state, payload(), finish)).success).toBe(true)
    expect((await authorizeInState(foreign, id(6), id(3), now)).success).toBe(false)
  })

  it('free evidence never revives an expired lease or permits a prescription replacement', async () => {
    const state = fixture(); await authorizeInState(state, id(6), id(3), now)
    saveFreeTrainingInState(state, free(), now)
    const changed = payload(); changed.exercises[0].source = 'replacement'
    expect((await saveInState(state, changed, finish)).success).toBe(false)
    expect((await saveInState(state, payload(), new Date('2026-09-09T04:00:00Z'))).success).toBe(false)
    expect(state.tables.progress_logs).toHaveLength(1)
    expect(state.tables.session_authorizations[0].consumed_at).toBeNull()
  })

  it('rejects a different guided workout on the same day at both authorization and save', async () => {
    const state = fixture()
    state.tables.workouts.push({ ...state.tables.workouts[0], id: id(40) })
    state.tables.workout_exercises.push({ ...state.tables.workout_exercises[0], id: id(41), workout_id: id(40) })
    // A stale second lease must not bypass the save boundary's independent quota check.
    const otherAttempt = structuredClone(state)
    expect((await authorizeInState(otherAttempt, id(42), id(40), now)).success).toBe(true)
    expect((await authorizeInState(state, id(6), id(3), now)).success).toBe(true)
    expect(saveFreeTrainingInState(state, free(), now).success).toBe(true)
    expect((await saveInState(state, payload(), finish)).success).toBe(true)
    const secondAccess = await getWorkoutStartAccess({ supabase: stateClient(state), userId: state.accountId, workoutId: id(40), date: finish, timeZone: 'UTC', localSchedule: scheduleInState(state) })
    expect(secondAccess).toMatchObject({ allowed: false, reason: 'another_session_today' })
    expect((await authorizeInState(state, id(42), id(40), finish)).success).toBe(false)
    state.tables.session_authorizations.push(otherAttempt.tables.session_authorizations[0])
    const second = payload(); second.clientSessionId = id(42); second.workoutId = id(40); second.exercises[0].workoutExerciseId = id(41)
    expect((await saveInState(state, second, finish)).success).toBe(false)
    expect(state.tables.progress_logs).toHaveLength(2)
    expect(state.tables.session_authorizations[1].consumed_at).toBeNull()
  })
})

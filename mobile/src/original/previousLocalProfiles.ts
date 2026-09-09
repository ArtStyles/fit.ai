import { Capacitor } from '@capacitor/core'
import { openNativeSqliteDriver } from '../data/native-driver'
import type { MobileSqliteDriver, SqliteRow } from '../data/driver'
import type { MobileAccount, MobilePlan, MobileSession, MobileMeasurement, MobilePrescription } from '../domain/types'
import { getAppStore, type AppStore, type AppState } from './storage'
import { newLocalState } from './defaults'
import { normalizeSessionSnapshot, saveBackup, loadBackup, type SessionSnapshot } from '@/lib/session/persistSession'
import { parseSessionContextSnapshot } from '@/lib/session/contextSnapshot'

export interface PreviousLocalRecoveryOptions { store?: AppStore; driver?: MobileSqliteDriver }
export interface PreviousLocalRecoveryResult { recovered: number; skipped: number }
interface PreviousBundle {
  account: MobileAccount
  plans: MobilePlan[]
  sessions: MobileSession[]
  measurements: MobileMeasurement[]
  activePlanId: string | null
  sourceRows: Record<string, SqliteRow[]>
}
async function reader(options: PreviousLocalRecoveryOptions): Promise<MobileSqliteDriver> {
  if (options.driver) return options.driver
  if (!Capacitor.isNativePlatform()) throw new Error('La recuperación del APK anterior está disponible en Android.')
  // Reuses the named native connection. Never opens a second browser database
  // snapshot, runs the old repository schema, or closes/persists stale bytes.
  await getAppStore()
  return openNativeSqliteDriver()
}
async function availableTables(driver: MobileSqliteDriver): Promise<Set<string>> {
  const rows = await driver.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
  return new Set(rows.map(row => row.name))
}
export async function hasPreviousLocalProfiles(options: PreviousLocalRecoveryOptions = {}): Promise<boolean> {
  if (!options.driver && !Capacitor.isNativePlatform()) return false
  const driver = await reader(options)
  if (!(await availableTables(driver)).has('mobile_accounts')) return false
  return (await driver.query('SELECT id FROM mobile_accounts LIMIT 1')).length > 0
}
async function stableId(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).slice(0, 16)
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128
  const hex = [...bytes].map(item => item.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
async function readBundle(driver: MobileSqliteDriver, tables: Set<string>, accountRow: SqliteRow): Promise<PreviousBundle> {
  const account = JSON.parse(String(accountRow.payload_json)) as MobileAccount
  if (!account || typeof account.id !== 'string' || account.id !== accountRow.id || typeof account.name !== 'string' || !account.profile || typeof account.profile !== 'object' || account.remoteUserId !== accountRow.remote_user_id) throw new Error('Invalid previous account')
  const sourceRows: Record<string, SqliteRow[]> = { mobile_accounts: [accountRow] }
  for (const table of ['mobile_plans', 'mobile_sessions', 'mobile_measurements', 'mobile_outbox', 'mobile_active_plans']) {
    sourceRows[table] = tables.has(table) ? await driver.query(`SELECT * FROM ${table} WHERE account_id = ?`, [account.id]) : []
  }
  function payloads<T extends { accountId: string }>(table: string): T[] {
    return sourceRows[table].map(row => {
      const value = JSON.parse(String(row.payload_json)) as T
      if (!value || value.accountId !== account.id) throw new Error('Previous account owner mismatch')
      return value
    })
  }
  return { account, plans: payloads<MobilePlan>('mobile_plans'), sessions: payloads<MobileSession>('mobile_sessions'), measurements: payloads<MobileMeasurement>('mobile_measurements'), activePlanId: String(sourceRows.mobile_active_plans[0]?.plan_id ?? '') || null, sourceRows }
}
const validDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const numberOrNull = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null

async function convertBundle(bundle: PreviousBundle): Promise<AppState> {
  const previous = bundle.account; const input = previous.profile
  const state = await newLocalState()
  const accountId = await stableId(`vekira:previous-local-profile:${previous.id}`)
  state.accountId = accountId; state.remoteUserId = null; state.email = ''
  const profile = state.tables.profiles[0]
  Object.assign(profile, { id: accountId, username: `local_${accountId.slice(0, 8)}`, full_name: `${previous.name || 'Perfil local'} · versión anterior`, onboarding_done: true, language: input.language, fitness_level: input.fitnessLevel, primary_goal: input.primaryGoal, days_per_week: input.daysPerWeek, session_duration_minutes: input.sessionDurationMinutes, gym_type: input.gymType, available_equipment: input.availableEquipment ?? [], preferred_workout_days: input.preferredWorkoutDays, cardio_preferences: input.cardioPreferences ?? [], age: input.age ?? null, date_of_birth: null, readiness_status: input.readiness?.status ?? 'pending', readiness_answers: input.readiness ? { currentlyActive: input.readiness.currentlyActive, warningSymptoms: input.readiness.warningSymptoms, knownCardiovascularMetabolicOrRenalDisease: input.readiness.knownCardiovascularMetabolicOrRenalDisease, medicallyCleared: input.readiness.medicallyCleared, recentSurgery: input.readiness.recentSurgery } : {}, movement_limitations: input.readiness?.limitations ?? [], created_at: previous.createdAt, updated_at: previous.updatedAt })
  state.tables.mobile_previous_source = [{ id: previous.id, user_id: accountId, source: 'previous_reduced_apk', account: structuredClone(previous), plans: structuredClone(bundle.plans), sessions: structuredClone(bundle.sessions), measurements: structuredClone(bundle.measurements), source_rows: structuredClone(bundle.sourceRows), recovered_at: new Date().toISOString(), notice: 'Copia local independiente. Los datos ausentes en el formato anterior no se han inventado. Las rutinas profesionales quedan conservadas aquí hasta descargar sus versiones originales.' }]
  state.tables.session_drafts = []
  const cache = new Map<string, Promise<string>>()
  const mapId = (kind: string, id: string): Promise<string> => { const key = `${kind}:${id}`; if (!cache.has(key)) cache.set(key, stableId(`vekira:previous:${previous.id}:${key}`)); return cache.get(key)! }
  const exerciseCache = new Map<string, string>()
  async function exerciseId(prescription: MobilePrescription): Promise<string> {
    if (exerciseCache.has(prescription.exerciseId)) return exerciseCache.get(prescription.exerciseId)!
    const known = state.tables.exercises.find(row => row.id === prescription.exerciseId || row.external_id === prescription.exerciseId)
    const id = known?.id ?? await mapId('exercise', prescription.exerciseId)
    if (!known) state.tables.exercises.push({ id, name: prescription.name, name_es: prescription.name, instructions: prescription.instructions, instructions_es: prescription.instructions, image_url: prescription.imageUrl, muscle_groups: [], muscle_groups_es: [], equipment: [], equipment_es: [], is_compound: null, is_public: false, exercise_type: null, difficulty: null, movement_patterns: [], source: 'previous-local-import', external_id: prescription.exerciseId })
    exerciseCache.set(prescription.exerciseId, id)
    return id
  }
  for (const plan of bundle.plans) {
    if (plan.source !== 'personal' || !Array.isArray(plan.workouts)) continue
    const id = await mapId('plan', plan.id)
    state.tables.workout_plans.push({ id, user_id: accountId, family_id: id, name: plan.name, description: plan.notes || 'Recuperado del APK anterior', goal: null, days_per_week: plan.workouts.length, duration_weeks: null, week_number: null, difficulty: input.fitnessLevel, source_type: 'imported', library_slot: 'personal', prescription_locked: false, is_active: bundle.activePlanId === plan.id, generated_by_ai: false, ai_notes: plan.notes, generation_metadata: {}, created_at: plan.createdAt, updated_at: plan.updatedAt, superseded_at: null, retired_at: null, mobile_previous_id: plan.id })
    for (let index = 0; index < plan.workouts.length; index++) {
      const workout = plan.workouts[index]; const workoutId = await mapId('workout', workout.id)
      if (state.tables.workouts.some(row => row.id === workoutId)) throw new Error('Previous workout collision')
      state.tables.workouts.push({ id: workoutId, user_id: accountId, plan_id: id, name: workout.name, focus: null, day_of_week: workout.dayOfWeek, order_in_plan: index + 1, estimated_duration_minutes: input.sessionDurationMinutes, created_at: plan.createdAt })
      for (let order = 0; order < workout.exercises.length; order++) {
        const item = workout.exercises[order]
        state.tables.workout_exercises.push({ id: await mapId('prescription', item.id), workout_id: workoutId, exercise_id: await exerciseId(item), sets: item.sets, reps: item.reps, duration_seconds: item.durationSeconds, rest_seconds: item.restSeconds, target_rpe: item.targetRpe, weight_kg: item.weightKg, notes: null, order_index: order + 1, weight_suggestion_basis: null })
      }
    }
  }
  for (const session of bundle.sessions) {
    if (!validDate(session.startedAt) || !Array.isArray(session.exercises)) continue
    const workoutId = await mapId('workout', session.workoutId)
    const planId = await mapId('plan', session.planId)
    let workout = state.tables.workouts.find(row => row.id === workoutId)
    if (!workout) { workout = { id: workoutId, user_id: accountId, plan_id: null, name: session.workoutName, focus: null, day_of_week: null, order_in_plan: null, estimated_duration_minutes: null }; state.tables.workouts.push(workout) }
    const clientSessionId = await mapId('session', session.id)
    const snapshot: SessionSnapshot = { userId: accountId, clientSessionId, workoutId, workoutName: session.workoutName, startedAt: Date.parse(session.startedAt), ...(validDate(session.finishedAt) ? { finishedAt: Date.parse(session.finishedAt) } : {}), exercises: [] }
    for (const entry of session.exercises) {
      const prescription = entry.prescription; const id = await exerciseId(prescription)
      const catalog = state.tables.exercises.find(row => row.id === id)!
      snapshot.exercises.push({ workoutExerciseId: await mapId('prescription', prescription.id), exerciseId: id, originalExerciseId: null, originalName: null, name: prescription.name, imageUrl: prescription.imageUrl, instructions: prescription.instructions, muscleGroups: catalog.muscle_groups ?? [], isCompound: catalog.is_compound === true, targetSets: prescription.sets, targetReps: prescription.reps, targetDuration: prescription.durationSeconds, restSeconds: prescription.restSeconds, targetRpe: prescription.targetRpe ?? 7, suggestedWeight: prescription.weightKg, weightSuggestionBasis: null, notes: null, source: 'planned', skipReason: null, status: entry.sets.every(set => set.completed) ? 'completed' : entry.sets.some(set => set.completed) ? 'active' : 'pending', expanded: true, hasLastSessionData: false, previousPerformance: null, sets: entry.sets.map(set => ({ weightKg: set.weightKg == null ? '' : String(set.weightKg), reps: set.reps == null ? '' : String(set.reps), rpe: null, completed: set.completed, ...(set.durationSeconds == null ? {} : { durationSeconds: set.durationSeconds }) })) })
    }
    if (!validDate(session.finishedAt)) {
      state.tables.session_drafts.push({ id: clientSessionId, user_id: accountId, workout_id: workoutId, client_session_id: clientSessionId, source: 'previous_reduced_apk', snapshot, original_snapshot: structuredClone(session), recovered_at: new Date().toISOString(), can_resume_personal: session.source === 'personal' && !!normalizeSessionSnapshot(snapshot, workoutId, accountId) })
      continue
    }
    const plan = state.tables.workout_plans.find(row => row.id === planId)
    const context = parseSessionContextSnapshot({ version: 1, workout: { id: workoutId, name: session.workoutName, focus: null, dayOfWeek: workout.day_of_week ?? null }, plan: plan ? { id: plan.id, familyId: plan.family_id, name: plan.name, weekNumber: null, prescriptionLocked: false, trainerAssignmentId: null, trainerAssignmentVersionId: null } : null, exercises: snapshot.exercises.map(exercise => ({ exerciseId: exercise.exerciseId, name: exercise.name, nameEs: exercise.name, muscleGroups: exercise.muscleGroups, muscleGroupsEs: state.tables.exercises.find(row => row.id === exercise.exerciseId)?.muscle_groups_es ?? [], isCompound: exercise.isCompound })) })
    const progressId = await mapId('progress', session.id)
    state.tables.progress_logs.push({ id: progressId, user_id: accountId, client_session_id: clientSessionId, workout_id: workoutId, completed_at: session.finishedAt, duration_minutes: Math.max(1, Math.round((Date.parse(session.finishedAt) - Date.parse(session.startedAt)) / 60_000)), mood_rating: null, notes: session.notes || null, session_context_snapshot: context, session_result_snapshot: null, mobile_imported_session_rpe: session.rpe, mobile_previous_session: structuredClone(session) })
    for (let index = 0; index < snapshot.exercises.length; index++) {
      const exercise = snapshot.exercises[index]; const completed = exercise.sets.filter(set => set.completed)
      if (!completed.length) continue
      state.tables.exercise_logs.push({ id: await mapId('exercise-log', `${session.id}:${index}`), progress_log_id: progressId, exercise_id: exercise.exerciseId, sets_completed: completed.length, reps_completed: completed.map(set => set.reps === '' ? null : Number(set.reps)), weights_kg: completed.map(set => set.weightKg === '' ? null : Number(set.weightKg)), rpe_values: completed.map(() => null), duration_seconds: completed.reduce((sum, set) => sum + (set.durationSeconds ?? 0), 0) || null, notes: null, skip_reason: null })
    }
  }
  for (const measurement of bundle.measurements) {
    if (measurement.deletedAt || !validDate(measurement.date)) continue
    state.tables.measurements.push({ id: await mapId('measurement', measurement.id), user_id: accountId, recorded_at: measurement.date, weight_kg: numberOrNull(measurement.weightKg), waist_cm: numberOrNull(measurement.waistCm), body_fat_percentage: null, muscle_mass_kg: null, chest_cm: null, hips_cm: null, arms_cm: null, legs_cm: null, notes: measurement.notes || null, mobile_previous_measurement: structuredClone(measurement) })
  }
  return state
}

/** Explicit additive import. Old tables and remote identities are never modified. */
export async function recoverPreviousLocalProfiles(options: PreviousLocalRecoveryOptions = {}): Promise<PreviousLocalRecoveryResult> {
  const store = options.store ?? await getAppStore(); const driver = await reader(options)
  const tables = await availableTables(driver)
  if (!tables.has('mobile_accounts')) return { recovered: 0, skipped: 0 }
  const sources = await driver.query('SELECT * FROM mobile_accounts ORDER BY created_at, id')
  const captured = await store.read(); let lastCreated: string | null = null; let recovered = 0; let skipped = 0
  try {
    for (const source of sources) {
      const id = await stableId(`vekira:previous-local-profile:${String(source.id)}`)
      if ((await store.list()).some(state => state.accountId === id)) { skipped++; continue }
      let converted: AppState
      try { converted = await convertBundle(await readBundle(driver, tables, source)) } catch { skipped++; continue }
      const current = await store.read()
      if (current?.accountId !== (lastCreated ?? captured?.accountId)) throw new Error('El perfil cambió durante la recuperación. Los datos originales siguen intactos.')
      await store.create(converted); lastCreated = converted.accountId; recovered++
      // Expose only valid personal drafts; expired/trainer drafts remain in the
      // complete SQLite archive without fabricating a new professional lease.
      for (const row of converted.tables.session_drafts ?? []) {
        if (!row.can_resume_personal || loadBackup(converted.accountId, row.workout_id)) continue
        const saved = saveBackup(row.snapshot as SessionSnapshot)
        if (!saved.ok) throw new Error(`El perfil se recuperó, pero su borrador quedó solo en el respaldo SQLite: ${saved.error}`)
      }
    }
  } finally {
    if (captured && lastCreated && (await store.read())?.accountId === lastCreated) await store.activate(captured.accountId)
  }
  return { recovered, skipped }
}

import { parseSessionContextSnapshot, type SessionContextSnapshotV1 } from '@/lib/session/contextSnapshot'
import { MAX_SESSION_DURATION_SECONDS, MAX_SESSION_REPS, MAX_SESSION_SETS, MAX_SESSION_WEIGHT_KG } from '@/lib/session/limits'
import { summarizeExercisePerformance } from '@/lib/training-evidence/performance'
import { addCivilDays, civilWeekday, isCivilDate } from '@/lib/workouts/occurrences'
import { addDays, getLocalDateString, getLocalDayBounds, resolveUserTimeZone } from '@/lib/workouts/schedule'
import { getAppStore, type AppState, type AppStore, type AppRow } from '../storage'
import { uuid } from '../actions/state'
import type { FreeTrainingCatalogItem, FreeTrainingInput, FreeTrainingModel, FreeTrainingResult, FreeTrainingSet } from './types'

const fail = (error: string): FreeTrainingResult => ({ success: false, error })
const table = (state: AppState, name: string): AppRow[] => state.tables[name] ?? []
const ownProfile = (state: AppState) => table(state, 'profiles').find(row => row.id === state.accountId)
const activePlan = (state: AppState) => table(state, 'workout_plans').some(row => row.user_id === state.accountId && row.is_active && !row.retired_at && !row.superseded_at)
const timedCatalog = (row?: AppRow) => row?.exercise_type === 'cardio' || row?.exercise_type === 'flexibility'
const changed = () => new Error('La cuenta cambió. Vuelve a abrir esta pantalla.')
const cleanStrings = (value: unknown): string[] => Array.isArray(value) ? value.filter((part): part is string => typeof part === 'string' && part.trim() !== '') : []

function savedInput(row: AppRow, accountId: string): FreeTrainingInput {
  const meta = row.mobile_free_training
  if (row.user_id !== accountId || row.mobile_session_kind !== 'free' || row.workout_id !== null || !meta || !Number.isSafeInteger(meta.version) || meta.version < 1 || !parseSessionContextSnapshot(row.session_context_snapshot)) throw new Error('Este registro no es un entrenamiento libre editable.')
  return { accountId, sessionId: row.id, operationId: crypto.randomUUID(), expectedVersion: meta.version, date: meta.date, name: meta.name, durationMinutes: meta.durationMinutes, notes: meta.notes, detailLevel: meta.detailLevel, exercises: structuredClone(meta.exercises) }
}

// Use the profile zone's civil day bounds, including changes in offset across DST.
function occurrenceTime(date: string, zone: string, now: Date, existing?: AppRow): string {
  if (existing && getLocalDateString(new Date(existing.completed_at), zone) === date) return existing.completed_at
  if (date === getLocalDateString(now, zone)) return now.toISOString()
  let anchor = new Date(`${date}T12:00:00Z`)
  const difference = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${getLocalDateString(anchor, zone)}T12:00:00Z`)) / 86_400_000)
  anchor = addDays(anchor, difference, zone)
  let noon = new Date(getLocalDayBounds(anchor, zone).start.getTime() + 12 * 3_600_000)
  const clock = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(noon).map(part => [part.type, part.value]))
  noon = new Date(noon.getTime() + (12 * 3600 - Number(clock.hour) * 3600 - Number(clock.minute) * 60 - Number(clock.second)) * 1000)
  if (getLocalDateString(noon, zone) !== date) throw new Error('Selecciona una fecha válida.')
  return noon.toISOString()
}

function previousLogs(state: AppState, exerciseId: string, before: string, excludedId: string): AppRow[] {
  const parents = new Map(table(state, 'progress_logs').filter(row => row.user_id === state.accountId && row.id !== excludedId && Date.parse(row.completed_at) < Date.parse(before)).map(row => [row.id, row]))
  return table(state, 'exercise_logs').filter(row => row.exercise_id === exerciseId && row.sets_completed > 0 && parents.has(row.progress_log_id))
    .map(row => ({ ...row, completed_at: parents.get(row.progress_log_id)!.completed_at, parent: parents.get(row.progress_log_id)! }))
    .sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at))
}

export function saveFreeTrainingInState(state: AppState, input: FreeTrainingInput, now = new Date()): FreeTrainingResult {
  try {
    if (!input || input.accountId !== state.accountId || !uuid(input.accountId)) return fail('La cuenta cambió. Vuelve a abrir esta pantalla.')
    if (!uuid(input.sessionId) || !uuid(input.operationId)) return fail('Identificador de sesión inválido.')
    const profile = ownProfile(state)
    if (!profile) return fail('Perfil no encontrado.')
    const existing = table(state, 'progress_logs').find(row => row.id === input.sessionId || row.client_session_id === input.sessionId)
    if (existing) {
      savedInput(existing, input.accountId)
      if (existing.id !== input.sessionId) return fail('El identificador pertenece a otro registro.')
      if (existing.mobile_free_training.lastOperationId === input.operationId) return structuredClone(existing.mobile_free_training.result)
      if (input.expectedVersion !== existing.mobile_free_training.version) return fail('Este registro cambió. Vuelve a abrirlo antes de guardar.')
    } else if (input.expectedVersion !== null) return fail('El registro original ya no está disponible. Vuelve a abrirlo.')
    if (input.expectedVersion !== null && (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1)) return fail('Versión de registro inválida.')
    const zone = resolveUserTimeZone(profile.timezone)
    if (!isCivilDate(input.date) || input.date > getLocalDateString(now, zone)) return fail('Selecciona una fecha válida que no sea futura.')
    if (typeof input.name !== 'string' || input.name.length > 120 || typeof input.notes !== 'string' || input.notes.length > 2000) return fail('El nombre o la nota son demasiado largos.')
    if (input.durationMinutes !== null && (typeof input.durationMinutes !== 'number' || !Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > MAX_SESSION_DURATION_SECONDS / 60)) return fail('La duración debe estar entre 1 y 720 minutos.')
    if (input.weeklyGoal !== undefined && (!Number.isInteger(input.weeklyGoal) || input.weeklyGoal < 1 || input.weeklyGoal > 7)) return fail('La meta semanal debe estar entre 1 y 7.')
    if (!['attendance', 'partial', 'complete'].includes(input.detailLevel) || !Array.isArray(input.exercises) || input.exercises.length > 100 || (input.detailLevel === 'attendance' ? input.exercises.length !== 0 : input.exercises.length === 0)) return fail('Revisa el nivel de detalle y los ejercicios registrados.')
    const previousSnapshot = existing ? parseSessionContextSnapshot(existing.session_context_snapshot) : null
    const metadata: SessionContextSnapshotV1['exercises'] = []
    const seen = new Set<string>()
    const normalizedExercises = input.exercises.map(exercise => {
      if (!exercise || !uuid(exercise.exerciseId) || seen.has(exercise.exerciseId) || !Array.isArray(exercise.sets) || exercise.sets.length < 1 || exercise.sets.length > MAX_SESSION_SETS) throw new Error('Revisa los ejercicios y el número de series; no se permiten duplicados.')
      seen.add(exercise.exerciseId)
      const historical = previousSnapshot?.exercises.find(row => row.exerciseId === exercise.exerciseId)
      const catalog = table(state, 'exercises').find(row => row.id === exercise.exerciseId && row.is_public === true)
      if (!historical && !catalog) throw new Error('El ejercicio no está disponible en el catálogo público.')
      const oldExercise = existing?.mobile_free_training.exercises.find((row: { exerciseId: string }) => row.exerciseId === exercise.exerciseId)
      const timed = historical ? oldExercise?.sets.some((set: FreeTrainingSet) => set.durationSeconds !== undefined) === true : timedCatalog(catalog)
      const sets = exercise.sets.map(set => {
        if (!set || typeof set.weightKg !== 'number' || !Number.isFinite(set.weightKg) || set.weightKg < 0 || set.weightKg > MAX_SESSION_WEIGHT_KG || typeof set.reps !== 'number' || !Number.isInteger(set.reps) || set.reps < 0 || set.reps > MAX_SESSION_REPS) throw new Error('Revisa peso y repeticiones; hay valores fuera de rango.')
        if (timed ? (set.weightKg !== 0 || set.reps !== 0 || !Number.isInteger(set.durationSeconds) || set.durationSeconds! < 1 || set.durationSeconds! > MAX_SESSION_DURATION_SECONDS) : (set.reps < 1 || set.durationSeconds !== undefined)) throw new Error('Revisa las series: registra repeticiones o segundos positivos según el ejercicio.')
        return { weightKg: set.weightKg, reps: set.reps, ...(timed ? { durationSeconds: set.durationSeconds! } : {}) }
      })
      metadata.push(historical ? structuredClone(historical) : { exerciseId: exercise.exerciseId, name: String(catalog!.name ?? '').trim(), nameEs: catalog!.name_es?.trim() || null, muscleGroups: cleanStrings(catalog!.muscle_groups), muscleGroupsEs: cleanStrings(catalog!.muscle_groups_es), isCompound: catalog!.is_compound === true })
      return { exerciseId: exercise.exerciseId, sets }
    })
    const name = input.name.trim()
    const snapshot: SessionContextSnapshotV1 = { version: 1, workout: { id: input.sessionId, name: name || (profile.language === 'en' ? 'Free workout' : 'Entrenamiento libre'), focus: null, dayOfWeek: null }, plan: null, exercises: metadata }
    if (!parseSessionContextSnapshot(snapshot)) return fail('No se pudo conservar el contexto de los ejercicios.')
    const completedAt = occurrenceTime(input.date, zone, now, existing)
    const improvements: Extract<FreeTrainingResult, { success: true }>['improvements'] = []
    let volumeKg = 0
    const details = normalizedExercises.map((exercise, index) => {
      const performance = summarizeExercisePerformance(exercise.sets.map(set => set.weightKg), exercise.sets.map(set => set.reps))
      volumeKg += performance.volumeKg
      const previous = previousLogs(state, exercise.exerciseId, completedAt, input.sessionId)[0]
      const best = performance.bestSet
      const prior = previous ? summarizeExercisePerformance(previous.weights_kg, previous.reps_completed).bestSet : null
      if (best && prior && (best.weightKg > prior.weightKg || (best.weightKg === prior.weightKg && best.reps > prior.reps))) {
        const meta = metadata[index]
        improvements.push({ exerciseName: profile.language === 'en' ? meta.name : meta.nameEs || meta.name, previousWeightKg: prior.weightKg, previousReps: prior.reps, weightKg: best.weightKg, reps: best.reps })
      }
      return { id: crypto.randomUUID(), progress_log_id: input.sessionId, exercise_id: exercise.exerciseId, sets_completed: exercise.sets.length, weights_kg: exercise.sets.map(set => set.weightKg), reps_completed: exercise.sets.map(set => set.reps), rpe_values: exercise.sets.map(() => null), duration_seconds: exercise.sets.reduce((total, set) => total + (set.durationSeconds ?? 0), 0) || null, notes: null, skip_reason: null }
    })
    const monday = addCivilDays(input.date, 1 - civilWeekday(input.date)); const sunday = addCivilDays(monday, 6)
    const days = new Set(table(state, 'progress_logs').filter(row => row.user_id === state.accountId && row.id !== input.sessionId && Number.isFinite(Date.parse(row.completed_at))).map(row => getLocalDateString(new Date(row.completed_at), zone)).filter(date => date >= monday && date <= sunday))
    days.add(input.date)
    const version = (existing?.mobile_free_training.version ?? 0) + 1
    const result: FreeTrainingResult = { success: true, logId: input.sessionId, version, detailLevel: input.detailLevel, sets: normalizedExercises.reduce((total, exercise) => total + exercise.sets.length, 0), volumeKg, trainedDaysThisWeek: days.size, improvements }
    const log = { id: input.sessionId, user_id: state.accountId, client_session_id: input.sessionId, workout_id: null, completed_at: completedAt, updated_at: now.toISOString(), duration_minutes: input.durationMinutes, mood_rating: null, notes: input.notes.trim() || null, mobile_session_kind: 'free', session_context_snapshot: snapshot, session_detail_backup: details.map(({ id: _id, progress_log_id: _parent, ...detail }) => detail), mobile_free_training: { version, lastOperationId: input.operationId, date: input.date, name, notes: input.notes.trim(), durationMinutes: input.durationMinutes, detailLevel: input.detailLevel, exercises: normalizedExercises, result } }
    // All validation and computation completes before any caller state changes.
    state.tables.progress_logs = [...table(state, 'progress_logs').filter(row => row.id !== input.sessionId), log]
    state.tables.exercise_logs = [...table(state, 'exercise_logs').filter(row => row.progress_log_id !== input.sessionId), ...details]
    if (input.weeklyGoal !== undefined && !activePlan(state)) { profile.days_per_week = input.weeklyGoal; profile.updated_at = now.toISOString() }
    return structuredClone(result)
  } catch (error) { return fail(error instanceof Error ? error.message : 'No se pudo guardar el entrenamiento.') }
}

async function capture(accountId?: string) {
  const store = await getAppStore(); const version = store.sessionVersion(); const state = await store.read()
  if (!state || (accountId !== undefined && state.accountId !== accountId) || store.sessionVersion() !== version) throw changed()
  return { store, state, version }
}
const draftKey = (sessionId: string) => `free-training-draft:${sessionId}`
const latestDraftKey = 'free-training-latest-draft'
const cleared = new WeakMap<AppStore, Map<string, Set<string>>>()
function clearedOperations(store: AppStore, accountId: string, sessionId: string): Set<string> {
  let account = cleared.get(store); if (!account) { account = new Map(); cleared.set(store, account) }
  const key = `${accountId}:${sessionId}`; let operations = account.get(key)
  if (!operations) { operations = new Set(); account.set(key, operations) }
  return operations
}
function draftValue(value: unknown, accountId: string, sessionId: string): FreeTrainingInput | null {
  if (!value || typeof value !== 'object') return null
  const input = value as FreeTrainingInput
  return input.accountId === accountId && input.sessionId === sessionId && uuid(input.operationId) && (input.expectedVersion === null || (Number.isSafeInteger(input.expectedVersion) && input.expectedVersion > 0)) ? input : null
}
export async function loadFreeTrainingDraft(accountId: string, sessionId: string): Promise<FreeTrainingInput | null> {
  if (!uuid(accountId) || !uuid(sessionId)) throw new Error('Identificador de borrador inválido.')
  const { store, state, version } = await capture(accountId)
  const value = draftValue(await store.getAccountCache(draftKey(sessionId), accountId), accountId, sessionId)
  if (store.sessionVersion() !== version || (await store.read())?.accountId !== accountId) throw changed()
  const saved = table(state, 'progress_logs').find(row => row.id === sessionId)
  if (value && saved && (saved.mobile_session_kind !== 'free' || value.expectedVersion !== saved.mobile_free_training?.version || value.operationId === saved.mobile_free_training?.lastOperationId)) return null
  return value
}
export async function saveFreeTrainingDraft(input: FreeTrainingInput): Promise<void> {
  if (!uuid(input.accountId) || !uuid(input.sessionId) || !draftValue(input, input.accountId, input.sessionId)) throw new Error('Identificador de borrador inválido.')
  const json = JSON.stringify(input)
  if (new TextEncoder().encode(json).length > 512 * 1024) throw new Error('El borrador es demasiado grande.')
  const { store, state, version } = await capture(input.accountId)
  const existing = table(state, 'progress_logs').find(row => row.id === input.sessionId)
  if (clearedOperations(store, input.accountId, input.sessionId).has(input.operationId) || (existing && (existing.mobile_session_kind !== 'free' || input.expectedVersion !== existing.mobile_free_training?.version || input.operationId === existing.mobile_free_training?.lastOperationId))) throw new Error('Este borrador ya se guardó o descartó.')
  await store.setAccountCache(draftKey(input.sessionId), JSON.parse(json), version, input.accountId)
  await store.setAccountCache(latestDraftKey, input.sessionId, version, input.accountId)
}
export async function clearFreeTrainingDraft(accountId: string, sessionId: string): Promise<void> {
  if (!uuid(sessionId)) throw new Error('Identificador de borrador inválido.')
  const { store, version } = await capture(accountId)
  const current = draftValue(await store.getAccountCache(draftKey(sessionId), accountId), accountId, sessionId)
  if (current) clearedOperations(store, accountId, sessionId).add(current.operationId)
  await store.setAccountCache(draftKey(sessionId), null, version, accountId)
}
export async function saveFreeTraining(input: FreeTrainingInput): Promise<FreeTrainingResult> {
  try {
    const { store, version } = await capture(input.accountId)
    const result = await store.mutate(state => {
      if (store.sessionVersion() !== version || state.accountId !== input.accountId) throw changed()
      return saveFreeTrainingInState(state, input)
    })
    if (result.success) {
      clearedOperations(store, input.accountId, input.sessionId).add(input.operationId)
      // The workout is durable already. The page can retry/report cache cleanup;
      // stale cache entries are also rejected against the saved version on load.
      await clearFreeTrainingDraft(input.accountId, input.sessionId).catch(() => {})
    }
    return result
  } catch (error) { return fail(error instanceof Error ? error.message : 'No se pudo guardar en este dispositivo. Conservamos el borrador para reintentar.') }
}

export async function loadFreeTrainingModel(logId?: string, draftId?: string): Promise<FreeTrainingModel> {
  const { store, state, version } = await capture()
  const profile = ownProfile(state); if (!profile) throw new Error('Perfil no encontrado.')
  const language = profile.language === 'en' ? 'en' : 'es'
  const timeZone = resolveUserTimeZone(profile.timezone); const now = new Date(); const today = getLocalDateString(now, timeZone)
  if ((logId !== undefined && !uuid(logId)) || (draftId !== undefined && !uuid(draftId))) throw new Error('Identificador de sesión inválido.')
  if (logId === undefined && draftId === undefined) {
    const latest = await store.getAccountCache(latestDraftKey, state.accountId).catch(() => null)
    if (uuid(latest) && await loadFreeTrainingDraft(state.accountId, latest).catch(() => null)) draftId = latest
  }
  const existing = logId || draftId ? table(state, 'progress_logs').find(row => row.id === (logId ?? draftId)) : undefined
  if (logId && !existing) throw new Error('No se encontró el entrenamiento.')
  let initial: FreeTrainingInput = existing ? savedInput(existing, state.accountId) : { accountId: state.accountId, sessionId: draftId ?? crypto.randomUUID(), operationId: crypto.randomUUID(), expectedVersion: null, date: today, name: '', durationMinutes: null, notes: '', detailLevel: 'attendance', exercises: [] }
  // The page reports cache failures separately while keeping the saved form usable.
  const draft = await loadFreeTrainingDraft(state.accountId, initial.sessionId).catch(() => null)
  if (draft && draft.expectedVersion === initial.expectedVersion) initial = draft
  const historical = existing ? parseSessionContextSnapshot(existing.session_context_snapshot)?.exercises ?? [] : []
  const publicCatalog = table(state, 'exercises').filter(row => row.is_public === true && uuid(row.id))
  const ids = new Set([...publicCatalog.map(row => row.id), ...historical.map(row => row.exerciseId)])
  const before = isCivilDate(initial.date) && initial.date <= today ? occurrenceTime(initial.date, timeZone, now, existing) : now.toISOString()
  const catalog: FreeTrainingCatalogItem[] = [...ids].map(exerciseId => {
    const live = publicCatalog.find(row => row.id === exerciseId); const old = historical.find(row => row.exerciseId === exerciseId)
    const previous = previousLogs(state, exerciseId, before, initial.sessionId)[0]
    let sets: FreeTrainingSet[] | null = previous ? summarizeExercisePerformance(previous.weights_kg, previous.reps_completed).sets.map(({ weightKg, reps }) => ({ weightKg, reps })) : null
    const savedSets = previous?.parent.mobile_free_training?.exercises.find((row: { exerciseId: string }) => row.exerciseId === exerciseId)?.sets
    if (savedSets) sets = structuredClone(savedSets)
    const oldInput = existing?.mobile_free_training.exercises.find((row: { exerciseId: string }) => row.exerciseId === exerciseId)
    const timed = old ? oldInput?.sets.some((set: FreeTrainingSet) => set.durationSeconds !== undefined) === true : timedCatalog(live)
    // Older guided logs only retain total seconds: do not invent per-set durations.
    if (timed && sets?.some(set => !set.durationSeconds)) sets = null
    return { id: exerciseId, name: old ? (language === 'es' ? old.nameEs || old.name : old.name) : (language === 'es' ? live!.name_es || live!.name : live!.name), muscleGroups: old ? (language === 'es' && old.muscleGroupsEs.length ? old.muscleGroupsEs : old.muscleGroups) : cleanStrings(language === 'es' && live!.muscle_groups_es?.length ? live!.muscle_groups_es : live!.muscle_groups), timed, previous: sets, previousDate: sets && previous ? getLocalDateString(new Date(previous.completed_at), timeZone) : null }
  }).sort((a, b) => a.name.localeCompare(b.name, language))
  if (store.sessionVersion() !== version || (await store.read())?.accountId !== state.accountId) throw changed()
  return { accountId: state.accountId, language, timeZone, today, hasActivePlan: activePlan(state), weeklyGoal: Number.isInteger(profile.days_per_week) ? profile.days_per_week : null, catalog, initial, recent: table(state, 'progress_logs').filter(row => row.user_id === state.accountId && row.mobile_session_kind === 'free' && row.mobile_free_training).sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at)).slice(0, 10).map(row => ({ id: row.id, name: parseSessionContextSnapshot(row.session_context_snapshot)?.workout.name || (language === 'es' ? 'Entrenamiento libre' : 'Free workout'), date: row.mobile_free_training.date, detailLevel: row.mobile_free_training.detailLevel })) }
}

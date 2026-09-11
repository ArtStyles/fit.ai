import { parseSessionContextSnapshot, type SessionContextSnapshotV1 } from '@/lib/session/contextSnapshot'
import { MAX_SESSION_DURATION_SECONDS, MAX_SESSION_REPS, MAX_SESSION_SETS, MAX_SESSION_WEIGHT_KG } from '@/lib/session/limits'
import { getLocalDateString, resolveUserTimeZone } from '@/lib/workouts/schedule'
import { getAppStore } from '../storage'
import type { AppRow, AppState, AppStore } from '../types'
import type { ExerciseGoalsModel, GoalActionResult, GoalCatalogItem, GoalKind, GoalPoint, GoalSet, GoalTarget, PersonalExerciseGoal, RemoveExerciseGoalInput, SaveExerciseGoalInput } from './types'
import { isUuid, validGoalTarget } from './validation'

type CatalogSource = GoalCatalogItem & { nameEs: string | null; muscleGroupsEs: string[] }
type Captured = { store: AppStore; state: AppState; sessionVersion: number }

const table = (state: AppState, name: string): AppRow[] => state.tables[name] ?? []
const fail = (error: string): GoalActionResult => ({ success: false, error })
const changed = 'La cuenta cambió. Vuelve a abrir esta pantalla.'
const clone = <T,>(value: T): T => structuredClone(value)
const cleanStrings = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((part): part is string => typeof part === 'string' && part.trim().length > 0).map(part => part.trim()) : []
const timedCatalog = (row?: AppRow) => row?.exercise_type === 'cardio' || row?.exercise_type === 'flexibility'

function ownProfile(state: AppState): AppRow | undefined {
  return table(state, 'profiles').find(row => row.id === state.accountId)
}

function localized(source: CatalogSource, language: 'es' | 'en'): GoalCatalogItem {
  return {
    id: source.id,
    name: language === 'es' ? source.nameEs || source.name : source.name,
    muscleGroups: language === 'es' && source.muscleGroupsEs.length ? source.muscleGroupsEs : source.muscleGroups,
    kind: source.kind,
  }
}

function validFreeDurationSets(log: AppRow, exerciseId: string): GoalSet[] | null {
  if (log.mobile_session_kind !== 'free') return null
  const metadata = log.mobile_free_training
  if (!metadata || !['partial', 'complete'].includes(metadata.detailLevel) || !Array.isArray(metadata.exercises)) return null
  const matches = metadata.exercises.filter((exercise: unknown) => exercise && typeof exercise === 'object' && (exercise as AppRow).exerciseId === exerciseId)
  if (matches.length !== 1 || !Array.isArray(matches[0].sets) || matches[0].sets.length < 1 || matches[0].sets.length > MAX_SESSION_SETS) return null
  const sets: GoalSet[] = []
  for (const raw of matches[0].sets) {
    if (!raw || typeof raw !== 'object' || raw.weightKg !== 0 || raw.reps !== 0
      || !Number.isInteger(raw.durationSeconds) || raw.durationSeconds < 1 || raw.durationSeconds > MAX_SESSION_DURATION_SECONDS) return null
    sets.push({ weightKg: 0, reps: 0, seconds: raw.durationSeconds })
  }
  return sets
}

function validGuidedDurationSets(log: AppRow, exerciseId: string): GoalSet[] | null {
  if (log.mobile_session_kind === 'free') return null
  const payload = log.mobile_session_payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || !isUuid(payload.clientSessionId) || payload.clientSessionId !== log.client_session_id
    || !isUuid(payload.workoutId) || payload.workoutId !== log.workout_id
    || (payload.userId !== undefined && payload.userId !== log.user_id)
    || !Number.isFinite(payload.startedAt) || !Number.isFinite(payload.finishedAt)
    || payload.startedAt > payload.finishedAt || payload.finishedAt !== Date.parse(log.completed_at)
    || !Array.isArray(payload.exercises) || !payload.exercises.length || payload.exercises.length > 100) return null
  const matches = payload.exercises.filter((exercise: unknown): exercise is AppRow => !!exercise && typeof exercise === 'object' && (exercise as AppRow).exerciseId === exerciseId)
  const sets: GoalSet[] = []
  const prescriptions = new Set<string>()
  for (const exercise of matches) {
    if (!isUuid(exercise.workoutExerciseId) || prescriptions.has(exercise.workoutExerciseId)) return null
    prescriptions.add(exercise.workoutExerciseId)
    if (exercise.status === 'skipped' || (typeof exercise.skipReason === 'string' && exercise.skipReason.trim())) continue
    if (!['active', 'completed'].includes(exercise.status) || !Array.isArray(exercise.sets)
      || !exercise.sets.length || exercise.sets.length > MAX_SESSION_SETS) return null
    for (const raw of exercise.sets) {
      if (!raw || typeof raw !== 'object' || typeof raw.completed !== 'boolean') return null
      if (!raw.completed) continue
      if (typeof raw.weightKg !== 'string' || typeof raw.reps !== 'string') return null
      const weightKg = raw.weightKg.trim() === '' ? 0 : Number(raw.weightKg)
      const reps = raw.reps.trim() === '' ? 0 : Number(raw.reps)
      if (!Number.isFinite(weightKg) || weightKg < 0 || weightKg > MAX_SESSION_WEIGHT_KG
        || !Number.isInteger(reps) || reps < 0 || reps > MAX_SESSION_REPS
        || !Number.isInteger(raw.durationSeconds) || raw.durationSeconds < 1 || raw.durationSeconds > MAX_SESSION_DURATION_SECONDS) return null
      sets.push({ weightKg, reps, seconds: raw.durationSeconds })
    }
  }
  return sets.length ? sets : null
}

function durationSets(log: AppRow, exerciseId: string): GoalSet[] | null {
  return log.mobile_session_kind === 'free' ? validFreeDurationSets(log, exerciseId) : validGuidedDurationSets(log, exerciseId)
}

function historicalCatalog(state: AppState): Map<string, CatalogSource> {
  const result = new Map<string, CatalogSource>()
  const logs = table(state, 'progress_logs').filter(row => row.user_id === state.accountId)
  for (const log of logs) {
    const context = parseSessionContextSnapshot(log.session_context_snapshot)
    if (!context) continue
    for (const exercise of context.exercises) {
      const existing = result.get(exercise.exerciseId)
      const timed = durationSets(log, exercise.exerciseId) !== null
      if (existing) {
        // An older summary without set detail cannot erase later timed evidence.
        if (timed) existing.kind = 'duration'
        continue
      }
      result.set(exercise.exerciseId, {
        id: exercise.exerciseId, name: exercise.name, nameEs: exercise.nameEs,
        muscleGroups: cleanStrings(exercise.muscleGroups), muscleGroupsEs: cleanStrings(exercise.muscleGroupsEs),
        kind: timed ? 'duration' : 'strength',
      })
    }
  }
  return result
}

function catalogSources(state: AppState): Map<string, CatalogSource> {
  const sources = historicalCatalog(state)
  for (const row of table(state, 'mobile_exercise_goals')) {
    if (!sources.has(row.exercise_id)) sources.set(row.exercise_id, {
      id: row.exercise_id, name: row.exercise_name, nameEs: row.exercise_name_es,
      muscleGroups: clone(row.muscle_groups), muscleGroupsEs: clone(row.muscle_groups_es), kind: row.kind,
    })
  }
  for (const row of table(state, 'exercises')) {
    if (row.is_public !== true || !isUuid(row.id) || typeof row.name !== 'string' || !row.name.trim()) continue
    sources.set(row.id, {
      id: row.id, name: row.name.trim(), nameEs: typeof row.name_es === 'string' && row.name_es.trim() ? row.name_es.trim() : null,
      muscleGroups: cleanStrings(row.muscle_groups), muscleGroupsEs: cleanStrings(row.muscle_groups_es),
      kind: timedCatalog(row) ? 'duration' : 'strength',
    })
  }
  // Goal units are chosen when tracking begins; catalog refreshes may update
  // names but must not reinterpret a saved target or hide its old evidence.
  for (const row of table(state, 'mobile_exercise_goals')) {
    const source = sources.get(row.exercise_id)
    if (source) source.kind = row.kind
  }
  return sources
}

function strengthSets(row: AppRow): GoalSet[] {
  if (typeof row.sets_completed !== 'number' || !Number.isInteger(row.sets_completed) || row.sets_completed < 1 || row.sets_completed > MAX_SESSION_SETS
    || !Array.isArray(row.weights_kg) || !Array.isArray(row.reps_completed)) return []
  const size = Math.min(row.sets_completed, row.weights_kg.length, row.reps_completed.length)
  const sets: GoalSet[] = []
  for (let index = 0; index < size; index++) {
    const weightKg = row.weights_kg[index], reps = row.reps_completed[index]
    if (typeof weightKg !== 'number' || !Number.isFinite(weightKg) || weightKg < 0 || weightKg > MAX_SESSION_WEIGHT_KG
      || typeof reps !== 'number' || !Number.isInteger(reps) || reps < 1 || reps > MAX_SESSION_REPS) continue
    sets.push({ weightKg, reps })
  }
  return sets
}

function compareSets(left: GoalSet, right: GoalSet, kind: GoalKind): number {
  if (kind === 'duration') return (left.seconds ?? 0) - (right.seconds ?? 0)
  return left.weightKg - right.weightKg || left.reps - right.reps
}

function sessionName(state: AppState, log: AppRow, context: SessionContextSnapshotV1 | null, language: 'es' | 'en'): string {
  if (context) return context.workout.name
  const workout = table(state, 'workouts').find(row => row.id === log.workout_id && row.user_id === state.accountId)
  return typeof workout?.name === 'string' && workout.name.trim() ? workout.name : language === 'es' ? 'Entrenamiento' : 'Workout'
}

function pointsFor(state: AppState, exerciseId: string, kind: GoalKind, language: 'es' | 'en', timeZone: string, now: Date): GoalPoint[] {
  const details = table(state, 'exercise_logs')
  const points: GoalPoint[] = []
  for (const log of table(state, 'progress_logs')) {
    const completed = Date.parse(log.completed_at)
    if (log.user_id !== state.accountId || !Number.isFinite(completed) || completed > now.getTime()
      || (log.mobile_session_kind === 'free' && log.mobile_free_training?.detailLevel === 'attendance')) continue
    const rows = details.filter(row => row.progress_log_id === log.id && row.exercise_id === exerciseId
      && row.status !== 'skipped' && !(typeof row.skip_reason === 'string' && row.skip_reason.trim()))
    if (!rows.length) continue
    const sets = kind === 'duration' ? durationSets(log, exerciseId) : rows.flatMap(strengthSets)
    if (!sets?.length) continue
    const best = sets.reduce((current, set) => compareSets(set, current, kind) > 0 ? set : current)
    const context = parseSessionContextSnapshot(log.session_context_snapshot)
    points.push({ sessionId: log.id, sessionName: sessionName(state, log, context, language), completedAt: log.completed_at,
      date: getLocalDateString(new Date(completed), timeZone), best: clone(best), sets: clone(sets) })
  }
  return points.sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt) || a.sessionId.localeCompare(b.sessionId))
}

function targetReached(set: GoalSet, target: GoalTarget): boolean {
  return target.kind === 'duration' ? (set.seconds ?? 0) >= target.seconds : set.weightKg >= target.weightKg && set.reps >= target.reps
}

function goalModel(state: AppState, row: AppRow, sources: Map<string, CatalogSource>, language: 'es' | 'en', timeZone: string, now: Date): PersonalExerciseGoal {
  const saved: CatalogSource = {
    id: row.exercise_id, name: row.exercise_name, nameEs: row.exercise_name_es,
    muscleGroups: clone(row.muscle_groups), muscleGroupsEs: clone(row.muscle_groups_es), kind: row.kind,
  }
  const display = localized(sources.get(row.exercise_id) ?? saved, language)
  const points = pointsFor(state, row.exercise_id, row.kind, language, timeZone, now)
  const best = points.reduce<GoalPoint | null>((current, point) => {
    if (!current) return point
    const metric = compareSets(point.best, current.best, row.kind)
    if (metric !== 0) return metric > 0 ? point : current
    return Date.parse(point.completedAt) > Date.parse(current.completedAt)
      || (point.completedAt === current.completedAt && point.sessionId.localeCompare(current.sessionId) > 0) ? point : current
  }, null)
  const achieved = row.target ? points.find(point => point.sets.some(set => targetReached(set, row.target))) ?? null : null
  return {
    id: row.id, exerciseId: row.exercise_id, name: display.name, muscleGroups: display.muscleGroups, kind: row.kind,
    target: clone(row.target), version: row.version, createdAt: row.created_at, points,
    first: points[0] ?? null, latest: points.at(-1) ?? null, best,
    achieved: achieved !== null, achievedAt: achieved?.completedAt ?? null,
  }
}

async function capture(expectedAccountId?: string): Promise<Captured> {
  const store = await getAppStore(), sessionVersion = store.sessionVersion(), state = await store.read()
  if (!state || (expectedAccountId !== undefined && state.accountId !== expectedAccountId) || store.sessionVersion() !== sessionVersion) throw new Error(changed)
  return { store, state, sessionVersion }
}

function semanticMatch(row: AppRow, input: SaveExerciseGoalInput): boolean {
  return row.exercise_id === input.exerciseId && JSON.stringify(row.target) === JSON.stringify(input.target)
}

function validateInputTarget(target: GoalTarget | null): string | null {
  if (target?.kind === 'strength' && !validGoalTarget(target, 'strength')) return 'Revisa el peso y las repeticiones de la meta.'
  if (target?.kind === 'duration' && !validGoalTarget(target, 'duration')) return 'Revisa los segundos de la meta.'
  if (!validGoalTarget(target)) return 'Revisa la meta.'
  return null
}

export async function loadExerciseGoalsModel(): Promise<ExerciseGoalsModel> {
  const { store, state, sessionVersion } = await capture()
  const profile = ownProfile(state); if (!profile) throw new Error('Perfil no encontrado.')
  const language = profile.language === 'en' ? 'en' : 'es'
  const timeZone = resolveUserTimeZone(profile.timezone), now = new Date()
  const sources = catalogSources(state)
  const catalog = [...sources.values()].map(source => localized(source, language)).sort((a, b) => a.name.localeCompare(b.name, language) || a.id.localeCompare(b.id))
  const goals = table(state, 'mobile_exercise_goals').map(row => goalModel(state, row, sources, language, timeZone, now))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id))
  if (store.sessionVersion() !== sessionVersion || (await store.read())?.accountId !== state.accountId) throw new Error(changed)
  return { accountId: state.accountId, language, today: getLocalDateString(now, timeZone), catalog, goals }
}

export async function saveExerciseGoal(input: SaveExerciseGoalInput): Promise<GoalActionResult> {
  try {
    if (!input || !isUuid(input.accountId)) return fail(changed)
    if (!isUuid(input.id) || !isUuid(input.exerciseId)) return fail('Identificador de objetivo inválido.')
    if (input.expectedVersion !== null && (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1)) return fail('Versión de objetivo inválida.')
    const targetError = validateInputTarget(input.target); if (targetError) return fail(targetError)
    const { store, sessionVersion } = await capture(input.accountId)
    return await store.mutate(state => {
      if (store.sessionVersion() !== sessionVersion || state.accountId !== input.accountId) throw new Error(changed)
      const rows = table(state, 'mobile_exercise_goals'), existing = rows.find(row => row.id === input.id)
      if (existing && semanticMatch(existing, input)) return { success: true }
      if (existing ? existing.version !== input.expectedVersion : input.expectedVersion !== null) return fail('Este objetivo cambió. Vuelve a abrirlo antes de guardar.')
      if (!existing && rows.length >= 3) return fail('Puedes seguir hasta tres ejercicios.')
      if (rows.some(row => row.id !== input.id && row.exercise_id === input.exerciseId)) return fail('Ya sigues este ejercicio.')
      const source = catalogSources(state).get(input.exerciseId)
      if (!source) return fail('El ejercicio ya no está disponible.')
      if (input.target && input.target.kind !== source.kind) return fail('La meta no corresponde al tipo de ejercicio.')
      const now = new Date().toISOString()
      const next = {
        id: input.id, user_id: state.accountId, exercise_id: source.id, exercise_name: source.name, exercise_name_es: source.nameEs,
        muscle_groups: clone(source.muscleGroups), muscle_groups_es: clone(source.muscleGroupsEs), kind: source.kind, target: clone(input.target),
        version: (existing?.version ?? 0) + 1, created_at: existing?.created_at ?? now, updated_at: now,
      }
      state.tables.mobile_exercise_goals = [...rows.filter(row => row.id !== input.id), next]
      return { success: true }
    })
  } catch (error) { return fail(error instanceof Error ? error.message : 'No se pudo guardar el objetivo.') }
}

export async function removeExerciseGoal(input: RemoveExerciseGoalInput): Promise<GoalActionResult> {
  try {
    if (!input || !isUuid(input.accountId)) return fail(changed)
    if (!isUuid(input.id)) return fail('Identificador de objetivo inválido.')
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) return fail('Versión de objetivo inválida.')
    const { store, sessionVersion } = await capture(input.accountId)
    return await store.mutate(state => {
      if (store.sessionVersion() !== sessionVersion || state.accountId !== input.accountId) throw new Error(changed)
      const rows = table(state, 'mobile_exercise_goals'), existing = rows.find(row => row.id === input.id)
      if (!existing) return { success: true }
      if (existing.version !== input.expectedVersion) return fail('Este objetivo cambió. Vuelve a abrirlo antes de quitarlo.')
      state.tables.mobile_exercise_goals = rows.filter(row => row.id !== input.id)
      return { success: true }
    })
  } catch (error) { return fail(error instanceof Error ? error.message : 'No se pudo quitar el objetivo.') }
}

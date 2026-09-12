import { MAX_SESSION_DURATION_SECONDS, MAX_SESSION_REPS, MAX_SESSION_SETS, MAX_SESSION_WEIGHT_KG } from '@/lib/session/limits'
import { parseSessionContextSnapshot } from '@/lib/session/contextSnapshot'
import { MUSCLE_GROUPS, type MuscleGroupId } from '@/lib/muscles/activity'
import { getLocalDateString } from '@/lib/workouts/schedule'
import { isCivilDate } from '@/lib/workouts/occurrences'
import type { FitnessEvidence, FitnessRecord } from './types'

type RawRow = Record<string, unknown>

export type FitnessCardProjectionInput = {
  ownerId: string
  logs: RawRow[]
  exerciseLogs: RawRow[]
  exercises: RawRow[]
  timeZone: string
  language: 'es' | 'en'
  now: Date
}

type ValidSet = { weightKg: number; reps: number }
type ExercisePresentation = { name: string; muscles: string[] }

const normalizeLabel = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
const muscleAliases = new Map<string, MuscleGroupId>(MUSCLE_GROUPS.flatMap(group => group.aliases.map(alias => [normalizeLabel(alias), group.id] as const)))

function object(value: unknown): RawRow | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RawRow : null
}

function validInstant(value: unknown): Date | null {
  if (typeof value !== 'string' || !isCivilDate(value.slice(0, 10)) || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function civilDateMinus(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const instant = new Date(Date.UTC(year, month - 1, day - days))
  return instant.toISOString().slice(0, 10)
}

function freeDetail(log: RawRow): 'attendance' | 'partial' | 'complete' | null {
  if (log.mobile_session_kind !== 'free') return null
  const metadata = object(log.mobile_free_training)
  return metadata?.detailLevel === 'partial' || metadata?.detailLevel === 'complete' ? metadata.detailLevel : 'attendance'
}

function isSkipped(row: RawRow): boolean {
  return row.status === 'skipped' || (typeof row.skip_reason === 'string' && row.skip_reason.trim().length > 0)
}

function validStrengthSets(row: RawRow): ValidSet[] {
  if (!Number.isInteger(row.sets_completed) || (row.sets_completed as number) < 1 || (row.sets_completed as number) > MAX_SESSION_SETS) return []
  if (!Array.isArray(row.weights_kg) || !Array.isArray(row.reps_completed)) return []
  const result: ValidSet[] = []
  const size = Math.min(row.sets_completed as number, row.weights_kg.length, row.reps_completed.length)
  for (let index = 0; index < size; index++) {
    const weightKg = row.weights_kg[index]
    const reps = row.reps_completed[index]
    if (typeof weightKg !== 'number' || !Number.isFinite(weightKg) || weightKg < 0 || weightKg > MAX_SESSION_WEIGHT_KG) continue
    if (typeof reps !== 'number' || !Number.isInteger(reps) || reps < 1 || reps > MAX_SESSION_REPS) continue
    result.push({ weightKg, reps })
  }
  return result
}

function persistedDurationSets(log: RawRow, row: RawRow, exerciseId: string): number[] {
  if (!Number.isInteger(row.sets_completed) || (row.sets_completed as number) < 1 || (row.sets_completed as number) > MAX_SESSION_SETS) return []
  const sources = [
    object(log.mobile_session_payload)?.exercises,
    object(log.mobile_free_training)?.exercises,
  ]
  for (const source of sources) {
    if (!Array.isArray(source)) continue
    const exercise = source.map(object).find(row => row?.exerciseId === exerciseId)
    if (!exercise || !Array.isArray(exercise.sets)) continue
    const seconds = exercise.sets.map(object).flatMap(set => {
      if (!set || set.completed === false) return []
      const value = set.durationSeconds
      return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_SESSION_DURATION_SECONDS ? [value] : []
    })
    if (seconds.length) return seconds.slice(0, row.sets_completed as number)
  }
  return []
}

function cleanStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim()) : []
}

function presentation(log: RawRow, row: RawRow, catalog: Map<string, RawRow>, language: 'es' | 'en'): ExercisePresentation {
  const exerciseId = typeof row.exercise_id === 'string' ? row.exercise_id : ''
  const snapshot = parseSessionContextSnapshot(log.session_context_snapshot)
  const frozen = snapshot?.exercises.find(exercise => exercise.exerciseId === exerciseId)
  if (frozen) return {
    name: language === 'es' ? frozen.nameEs || frozen.name : frozen.name,
    muscles: language === 'es' && frozen.muscleGroupsEs.length ? frozen.muscleGroupsEs : frozen.muscleGroups,
  }
  const relation = Array.isArray(row.exercise) ? object(row.exercise[0]) : object(row.exercise)
  const live = relation ?? catalog.get(exerciseId)
  if (!live) return { name: language === 'es' ? 'Ejercicio' : 'Exercise', muscles: [] }
  const name = language === 'es' && typeof live.name_es === 'string' && live.name_es.trim() ? live.name_es.trim() : typeof live.name === 'string' && live.name.trim() ? live.name.trim() : language === 'es' ? 'Ejercicio' : 'Exercise'
  const localized = language === 'es' ? cleanStrings(live.muscle_groups_es) : []
  return { name, muscles: localized.length ? localized : cleanStrings(live.muscle_groups) }
}

function betterRecord(candidate: FitnessRecord, current: FitnessRecord | undefined): boolean {
  if (!current) return true
  if (candidate.kind !== current.kind) return candidate.kind === 'duration'
  if (candidate.kind === 'duration') return (candidate.seconds ?? 0) > (current.seconds ?? 0) || ((candidate.seconds ?? 0) === (current.seconds ?? 0) && candidate.date > current.date)
  return (candidate.weightKg ?? -1) > (current.weightKg ?? -1)
    || ((candidate.weightKg ?? -1) === (current.weightKg ?? -1) && ((candidate.reps ?? -1) > (current.reps ?? -1) || (candidate.reps === current.reps && candidate.date > current.date)))
}

function recordOrder(left: FitnessRecord, right: FitnessRecord): number {
  if (left.kind !== right.kind) return left.kind === 'strength' ? -1 : 1
  const leftMetric = left.kind === 'strength' ? left.weightKg ?? -1 : left.seconds ?? -1
  const rightMetric = right.kind === 'strength' ? right.weightKg ?? -1 : right.seconds ?? -1
  return rightMetric - leftMetric || (right.reps ?? -1) - (left.reps ?? -1) || right.date.localeCompare(left.date) || left.exerciseId.localeCompare(right.exerciseId)
}

export function projectFitnessCard(input: FitnessCardProjectionInput): FitnessEvidence {
  const rangeTo = getLocalDateString(input.now, input.timeZone)
  const rangeFrom = civilDateMinus(rangeTo, 83)
  const catalog = new Map(input.exercises.flatMap(row => typeof row.id === 'string' ? [[row.id, row] as const] : []))
  const logs = new Map<string, { row: RawRow; instant: Date; date: string }>()
  const sessions = new Set<string>()
  for (const row of input.logs) {
    if (row.user_id !== input.ownerId || typeof row.id !== 'string' || logs.has(row.id)) continue
    const instant = validInstant(row.completed_at)
    if (!instant || instant.getTime() > input.now.getTime()) continue
    const session = typeof row.client_session_id === 'string' && row.client_session_id.trim() ? `session:${row.client_session_id}` : `log:${row.id}`
    if (sessions.has(session)) continue
    sessions.add(session)
    logs.set(row.id, { row, instant, date: getLocalDateString(instant, input.timeZone) })
  }

  const records = new Map<string, FitnessRecord>()
  const muscleSessions = new Map<MuscleGroupId, Set<string>>()
  const seenRows = new Set<string>()
  for (let index = 0; index < input.exerciseLogs.length; index++) {
    const row = input.exerciseLogs[index]
    const parentId = typeof row.progress_log_id === 'string' ? row.progress_log_id : ''
    const parent = logs.get(parentId)
    if (!parent || isSkipped(row) || freeDetail(parent.row) === 'attendance') continue
    const rowIdentity = typeof row.id === 'string' && row.id ? row.id : `${parentId}:${index}`
    if (seenRows.has(rowIdentity)) continue
    seenRows.add(rowIdentity)
    const exerciseId = typeof row.exercise_id === 'string' && row.exercise_id.trim() ? row.exercise_id : null
    if (!exerciseId || exerciseId.length > 160) continue
    const display = presentation(parent.row, row, catalog, input.language)
    // Bound historical labels without changing the immutable exercise identity.
    display.name = display.name.trim().slice(0, 160).replace(/[\uD800-\uDBFF]$/, '')
    const durations = persistedDurationSets(parent.row, row, exerciseId)
    const sets = validStrengthSets(row)
    let candidate: FitnessRecord | null = null
    if (durations.length) {
      candidate = { exerciseId, name: display.name, kind: 'duration', weightKg: null, reps: null, seconds: Math.max(...durations), date: parent.date }
    } else if (sets.length) {
      const best = sets.reduce((current, set) => set.weightKg > current.weightKg || (set.weightKg === current.weightKg && set.reps > current.reps) ? set : current)
      candidate = { exerciseId, name: display.name, kind: 'strength', weightKg: best.weightKg, reps: best.reps, seconds: null, date: parent.date }
    }
    if (!candidate) continue
    if (betterRecord(candidate, records.get(exerciseId))) records.set(exerciseId, candidate)
    if (parent.date < rangeFrom || parent.date > rangeTo) continue
    const recognized = new Set(display.muscles.flatMap(label => {
      const id = muscleAliases.get(normalizeLabel(label))
      return id ? [id] : []
    }))
    for (const id of Array.from(recognized)) {
      const sessions = muscleSessions.get(id) ?? new Set<string>()
      sessions.add(parentId)
      muscleSessions.set(id, sessions)
    }
  }

  const periodLogs = Array.from(logs.values()).filter(log => log.date >= rangeFrom && log.date <= rangeTo)
  return {
    records: Array.from(records.values()).sort(recordOrder).slice(0, 12),
    muscles: MUSCLE_GROUPS.map(group => ({ id: group.id, sessions: muscleSessions.get(group.id)?.size ?? 0 })),
    totalSessions: periodLogs.length,
    partialSessions: periodLogs.filter(log => freeDetail(log.row) === 'partial').length,
    rangeFrom,
    rangeTo,
    updatedAt: input.now.toISOString(),
  }
}

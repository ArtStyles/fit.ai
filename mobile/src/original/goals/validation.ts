import { MAX_SESSION_DURATION_SECONDS, MAX_SESSION_REPS, MAX_SESSION_WEIGHT_KG } from '@/lib/session/limits'
import type { AppRow } from '../types'
import type { GoalTarget } from './types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

function isInstant(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
}

function isText(value: unknown, nullable = false): boolean {
  return (nullable && value === null) || (typeof value === 'string' && value.trim().length > 0 && value.length <= 200)
}

function isTextArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 50 && value.every(item => typeof item === 'string' && item.trim().length > 0 && item.length <= 120)
}

export function validGoalTarget(value: unknown, kind?: 'strength' | 'duration'): value is GoalTarget | null {
  if (value === null) return true
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const target = value as Record<string, unknown>
  if (target.kind === 'strength') {
    return (kind === undefined || kind === 'strength') && Object.keys(target).length === 3
      && typeof target.weightKg === 'number' && Number.isFinite(target.weightKg) && target.weightKg >= 0 && target.weightKg <= MAX_SESSION_WEIGHT_KG
      && typeof target.reps === 'number' && Number.isInteger(target.reps) && target.reps >= 1 && target.reps <= MAX_SESSION_REPS
  }
  return target.kind === 'duration' && (kind === undefined || kind === 'duration') && Object.keys(target).length === 2
    && typeof target.seconds === 'number' && Number.isInteger(target.seconds) && target.seconds >= 1 && target.seconds <= MAX_SESSION_DURATION_SECONDS
}

export function validateExerciseGoalsTable(rows: AppRow[], accountId: string): void {
  if (rows.length > 3) throw new Error('Too many mobile exercise goals')
  const exercises = new Set<string>()
  for (const row of rows) {
    if (!isUuid(row.id) || row.user_id !== accountId || !isUuid(row.exercise_id)
      || !isText(row.exercise_name) || !isText(row.exercise_name_es, true)
      || !isTextArray(row.muscle_groups) || !isTextArray(row.muscle_groups_es)
      || !['strength', 'duration'].includes(row.kind)
      || !validGoalTarget(row.target, row.kind)
      || !Number.isSafeInteger(row.version) || row.version < 1
      || !isInstant(row.created_at) || !isInstant(row.updated_at)
      || Date.parse(row.updated_at) < Date.parse(row.created_at)) {
      throw new Error('Invalid mobile exercise goal')
    }
    if (exercises.has(row.exercise_id)) throw new Error('Duplicate mobile exercise goal')
    exercises.add(row.exercise_id)
  }
}

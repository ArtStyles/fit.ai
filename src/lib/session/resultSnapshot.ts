import type { ProgressionSuggestion } from '@/lib/progression'
import type { PRRecord } from '@/lib/progression/records'

export interface SessionResultSnapshot {
  version: 1
  prs: PRRecord[]
  progressions: ProgressionSuggestion[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value)
}

function isPersonalRecord(value: unknown): value is PRRecord {
  if (!isObject(value)) return false
  if (typeof value.exerciseName !== 'string' || !isFiniteNumber(value.weightKg)) return false
  if (typeof value.kind !== 'string' || !['weight', 'e1rm', 'reps'].includes(value.kind)) return false
  if (value.e1rmKg !== undefined && !isFiniteNumber(value.e1rmKg)) return false
  if (value.reps !== undefined && !isFiniteNumber(value.reps)) return false
  return true
}

function isProgressionSuggestion(value: unknown): value is ProgressionSuggestion {
  if (!isObject(value)) return false

  return (
    typeof value.exerciseId === 'string' &&
    typeof value.exerciseName === 'string' &&
    typeof value.progressionType === 'string' &&
    ['weight', 'reps'].includes(value.progressionType) &&
    isNullableNumber(value.currentWeightKg) &&
    isNullableNumber(value.nextWeightKg) &&
    isNullableNumber(value.currentTargetReps) &&
    isNullableNumber(value.nextTargetReps) &&
    typeof value.action === 'string' &&
    ['increase', 'hold', 'decrease', 'baseline'].includes(value.action) &&
    typeof value.reason === 'string' &&
    typeof value.confidence === 'string' &&
    ['low', 'medium', 'high'].includes(value.confidence) &&
    (value.stalled === undefined || typeof value.stalled === 'boolean')
  )
}

export function decodeSessionResultSnapshot(value: unknown): SessionResultSnapshot | null {
  if (!isObject(value) || value.version !== 1) return null
  if (!Array.isArray(value.prs) || !value.prs.every(isPersonalRecord)) return null
  if (!Array.isArray(value.progressions) || !value.progressions.every(isProgressionSuggestion)) return null

  return value as unknown as SessionResultSnapshot
}

export function createSessionResultSnapshot(
  prs: PRRecord[],
  progressions: ProgressionSuggestion[],
): SessionResultSnapshot {
  return { version: 1, prs, progressions }
}

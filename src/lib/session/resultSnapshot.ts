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

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actualKeys = Object.keys(value)
  return actualKeys.length === keys.length && actualKeys.every(key => keys.includes(key))
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0
}

function isNullablePositiveInteger(value: unknown): value is number | null {
  return value === null || isPositiveInteger(value)
}

function isNullableNonNegativeNumber(value: unknown): value is number | null {
  return value === null || (isFiniteNumber(value) && value >= 0)
}

function isPersonalRecord(value: unknown): value is PRRecord {
  if (!isObject(value)) return false
  if (typeof value.exerciseName !== 'string' || value.exerciseName.trim() === '') return false

  if (value.kind === 'weight') {
    return hasExactKeys(value, ['exerciseName', 'weightKg', 'kind']) &&
      isFiniteNumber(value.weightKg) && value.weightKg > 0
  }

  if (value.kind === 'e1rm') {
    return hasExactKeys(value, ['exerciseName', 'weightKg', 'kind', 'e1rmKg']) &&
      isFiniteNumber(value.weightKg) && value.weightKg > 0 &&
      isFiniteNumber(value.e1rmKg) && value.e1rmKg > 0
  }

  if (value.kind === 'reps') {
    return hasExactKeys(value, ['exerciseName', 'weightKg', 'kind', 'reps']) &&
      value.weightKg === 0 && isPositiveInteger(value.reps)
  }

  return false
}

function isProgressionSuggestion(value: unknown): value is ProgressionSuggestion {
  if (!isObject(value)) return false

  const requiredKeys = [
    'exerciseId',
    'exerciseName',
    'progressionType',
    'currentWeightKg',
    'nextWeightKg',
    'currentTargetReps',
    'nextTargetReps',
    'action',
    'reason',
    'confidence',
  ]
  const exactShape = hasExactKeys(value, requiredKeys) ||
    hasExactKeys(value, [...requiredKeys, 'stalled'])

  if (!exactShape) return false

  const commonFieldsValid = (
    typeof value.exerciseId === 'string' && value.exerciseId.trim() !== '' &&
    typeof value.exerciseName === 'string' && value.exerciseName.trim() !== '' &&
    typeof value.progressionType === 'string' &&
    ['weight', 'reps'].includes(value.progressionType) &&
    isNullableNonNegativeNumber(value.currentWeightKg) &&
    isNullableNonNegativeNumber(value.nextWeightKg) &&
    isNullablePositiveInteger(value.currentTargetReps) &&
    isNullablePositiveInteger(value.nextTargetReps) &&
    typeof value.action === 'string' &&
    ['increase', 'hold', 'decrease', 'baseline'].includes(value.action) &&
    typeof value.reason === 'string' && value.reason.trim() !== '' &&
    typeof value.confidence === 'string' &&
    ['low', 'medium', 'high'].includes(value.confidence) &&
    (value.stalled === undefined || typeof value.stalled === 'boolean')
  )

  if (!commonFieldsValid) return false

  if (value.progressionType === 'weight') {
    return value.currentTargetReps === null && value.nextTargetReps === null
  }

  return value.currentWeightKg === null && value.nextWeightKg === null &&
    isPositiveInteger(value.currentTargetReps) && isPositiveInteger(value.nextTargetReps)
}

export function parseSessionResultSnapshot(value: unknown): SessionResultSnapshot | null {
  if (!isObject(value) || !hasExactKeys(value, ['version', 'prs', 'progressions']) || value.version !== 1) return null
  if (!Array.isArray(value.prs) || !value.prs.every(isPersonalRecord)) return null
  if (!Array.isArray(value.progressions) || !value.progressions.every(isProgressionSuggestion)) return null

  return value as unknown as SessionResultSnapshot
}

export const decodeSessionResultSnapshot = parseSessionResultSnapshot

export function createSessionResultSnapshot(
  prs: PRRecord[],
  progressions: ProgressionSuggestion[],
): SessionResultSnapshot {
  return { version: 1, prs, progressions }
}

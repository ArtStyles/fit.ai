import { summarizeExercisePerformance } from '@/lib/training-evidence/performance'
import { isCivilDate } from '@/lib/workouts/occurrences'

export type ImportedTrainingEvidenceSource = {
  mobile_session_kind?: unknown
  mobile_import?: unknown
}

export type ImportedTrainingSet = {
  reps: number | null
  weightKg: number | null
  durationSeconds: number | null
  distanceMeters: number | null
  rpe: number | null
  kind: string
  notes: string
}

const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const measure = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

export function readImportedTrainingSource(source: ImportedTrainingEvidenceSource): 'Hevy' | 'Strong' | 'FitNotes' | null {
  if (source.mobile_session_kind !== 'imported') return null
  const metadata = record(source.mobile_import)
  if (metadata?.version !== 1) return null
  return metadata.source === 'hevy' ? 'Hevy' : metadata.source === 'strong' ? 'Strong' : metadata.source === 'fitnotes' ? 'FitNotes' : null
}

/** FitNotes exports a civil date; the persisted instant is only a storage anchor. */
export function readImportedTrainingDate(source: ImportedTrainingEvidenceSource): string | null {
  if (readImportedTrainingSource(source) !== 'FitNotes') return null
  const date = record(source.mobile_import)?.date
  return isCivilDate(date) ? date : null
}

/** Imported children aggregate repeated blocks of one exercise in the original file order. */
export function readImportedTrainingSets(source: ImportedTrainingEvidenceSource, exerciseId: string, setsCompleted: number | null, exerciseKey?: unknown): ImportedTrainingSet[] | null {
  if (!readImportedTrainingSource(source)) return null
  const metadata = record(source.mobile_import)!
  if (!Array.isArray(metadata.exercises)) return null
  const matches = metadata.exercises.map(record).filter(row => row?.exerciseId === exerciseId && (typeof exerciseKey !== 'string' || row?.key === exerciseKey))
  if (!matches.length || matches.some(row => !Array.isArray(row?.sets))) return null
  const rawSets = matches.flatMap(row => row!.sets as unknown[])
  if (!rawSets.length || (setsCompleted !== null && rawSets.length !== setsCompleted)) return null
  const sets: ImportedTrainingSet[] = []
  for (const raw of rawSets) {
    const set = record(raw)
    if (!set || typeof set.kind !== 'string' || typeof set.notes !== 'string') return null
    const values = ['reps', 'weightKg', 'durationSeconds', 'distanceMeters', 'rpe'] as const
    if (values.some(key => set[key] !== null && measure(set[key]) === null)) return null
    if (set.reps !== null && !Number.isInteger(set.reps)) return null
    if (typeof set.rpe === 'number' && set.rpe > 10) return null
    sets.push({ reps: measure(set.reps), weightKg: measure(set.weightKg), durationSeconds: measure(set.durationSeconds), distanceMeters: measure(set.distanceMeters), rpe: measure(set.rpe), kind: set.kind, notes: set.notes })
  }
  return sets
}

/** Missing weight or reps cannot establish a best set or load volume. Genuine zero is retained. */
export function summarizeRecordedStrength(weights: (number | null)[] | null, reps: (number | null)[] | null, rpes: (number | null)[] | null = null) {
  const pairs = (weights ?? []).flatMap((weight, index) => {
    const repetitions = reps?.[index]
    return measure(weight) !== null && typeof repetitions === 'number' && Number.isInteger(repetitions) && repetitions > 0
      ? [{ weight: weight!, reps: repetitions, rpe: rpes?.[index] ?? null }]
      : []
  })
  return summarizeExercisePerformance(pairs.map(set => set.weight), pairs.map(set => set.reps), pairs.map(set => set.rpe))
}

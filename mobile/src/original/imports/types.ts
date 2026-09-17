export type FitnessSource = 'hevy' | 'strong' | 'fitnotes'

export interface ImportSet {
  reps: number | null
  weightKg: number | null
  durationSeconds: number | null
  distanceMeters: number | null
  rpe: number | null
  kind: string
  notes: string
}

export interface ImportExercise {
  key: string
  name: string
  notes: string
  sets: ImportSet[]
}

export interface ImportWorkout {
  sourceKey: string
  title: string
  /** ISO local time when the source has no timezone; explicit offsets are preserved. */
  startedAt: string
  completedAt: string
  date: string
  durationSeconds: number | null
  notes: string
  exercises: ImportExercise[]
}

export interface ParsedFitnessImport {
  source: FitnessSource
  workouts: ImportWorkout[]
  warnings: string[]
}

export interface FitnessImportOptions {
  source?: FitnessSource | 'auto'
  weightUnit?: 'kg' | 'lb'
  distanceUnit?: 'm' | 'km' | 'mi'
  dateOrder?: 'dmy' | 'mdy'
}

export type ParseFitnessOptions = FitnessImportOptions

export type ImportFormatErrorCode = 'empty' | 'format' | 'csv' | 'header' | 'row' | 'date' | 'date-order' | 'weight-unit' | 'distance-unit' | 'set-type' | 'number' | 'limit'

export class ImportFormatError extends Error {
  constructor(public readonly code: ImportFormatErrorCode, message: string, public readonly row?: number) {
    super(row === undefined ? message : `Fila ${row}: ${message}`)
    this.name = 'ImportFormatError'
  }
}

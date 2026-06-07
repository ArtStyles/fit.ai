/**
 * Exercise types used throughout the app.
 * Mirror the `exercises` table in database.ts, plus helper types for
 * service-layer filtering and pagination.
 */

export type ExerciseType =
  | 'strength'
  | 'cardio'
  | 'flexibility'
  | 'balance'
  | 'hiit'

export type Difficulty = 'beginner' | 'intermediate' | 'advanced'

export interface Exercise {
  id: string
  wger_id: number | null
  name: string
  description: string | null
  muscle_groups: string[]
  equipment: string[]
  difficulty: Difficulty | null
  exercise_type: ExerciseType | null
  is_compound: boolean
  instructions: string | null
  video_url: string | null
  image_url: string | null
  is_public: boolean
  source: string | null
  external_id: string | null
  created_at: string
}

// ─── Filters ─────────────────────────────────────────────────────────────────

export interface ExerciseFilters {
  /** Full-text search against name (case-insensitive) */
  search?: string
  difficulty?: Difficulty | ''
  exercise_type?: ExerciseType | ''
  /** Exact match on any element in muscle_groups array */
  muscle_group?: string
  /** Exact match on any element in equipment array */
  equipment?: string
  is_compound?: boolean
  page?: number
  /** Defaults to 24 */
  limit?: number
}

// ─── Paginated result ─────────────────────────────────────────────────────────

export interface ExercisePage {
  exercises: Exercise[]
  total: number
  page: number
  limit: number
  totalPages: number
}

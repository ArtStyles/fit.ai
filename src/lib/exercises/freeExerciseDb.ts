/**
 * free-exercise-db (yuhonas/free-exercise-db) — tipo del registro del dataset
 * y mapeadores puros a nuestras columnas de `exercises`.
 */

export const DATASET_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'

const IMAGE_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'

export interface FreeExercise {
  id: string
  name: string
  force: string | null
  level: string
  mechanic: string | null
  equipment: string | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
  instructions: string[]
  category: string
  images: string[]
}

type Difficulty = 'beginner' | 'intermediate' | 'advanced'
type ExerciseType = 'strength' | 'cardio' | 'flexibility' | 'balance' | 'hiit'

export interface ExerciseInsertData {
  name: string
  description: null
  muscle_groups: string[]
  equipment: string[]
  difficulty: Difficulty | null
  exercise_type: ExerciseType
  is_compound: boolean
  instructions: string | null
  is_public: true
  source: 'free-exercise-db'
  external_id: string
}

/** level → difficulty (expert pasa a advanced; desconocido → null). */
export function mapDifficulty(level: string): Difficulty | null {
  if (level === 'beginner' || level === 'intermediate') return level
  if (level === 'expert') return 'advanced'
  return null
}

/** category → exercise_type. */
export function mapExerciseType(category: string): ExerciseType {
  switch (category) {
    case 'cardio': return 'cardio'
    case 'stretching': return 'flexibility'
    case 'plyometrics': return 'hiit'
    // strength, powerlifting, strongman, olympic weightlifting, y cualquier otro
    default: return 'strength'
  }
}

/** equipment (string único) → array; 'body only'/'other'/vacío/null → []. */
export function mapEquipment(equipment: string | null): string[] {
  if (!equipment) return []
  const trimmed = equipment.trim()
  if (trimmed === '' || trimmed === 'body only' || trimmed === 'other') return []
  return [trimmed]
}

/** mechanic === 'compound'. */
export function isCompound(mechanic: string | null): boolean {
  return mechanic === 'compound'
}

/** Une los pasos no vacíos con saltos de línea; '' → null. */
export function joinInstructions(instructions: string[]): string | null {
  const text = instructions.map(s => s.trim()).filter(Boolean).join('\n')
  return text.length > 0 ? text : null
}

/** primary + secondary, deduplicado y recortado. */
export function muscleGroups(primary: string[], secondary: string[]): string[] {
  return Array.from(new Set([...primary, ...secondary].map(m => m.trim()).filter(Boolean)))
}

/** Ruta relativa del dataset → URL absoluta del CDN raw de GitHub. */
export function imageUrlFromPath(path: string): string {
  return `${IMAGE_BASE}${path}`
}

/** Registro del dataset → objeto de inserción (sin image_url; se añade tras re-alojar). */
export function toExerciseInsert(ex: FreeExercise): ExerciseInsertData {
  return {
    name: ex.name.trim(),
    description: null,
    muscle_groups: muscleGroups(ex.primaryMuscles, ex.secondaryMuscles),
    equipment: mapEquipment(ex.equipment),
    difficulty: mapDifficulty(ex.level),
    exercise_type: mapExerciseType(ex.category),
    is_compound: isCompound(ex.mechanic),
    instructions: joinInstructions(ex.instructions),
    is_public: true,
    source: 'free-exercise-db',
    external_id: ex.id,
  }
}

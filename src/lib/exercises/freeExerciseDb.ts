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
type MovementPattern =
  | 'squat' | 'hinge' | 'horizontal_push' | 'vertical_push'
  | 'horizontal_pull' | 'vertical_pull' | 'carry' | 'core'
  | 'isolation' | 'locomotion' | 'mobility' | 'balance'
type CardioModality = 'walking' | 'running' | 'cycling' | 'elliptical' | 'rowing' | 'stairs' | 'jump_rope'
type ImpactLevel = 'low' | 'moderate' | 'high'

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
  movement_patterns: MovementPattern[]
  cardio_modality: CardioModality | null
  impact_level: ImpactLevel | null
  joint_stress_tags: string[]
}

export interface ExerciseClassification {
  movement_patterns: MovementPattern[]
  cardio_modality: CardioModality | null
  impact_level: ImpactLevel | null
  joint_stress_tags: string[]
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

function matches(value: string, pattern: RegExp): boolean {
  return pattern.test(value.toLowerCase())
}

/** Deterministic taxonomy used by the evidence engine and rebuilt on every seed. */
export function classifyExerciseMetadata(ex: FreeExercise): ExerciseClassification {
  const name = ex.name.toLowerCase()
  const muscles = new Set(muscleGroups(ex.primaryMuscles, ex.secondaryMuscles).map(value => value.toLowerCase()))
  const primaryMuscles = new Set(ex.primaryMuscles.map(value => value.trim().toLowerCase()).filter(Boolean))
  const exerciseType = mapExerciseType(ex.category)
  const compound = isCompound(ex.mechanic)
  const patterns = new Set<MovementPattern>()

  let cardioModality: CardioModality | null = null
  if (exerciseType === 'cardio' || exerciseType === 'hiit') {
    if (matches(name, /\b(walk|walking)\b/)) cardioModality = 'walking'
    else if (matches(name, /\b(run|running|jog|jogging|sprint|treadmill)\b/)) cardioModality = 'running'
    else if (matches(name, /\b(cycl|cycling|bicycl|bike|biking)\w*\b/)) cardioModality = 'cycling'
    else if (matches(name, /\belliptical\b/)) cardioModality = 'elliptical'
    else if (matches(name, /\b(row|rowing|rower)\w*\b/)) cardioModality = 'rowing'
    else if (matches(name, /\b(stair|stairs|stairmaster|step[- ]?mill)\w*\b/)) cardioModality = 'stairs'
    else if (matches(name, /\b(jump rope|rope jumping|skipping rope)\b/)) cardioModality = 'jump_rope'
  }

  if (cardioModality) patterns.add('locomotion')
  if (exerciseType === 'flexibility') patterns.add('mobility')
  if (exerciseType === 'balance') patterns.add('balance')

  if (exerciseType === 'strength') {
    if (matches(name, /\b(squat|lunge|leg press|step[- ]?up)\w*\b/)) patterns.add('squat')
    if (matches(name, /\b(deadlift|good morning|hip thrust|glute bridge|kettlebell swing|pull[- ]?through)\w*\b/)) patterns.add('hinge')
    if (matches(name, /\b(bench press|chest press|floor press|board press|jm press|pin presses|push[- ]?up|chest fly|pec deck|dip|dips)\w*\b/)) patterns.add('horizontal_push')
    if (matches(name, /\bclose[- ]?grip.*(press|bench)\b/)) patterns.add('horizontal_push')
    if (matches(name, /\b(bent[- ]?over row|seated row|t[- ]?bar row|face pull|reverse fly)\w*\b/)) patterns.add('horizontal_pull')
    if (matches(name, /\b(overhead press|shoulder press|military press|push press|handstand push)\w*\b/)) patterns.add('vertical_push')
    if (matches(name, /\b(pull[- ]?up|chin[- ]?up|pulldown|lat pull)\w*\b/)) patterns.add('vertical_pull')
    if (matches(name, /\b(carry|farmer'?s walk|suitcase walk)\w*\b/)) patterns.add('carry')
    if (matches(name, /\b(clean|snatch)\w*\b/)) {
      patterns.add('hinge')
      patterns.add('vertical_push')
    }
    if (muscles.has('abdominals') || matches(name, /\b(plank|crunch|sit[- ]?up|leg raise)\w*\b/)) patterns.add('core')
    if (matches(name, /\bbalance board\b/)) patterns.add('balance')
    if (matches(name, /\bmonster walk\b/)) patterns.add('isolation')

    if (compound) {
      if (primaryMuscles.has('quadriceps')) patterns.add('squat')
      if (['hamstrings', 'glutes', 'lower back'].some(muscle => primaryMuscles.has(muscle))) patterns.add('hinge')
      if (primaryMuscles.has('chest')) patterns.add('horizontal_push')
      if (['middle back', 'lats', 'traps'].some(muscle => primaryMuscles.has(muscle))) patterns.add('horizontal_pull')
      if (primaryMuscles.has('shoulders')) patterns.add('vertical_push')
    } else {
      patterns.add('isolation')
    }
    if (patterns.size === 0 && ['biceps', 'triceps', 'forearms', 'calves', 'abductors', 'adductors'].some(muscle => primaryMuscles.has(muscle))) {
      patterns.add('isolation')
    }
  }

  const impactLevel: ImpactLevel | null = exerciseType === 'hiit'
    ? 'high'
    : cardioModality === 'running' || cardioModality === 'jump_rope'
      ? 'high'
      : cardioModality === 'stairs'
        ? 'moderate'
        : cardioModality
          ? 'low'
          : null

  const movementPatterns = Array.from(patterns)
  return {
    movement_patterns: movementPatterns,
    cardio_modality: cardioModality,
    impact_level: impactLevel,
    joint_stress_tags: [...movementPatterns],
  }
}

/** Ruta relativa del dataset → URL absoluta del CDN raw de GitHub. */
export function imageUrlFromPath(path: string): string {
  return `${IMAGE_BASE}${path}`
}

/** Registro del dataset → objeto de inserción (sin image_url; se añade tras re-alojar). */
export function toExerciseInsert(ex: FreeExercise): ExerciseInsertData {
  const classification = classifyExerciseMetadata(ex)
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
    ...classification,
  }
}

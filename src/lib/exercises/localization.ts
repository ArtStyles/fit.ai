export type ExerciseLanguage = 'es' | 'en'

export type LocalizableExercise = {
  name: string
  description?: string | null
  instructions?: string | null
  muscle_groups?: string[] | null
  equipment?: string[] | null
  name_es?: string | null
  description_es?: string | null
  instructions_es?: string | null
  muscle_groups_es?: string[] | null
  equipment_es?: string[] | null
}

export function exerciseLanguage(value: string | null | undefined): ExerciseLanguage {
  return value === 'en' ? 'en' : 'es'
}

/** Applies the preferred language while retaining the canonical fields as fallbacks. */
export function localizeExercise<T extends LocalizableExercise>(
  exercise: T,
  language: ExerciseLanguage,
): T {
  if (language === 'en') return exercise

  return {
    ...exercise,
    name: exercise.name_es?.trim() || exercise.name,
    description: exercise.description_es?.trim() || exercise.description,
    instructions: exercise.instructions_es?.trim() || exercise.instructions,
    muscle_groups: exercise.muscle_groups_es?.length
      ? exercise.muscle_groups_es
      : exercise.muscle_groups,
    equipment: exercise.equipment_es?.length
      ? exercise.equipment_es
      : exercise.equipment,
  }
}

export const LOCALIZED_EXERCISE_COLUMNS = [
  'name_es',
  'description_es',
  'instructions_es',
  'muscle_groups_es',
  'equipment_es',
] as const

const MUSCLE_ES: Record<string, string> = {
  abdominals: 'abdominales', abductors: 'abductores', adductors: 'aductores',
  biceps: 'bíceps', calves: 'pantorrillas', chest: 'pecho', forearms: 'antebrazos',
  glutes: 'glúteos', hamstrings: 'isquiotibiales', lats: 'dorsales',
  'lower back': 'zona lumbar', 'middle back': 'espalda media', neck: 'cuello',
  quadriceps: 'cuádriceps', shoulders: 'hombros', traps: 'trapecios', triceps: 'tríceps',
}

const EQUIPMENT_ES: Record<string, string> = {
  bands: 'bandas elásticas', barbell: 'barra', cable: 'polea', dumbbell: 'mancuerna',
  'exercise ball': 'pelota de ejercicio', 'e-z curl bar': 'barra EZ',
  'foam roll': 'rodillo de espuma', kettlebells: 'pesas rusas', machine: 'máquina',
  'medicine ball': 'balón medicinal',
}

export function localizeMuscleGroup(value: string, language: ExerciseLanguage): string {
  return language === 'es' ? MUSCLE_ES[value] ?? value : value
}

export function localizeEquipment(value: string, language: ExerciseLanguage): string {
  return language === 'es' ? EQUIPMENT_ES[value] ?? value : value
}

import manifest from '../../../public/exercises/catalog/v1/manifest.json'
import type { CatalogV1Manifest } from '@/lib/exercises/visualCatalogV1'
import { mapCatalogV1ManifestToRows } from '@/lib/exercises/catalogV1Rows'
import type { EngineExercise, TrainingProfile } from '@/lib/training-engine'
import type { MobileExercise } from './types'

const reviewed = manifest as unknown as CatalogV1Manifest

export const exerciseCatalog: MobileExercise[] = reviewed.exercises.map(exercise => ({
  id: exercise.slug,
  remoteId: null,
  name: exercise.nameEs,
  imageUrl: exercise.assets.poster,
  instructions: [exercise.startPosition, exercise.endPosition, ...exercise.techniqueChecks].join('\n'),
  muscleGroups: [...exercise.primaryMuscles, ...exercise.secondaryMuscles],
  equipment: [...exercise.equipment],
}))

const muscleNames: Record<string, string> = {
  'cuádriceps': 'quadriceps', 'glúteo mayor': 'glutes', 'glúteos': 'glutes',
  'isquiotibiales': 'hamstrings', 'pectoral mayor': 'chest',
  'pectoral mayor porción clavicular': 'chest', 'pectoral mayor porción esternal': 'chest',
  'deltoides anterior': 'shoulders', 'deltoides lateral': 'shoulders', 'deltoides posterior': 'shoulders',
  'dorsal ancho': 'lats', 'romboides': 'middle back', 'trapecio medio': 'middle back',
  'trapecio superior': 'traps', 'bíceps braquial': 'biceps', 'braquial': 'biceps',
  'braquiorradial': 'forearms', 'tríceps braquial': 'triceps', 'tríceps braquial cabeza larga': 'triceps',
  'recto abdominal': 'abdominals', 'pared abdominal profunda': 'abdominals', 'oblicuos': 'abdominals',
  'gastrocnemio': 'calves', 'sóleo': 'calves', 'erectores espinales': 'lower back',
}

const engineCatalog: EngineExercise[] = mapCatalogV1ManifestToRows(reviewed, 'https://unused.invalid').map(row => ({
  id: row.external_id,
  name: row.name_es ?? row.name,
  muscleGroups: row.muscle_groups.map(name => muscleNames[name] ?? name),
  equipment: row.equipment,
  exerciseType: row.exercise_type ?? 'strength',
  difficulty: row.difficulty,
  isCompound: row.is_compound ?? false,
  movementPatterns: row.movement_patterns as EngineExercise['movementPatterns'],
  cardioModality: row.cardio_modality as EngineExercise['cardioModality'],
  impactLevel: row.impact_level as EngineExercise['impactLevel'],
  jointStressTags: row.joint_stress_tags,
}))

const equipmentAliases: Record<string, RegExp> = {
  dumbbells: /^mancuernas?$/i,
  barbell: /^(barra|barra EZ|barra recta|discos)$/i,
  bench: /^banco( plano| inclinado| con respaldo)?$/i,
  kettlebell: /^kettlebell$/i,
  pull_up_bar: /^barra de dominadas$/i,
  cable_machine: /^(polea.*|cuerda|agarre.*|barra de jalón|asiento con apoyo de muslos)$/i,
  ab_wheel: /^rueda abdominal$/i,
}

/** Equipment constraints are enforced before the shared engine selects exercises. */
export function catalogueForProfile(profile: TrainingProfile): EngineExercise[] {
  if (profile.gymType === 'full_gym') return engineCatalog
  return engineCatalog.filter(exercise => exercise.equipment.every(required => {
    if (/^(peso corporal|colchoneta|ninguno|suelo)$/i.test(required)) return true
    if (profile.gymType === 'home_no_equipment') return false
    return profile.availableEquipment.some(equipment =>
      equipmentAliases[equipment]?.test(required) || equipment.toLowerCase() === required.toLowerCase(),
    )
  }))
}

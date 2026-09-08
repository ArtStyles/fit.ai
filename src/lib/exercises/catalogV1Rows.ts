import type { Database } from '@/types/database'
import type {
  CatalogV1ExerciseEntry,
  CatalogV1ExerciseSlug,
  CatalogV1Manifest,
} from './visualCatalogV1'

export const EXERCISE_CATALOG_V1_SOURCE = 'vekira-catalog-v1' as const
export const EXERCISE_MEDIA_BUCKET = 'exercise-media' as const

type ExerciseInsert = Database['public']['Tables']['exercises']['Insert']

export type CatalogV1ExerciseInsertRow = Required<Omit<ExerciseInsert, 'id'>> & {
  source: typeof EXERCISE_CATALOG_V1_SOURCE
  external_id: CatalogV1ExerciseSlug
}

export type CatalogV1ExerciseRow = CatalogV1ExerciseInsertRow & {
  legacy_source: CatalogV1ExerciseEntry['legacySource'] | null
  legacy_external_id: string | null
}

const COMPOUND_PATTERNS = new Set<CatalogV1ExerciseEntry['movementPatterns'][number]>([
  'squat',
  'hinge',
  'horizontal_push',
  'horizontal_pull',
  'vertical_push',
  'vertical_pull',
])

const CARDIO_MODALITY_BY_SLUG: Partial<Record<
  CatalogV1ExerciseSlug,
  NonNullable<CatalogV1ExerciseInsertRow['cardio_modality']>
>> = {
  'bicicleta-estatica': 'cycling',
  'caminata-cinta': 'walking',
  eliptica: 'elliptical',
  'remo-estacionario': 'rowing',
}

export function catalogV1PosterObjectKey(slug: CatalogV1ExerciseSlug): string {
  return `catalog/v1/${slug}/poster.webp`
}

export function catalogV1MotionObjectKey(slug: CatalogV1ExerciseSlug): string {
  return `catalog/v1/${slug}/motion-preview.webp`
}

export function exerciseMediaPublicUrl(supabaseUrl: string, objectKey: string): string {
  const projectUrl = supabaseUrl.trim().replace(/\/+$/, '')
  return `${projectUrl}/storage/v1/object/public/${EXERCISE_MEDIA_BUCKET}/${objectKey}`
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values))
}

function spanishInstructions(exercise: CatalogV1ExerciseEntry): string {
  return [
    `Posición inicial: ${exercise.startPosition}`,
    `Posición final: ${exercise.endPosition}`,
    'Puntos técnicos:',
    ...exercise.techniqueChecks.map(check => `- ${check}`),
  ].join('\n')
}

function isCompoundExercise(exercise: CatalogV1ExerciseEntry): boolean {
  if (/\bfly\b/i.test(exercise.nameEn)) return false
  return exercise.movementPatterns.some(pattern => COMPOUND_PATTERNS.has(pattern))
}

function mapExercise(exercise: CatalogV1ExerciseEntry, supabaseUrl: string): CatalogV1ExerciseRow {
  const cardioModality = CARDIO_MODALITY_BY_SLUG[exercise.slug] ?? null
  const muscleGroups = unique([...exercise.primaryMuscles, ...exercise.secondaryMuscles])
  const hasReviewedMotion = exercise.status === 'visual-approved'
    && exercise.motion?.status === 'visual-approved'

  return {
    wger_id: null,
    name: exercise.nameEn,
    name_es: exercise.nameEs,
    description: null,
    description_es: `Músculos principales: ${exercise.primaryMuscles.join(', ')}.`,
    muscle_groups: muscleGroups,
    muscle_groups_es: [...muscleGroups],
    equipment: [...exercise.equipment],
    equipment_es: [...exercise.equipment],
    difficulty: exercise.difficulty,
    exercise_type: exercise.region === 'cardio' ? 'cardio' : 'strength',
    is_compound: isCompoundExercise(exercise),
    instructions: null,
    instructions_es: spanishInstructions(exercise),
    video_url: null,
    image_url: exerciseMediaPublicUrl(supabaseUrl, catalogV1PosterObjectKey(exercise.slug)),
    motion_preview_url: hasReviewedMotion
      ? exerciseMediaPublicUrl(supabaseUrl, catalogV1MotionObjectKey(exercise.slug))
      : null,
    is_public: true,
    source: EXERCISE_CATALOG_V1_SOURCE,
    external_id: exercise.slug,
    movement_patterns: [...exercise.movementPatterns],
    cardio_modality: cardioModality,
    impact_level: cardioModality === null ? null : 'low',
    joint_stress_tags: [...exercise.movementPatterns],
    legacy_source: exercise.legacySource ?? null,
    legacy_external_id: exercise.legacyExternalId ?? null,
  }
}

export function mapCatalogV1ManifestToRows(
  manifest: CatalogV1Manifest,
  supabaseUrl: string,
): CatalogV1ExerciseRow[] {
  return manifest.exercises.map(exercise => mapExercise(exercise, supabaseUrl))
}

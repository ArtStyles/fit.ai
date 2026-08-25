export const CATALOG_V1_EXERCISE_SLUGS = [
  'sentadilla-trasera-barra',
  'press-banca-barra',
  'jalon-pecho-polea',
  'arnold-press-mancuernas',
  'rueda-abdominal-rodillas',
  'peso-muerto-rumano-barra',
  'press-inclinado-mancuernas',
  'remo-sentado-polea',
  'elevacion-lateral-mancuernas',
  'plancha-frontal',
  'prensa-piernas-45',
  'press-pecho-maquina',
  'remo-mancuerna-un-brazo',
  'curl-biceps-barra-ez',
  'bicicleta-estatica',
  'hip-thrust-barra',
  'aperturas-pecho-polea',
  'dominada-asistida-maquina',
  'apertura-inversa-maquina',
  'extension-triceps-cuerda',
  'curl-femoral-tumbado-maquina',
  'curl-martillo-mancuernas',
  'extension-triceps-sobre-cabeza-polea',
  'crunch-polea-rodillas',
  'caminata-cinta',
] as const

export type CatalogV1ExerciseSlug = (typeof CATALOG_V1_EXERCISE_SLUGS)[number]
export type CatalogV1Batch = 'pilot' | 1 | 2 | 3 | 4
export type CatalogV1ReviewStatus =
  | 'draft' | 'visual-approved' | 'technique-approved' | 'published'
export type CatalogV1Difficulty = 'beginner' | 'intermediate'
export type CatalogV1Region = 'legs' | 'chest' | 'back' | 'shoulders' | 'arms' | 'core' | 'cardio'
export type CatalogV1MovementPattern =
  | 'squat' | 'hinge' | 'horizontal_push' | 'horizontal_pull'
  | 'vertical_push' | 'vertical_pull' | 'core' | 'isolation' | 'locomotion'

export type CatalogV1Assets = {
  poster: string
  posterSha256?: string
  sourceObjectKey?: string
  sourceSha256?: string
}

export type CatalogV1VisualReview = {
  reviewer: string
  reviewedAt: string
  notes: string[]
}

export type CatalogV1TechniqueReview = CatalogV1VisualReview & {
  qualification: string
  references: string[]
}

export type CatalogV1ExerciseEntry = {
  slug: CatalogV1ExerciseSlug
  nameEs: string
  nameEn: string
  aliasesEs: string[]
  aliasesEn: string[]
  region: CatalogV1Region
  difficulty: CatalogV1Difficulty
  movementPatterns: CatalogV1MovementPattern[]
  equipment: string[]
  primaryMuscles: string[]
  secondaryMuscles: string[]
  startPosition: string
  endPosition: string
  techniqueChecks: string[]
  batch: CatalogV1Batch
  status: CatalogV1ReviewStatus
  reviews: {
    visual?: CatalogV1VisualReview
    technique?: CatalogV1TechniqueReview
  }
  assets: CatalogV1Assets
}

export type CatalogV1Manifest = {
  version: 1
  generatedAt: string
  visualStyle: 'vekira-anatomical-3d-v1'
  exercises: CatalogV1ExerciseEntry[]
}

const BATCHES: CatalogV1Batch[] = ['pilot', 1, 2, 3, 4]
const STATUSES = new Set<CatalogV1ReviewStatus>(['draft', 'visual-approved', 'technique-approved', 'published'])
const REGIONS = new Set<CatalogV1Region>(['legs', 'chest', 'back', 'shoulders', 'arms', 'core', 'cardio'])
const DIFFICULTIES = new Set<CatalogV1Difficulty>(['beginner', 'intermediate'])
const MOVEMENT_PATTERNS = new Set<CatalogV1MovementPattern>([
  'squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull', 'core', 'isolation', 'locomotion',
])
const SHA256 = /^[a-f0-9]{64}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString)
}

function isElevated(status: unknown): status is Exclude<CatalogV1ReviewStatus, 'draft'> {
  return status === 'visual-approved' || status === 'technique-approved' || status === 'published'
}

function requiresTechniqueReview(status: unknown): boolean {
  return status === 'technique-approved' || status === 'published'
}

function validateVisualReview(value: unknown, prefix: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${prefix} must be an object`)
    return
  }
  if (!isNonEmptyString(value.reviewer)) errors.push(`${prefix}.reviewer must be a non-empty string`)
  if (!isNonEmptyString(value.reviewedAt)) errors.push(`${prefix}.reviewedAt must be a non-empty string`)
  if (!isNonEmptyStringArray(value.notes)) errors.push(`${prefix}.notes must be a non-empty string array`)
}

function expectedBatch(index: number): CatalogV1Batch {
  return BATCHES[Math.floor(index / 5)]
}

export function validateCatalogV1Manifest(value: unknown): string[] {
  const errors: string[] = []

  if (!isRecord(value)) return ['manifest must be an object']
  if (value.version !== 1) errors.push('version must be 1')
  if (!isNonEmptyString(value.generatedAt)) errors.push('generatedAt must be a non-empty string')
  if (value.visualStyle !== 'vekira-anatomical-3d-v1') errors.push('visualStyle must be vekira-anatomical-3d-v1')
  if (!Array.isArray(value.exercises)) {
    errors.push('exercises must be an array')
    return errors
  }

  const suppliedSlugs = new Set(value.exercises
    .map(exercise => isRecord(exercise) ? exercise.slug : undefined)
    .filter(isNonEmptyString))
  if (
    value.exercises.length !== CATALOG_V1_EXERCISE_SLUGS.length
    || suppliedSlugs.size !== CATALOG_V1_EXERCISE_SLUGS.length
    || CATALOG_V1_EXERCISE_SLUGS.some(slug => !suppliedSlugs.has(slug))
  ) {
    errors.push('exercises must contain exactly the 25 supported V1 slugs')
  }

  const seenSlugs = new Set<string>()
  const seenPosters = new Set<string>()

  value.exercises.forEach((candidate, index) => {
    const prefix = `exercises[${index}]`
    if (!isRecord(candidate)) {
      errors.push(`${prefix} must be an object`)
      return
    }

    const slug = candidate.slug
    const validSlug = isNonEmptyString(slug) && CATALOG_V1_EXERCISE_SLUGS.includes(slug as CatalogV1ExerciseSlug)
    if (!validSlug) errors.push(`${prefix}.slug must be a supported V1 exercise`)
    else if (seenSlugs.has(slug)) errors.push(`${prefix}.slug must be unique`)
    else seenSlugs.add(slug)

    for (const field of ['nameEs', 'nameEn', 'startPosition', 'endPosition'] as const) {
      if (!isNonEmptyString(candidate[field])) errors.push(`${prefix}.${field} must be a non-empty string`)
    }
    for (const field of ['aliasesEs', 'aliasesEn', 'equipment', 'primaryMuscles', 'secondaryMuscles'] as const) {
      if (!isNonEmptyStringArray(candidate[field])) errors.push(`${prefix}.${field} must be a non-empty string array`)
    }
    if (!isNonEmptyStringArray(candidate.techniqueChecks) || candidate.techniqueChecks.length < 3) {
      errors.push(`${prefix}.techniqueChecks must contain at least three non-empty strings`)
    }
    if (!REGIONS.has(candidate.region as CatalogV1Region)) errors.push(`${prefix}.region must be a supported V1 region`)
    if (!DIFFICULTIES.has(candidate.difficulty as CatalogV1Difficulty)) errors.push(`${prefix}.difficulty must be a supported V1 difficulty`)
    if (
      !isNonEmptyStringArray(candidate.movementPatterns)
      || !candidate.movementPatterns.every(pattern => MOVEMENT_PATTERNS.has(pattern as CatalogV1MovementPattern))
    ) errors.push(`${prefix}.movementPatterns must be a non-empty array of supported V1 movement patterns`)

    if (candidate.batch !== expectedBatch(index)) errors.push(`${prefix}.batch must be ${expectedBatch(index)}`)
    if (!STATUSES.has(candidate.status as CatalogV1ReviewStatus)) errors.push(`${prefix}.status must be a supported review status`)

    if (!isRecord(candidate.assets)) {
      errors.push(`${prefix}.assets must be an object`)
    } else {
      const poster = candidate.assets.poster
      const expectedPoster = validSlug ? `/exercises/catalog/v1/${slug}/poster.webp` : undefined
      if (!isNonEmptyString(poster)) errors.push(`${prefix}.assets.poster must be a non-empty string`)
      else {
        if (expectedPoster && poster !== expectedPoster) errors.push(`${prefix}.assets.poster must belong to ${slug}`)
        if (seenPosters.has(poster)) errors.push(`${prefix}.assets.poster must be unique`)
        else seenPosters.add(poster)
      }

      for (const field of ['posterSha256', 'sourceSha256'] as const) {
        const hash = candidate.assets[field]
        if (hash !== undefined && (!isNonEmptyString(hash) || !SHA256.test(hash))) {
          errors.push(`${prefix}.assets.${field} must be a 64-character lowercase hex SHA-256`)
        }
      }
      const sourceKey = candidate.assets.sourceObjectKey
      if (sourceKey !== undefined) {
        const sourceHash = candidate.assets.sourceSha256
        if (!validSlug || !isNonEmptyString(sourceHash) || sourceKey !== `v1/${slug}/${sourceHash}.png`) {
          errors.push(`${prefix}.assets.sourceObjectKey must be v1/${slug}/${String(sourceHash)}.png`)
        }
      }
    }

    if (!isRecord(candidate.reviews)) errors.push(`${prefix}.reviews must be an object`)
    if (isElevated(candidate.status)) {
      if (!isRecord(candidate.assets)) {
        for (const field of ['posterSha256', 'sourceSha256', 'sourceObjectKey']) errors.push(`${prefix}.assets.${field} is required for ${candidate.status}`)
      } else {
        for (const field of ['posterSha256', 'sourceSha256', 'sourceObjectKey'] as const) {
          if (!isNonEmptyString(candidate.assets[field])) errors.push(`${prefix}.assets.${field} is required for ${candidate.status}`)
        }
      }
      if (!isRecord(candidate.reviews) || !isRecord(candidate.reviews.visual)) errors.push(`${prefix}.reviews.visual is required for ${candidate.status}`)
      else validateVisualReview(candidate.reviews.visual, `${prefix}.reviews.visual`, errors)
    }
    if (requiresTechniqueReview(candidate.status)) {
      if (!isRecord(candidate.reviews) || !isRecord(candidate.reviews.technique)) errors.push(`${prefix}.reviews.technique is required for ${candidate.status}`)
      else {
        validateVisualReview(candidate.reviews.technique, `${prefix}.reviews.technique`, errors)
        if (!isNonEmptyString(candidate.reviews.technique.qualification)) errors.push(`${prefix}.reviews.technique.qualification must be a non-empty string`)
        if (!isNonEmptyStringArray(candidate.reviews.technique.references)) errors.push(`${prefix}.reviews.technique.references must be a non-empty string array`)
      }
    }
  })

  return errors
}

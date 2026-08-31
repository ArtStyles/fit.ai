export const CATALOG_V1_BATCHES = [
  { batch: 'pilot', slugs: [
    'sentadilla-trasera-barra',
    'press-banca-barra',
    'jalon-pecho-polea',
    'arnold-press-mancuernas',
    'rueda-abdominal-rodillas',
  ] },
  { batch: 1, slugs: [
    'peso-muerto-rumano-barra',
    'press-inclinado-mancuernas',
    'remo-sentado-polea',
    'elevacion-lateral-mancuernas',
    'plancha-frontal',
  ] },
  { batch: 2, slugs: [
    'prensa-piernas-45',
    'press-pecho-maquina',
    'remo-mancuerna-un-brazo',
    'curl-biceps-barra-ez',
    'bicicleta-estatica',
  ] },
  { batch: 3, slugs: [
    'hip-thrust-barra',
    'aperturas-pecho-polea',
    'dominada-asistida-maquina',
    'apertura-inversa-maquina',
    'extension-triceps-cuerda',
  ] },
  { batch: 4, slugs: [
    'curl-femoral-tumbado-maquina',
    'curl-martillo-mancuernas',
    'extension-triceps-sobre-cabeza-polea',
    'crunch-polea-rodillas',
    'caminata-cinta',
  ] },
  { batch: 5, slugs: [
    'peso-muerto-convencional-barra', 'press-plano-mancuernas', 'flexiones-pecho',
    'dominadas-pronas', 'press-militar-pie-barra',
  ] },
  { batch: 6, slugs: [
    'sentadilla-goblet-kettlebell', 'sentadilla-bulgara-mancuernas',
    'zancadas-caminando-mancuernas', 'extension-cuadriceps-maquina',
    'elevacion-gemelos-pie-maquina',
  ] },
  { batch: 7, slugs: [
    'aperturas-pecho-maquina', 'fondos-paralelas-pecho', 'remo-inclinado-barra',
    'remo-t-agarre', 'jalon-brazos-rectos-polea',
  ] },
  { batch: 8, slugs: [
    'face-pull-polea', 'elevacion-frontal-mancuernas', 'curl-biceps-barra-recta',
    'curl-predicador-barra-ez', 'curl-biceps-polea-pie',
  ] },
  { batch: 9, slugs: [
    'press-frances-tumbado-barra-ez', 'elevacion-rodillas-colgado', 'plancha-lateral',
    'eliptica', 'remo-estacionario',
  ] },
] as const

export type CatalogV1Batch = (typeof CATALOG_V1_BATCHES)[number]['batch']
export type CatalogV1ExerciseSlug = (typeof CATALOG_V1_BATCHES)[number]['slugs'][number]
export const CATALOG_V1_EXERCISE_SLUGS: readonly CatalogV1ExerciseSlug[] =
  CATALOG_V1_BATCHES.flatMap(group => [...group.slugs])
export const CATALOG_V1_MOTION_PILOT_SLUGS = [
  'arnold-press-mancuernas',
  'sentadilla-trasera-barra',
  'press-banca-barra',
  'peso-muerto-rumano-barra',
  'jalon-pecho-polea',
  'remo-sentado-polea',
  'elevacion-lateral-mancuernas',
  'curl-biceps-barra-ez',
  'extension-triceps-cuerda',
  'rueda-abdominal-rodillas',
] as const
export type CatalogV1MotionPilotSlug = (typeof CATALOG_V1_MOTION_PILOT_SLUGS)[number]
export const CATALOG_V1_MOTION_SEQUENCE = [0, 1, 2, 3, 4, 3, 2, 1, 0, 1] as const
export const CATALOG_V1_MOTION_FRAME_COUNT = 10 as const
export const CATALOG_V1_MOTION_FRAME_DURATION_MS = 180 as const
export const CATALOG_V1_MOTION_MAX_BYTES = 500 * 1024
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

export type CatalogV1Motion = {
  status: 'visual-approved'
  preview: string
  previewSha256: string
  previewBytes: number
  sourceSha256: string
  frameCount: typeof CATALOG_V1_MOTION_FRAME_COUNT
  frameDurationMs: typeof CATALOG_V1_MOTION_FRAME_DURATION_MS
  sequence: typeof CATALOG_V1_MOTION_SEQUENCE
  review: CatalogV1VisualReview
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
  legacySource?: 'free-exercise-db'
  legacyExternalId?: string
  batch: CatalogV1Batch
  status: CatalogV1ReviewStatus
  reviews: {
    visual?: CatalogV1VisualReview
    technique?: CatalogV1TechniqueReview
  }
  assets: CatalogV1Assets
  motion?: CatalogV1Motion
}

export type CatalogV1Manifest = {
  version: 1
  generatedAt: string
  visualStyle: 'vekira-anatomical-3d-v1'
  exercises: CatalogV1ExerciseEntry[]
}

const BATCH_BY_SLUG = new Map<CatalogV1ExerciseSlug, CatalogV1Batch>(
  CATALOG_V1_BATCHES.flatMap(group => group.slugs.map(slug => [slug, group.batch] as const)),
)
const STATUSES = new Set<CatalogV1ReviewStatus>(['draft', 'visual-approved', 'technique-approved', 'published'])
const REGIONS = new Set<CatalogV1Region>(['legs', 'chest', 'back', 'shoulders', 'arms', 'core', 'cardio'])
const DIFFICULTIES = new Set<CatalogV1Difficulty>(['beginner', 'intermediate'])
const MOVEMENT_PATTERNS = new Set<CatalogV1MovementPattern>([
  'squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull', 'core', 'isolation', 'locomotion',
])
const SHA256 = /^[a-f0-9]{64}$/
const TECHNICAL_APPROVAL_CLAIM = /(?:\b(?:aprobaci[oó]n|aprob(?:ado|ada)|validaci[oó]n|valid(?:ado|ada)|qa)\b[^.!?;]{0,80}\bt[eé]cnica\b|\bt[eé]cnica\b[^.!?;]{0,80}\b(?:aprobaci[oó]n|aprob(?:ado|ada)|validaci[oó]n|valid(?:ado|ada))\b)/i

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

function validateTechniqueReview(value: unknown, prefix: string, errors: string[]): boolean {
  const errorCount = errors.length
  validateVisualReview(value, prefix, errors)
  if (!isRecord(value)) return false
  if (!isNonEmptyString(value.qualification)) errors.push(`${prefix}.qualification must be a non-empty string`)
  if (!isNonEmptyStringArray(value.references)) errors.push(`${prefix}.references must be a non-empty string array`)
  return errors.length === errorCount
}

function isFixedMotionSequence(value: unknown): boolean {
  return Array.isArray(value)
    && value.length === CATALOG_V1_MOTION_SEQUENCE.length
    && value.every((frame, index) => frame === CATALOG_V1_MOTION_SEQUENCE[index])
}

function validateMotion(value: unknown, slug: unknown, prefix: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${prefix} must be an object`)
    return
  }
  if (value.status !== 'visual-approved') errors.push(`${prefix}.status must be visual-approved`)
  const expectedPreview = isNonEmptyString(slug)
    ? `/exercises/catalog/v1/${slug}/motion-preview.webp`
    : undefined
  if (!isNonEmptyString(value.preview) || (expectedPreview && value.preview !== expectedPreview)) {
    errors.push(`${prefix}.preview must be ${expectedPreview ?? 'a non-empty string'}`)
  }
  for (const field of ['previewSha256', 'sourceSha256'] as const) {
    if (!isNonEmptyString(value[field]) || !SHA256.test(value[field])) {
      errors.push(`${prefix}.${field} must be a 64-character lowercase hex SHA-256`)
    }
  }
  if (typeof value.previewBytes !== 'number' || !Number.isInteger(value.previewBytes) || value.previewBytes < 1) {
    errors.push(`${prefix}.previewBytes must be a positive integer`)
  } else if (value.previewBytes > CATALOG_V1_MOTION_MAX_BYTES) {
    errors.push(`${prefix}.previewBytes must be at most ${CATALOG_V1_MOTION_MAX_BYTES}`)
  }
  if (value.frameCount !== CATALOG_V1_MOTION_FRAME_COUNT) {
    errors.push(`${prefix}.frameCount must be ${CATALOG_V1_MOTION_FRAME_COUNT}`)
  }
  if (value.frameDurationMs !== CATALOG_V1_MOTION_FRAME_DURATION_MS) {
    errors.push(`${prefix}.frameDurationMs must be ${CATALOG_V1_MOTION_FRAME_DURATION_MS}`)
  }
  if (!isFixedMotionSequence(value.sequence)) {
    errors.push(`${prefix}.sequence must be the fixed V1 motion sequence`)
  }
  validateVisualReview(value.review, `${prefix}.review`, errors)
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
    errors.push(`exercises must contain exactly the ${CATALOG_V1_EXERCISE_SLUGS.length} supported V1 slugs`)
  }

  const seenSlugs = new Set<string>()
  const seenPosters = new Set<string>()
  const seenLegacyExternalIds = new Set<string>()

  value.exercises.forEach((candidate, index) => {
    const prefix = `exercises[${index}]`
    if (!isRecord(candidate)) {
      errors.push(`${prefix} must be an object`)
      return
    }

    const slug = candidate.slug
    const expectedSlug = CATALOG_V1_EXERCISE_SLUGS[index]
    if (slug !== expectedSlug) errors.push(`${prefix}.slug must be ${expectedSlug}`)

    const validSlug = isNonEmptyString(slug) && BATCH_BY_SLUG.has(slug as CatalogV1ExerciseSlug)
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

    const hasLegacySource = candidate.legacySource !== undefined
    const hasLegacyExternalId = candidate.legacyExternalId !== undefined
    if (hasLegacySource !== hasLegacyExternalId) {
      errors.push(`${prefix}.legacySource and legacyExternalId must appear together`)
    }
    if (hasLegacySource && candidate.legacySource !== 'free-exercise-db') {
      errors.push(`${prefix}.legacySource must be free-exercise-db`)
    }
    if (hasLegacyExternalId) {
      if (!isNonEmptyString(candidate.legacyExternalId)) {
        errors.push(`${prefix}.legacyExternalId must be a non-empty string`)
      } else if (seenLegacyExternalIds.has(candidate.legacyExternalId)) {
        errors.push(`legacyExternalId must be unique: ${candidate.legacyExternalId}`)
      } else {
        seenLegacyExternalIds.add(candidate.legacyExternalId)
      }
    }

    if (validSlug) {
      const expectedBatch = BATCH_BY_SLUG.get(slug as CatalogV1ExerciseSlug)!
      if (candidate.batch !== expectedBatch) errors.push(`${prefix}.batch must be ${expectedBatch}`)
    }
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
    if (candidate.motion !== undefined) validateMotion(candidate.motion, slug, `${prefix}.motion`, errors)
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
    const techniqueValue = isRecord(candidate.reviews)
      ? candidate.reviews.technique
      : undefined
    let validTechniqueReview = false

    if (techniqueValue !== undefined) {
      validTechniqueReview = validateTechniqueReview(
        techniqueValue,
        `${prefix}.reviews.technique`,
        errors,
      )
    }

    if (requiresTechniqueReview(candidate.status) && !validTechniqueReview) {
      errors.push(`${prefix}.reviews.technique is required for ${candidate.status}`)
    }

    const visualNotes = isRecord(candidate.reviews) && isRecord(candidate.reviews.visual)
      ? candidate.reviews.visual.notes
      : undefined
    if (
      Array.isArray(visualNotes)
      && visualNotes.some(note => typeof note === 'string' && TECHNICAL_APPROVAL_CLAIM.test(note))
      && !validTechniqueReview
    ) {
      errors.push(`${prefix}.reviews.visual.notes cannot claim technical approval without a valid technique review`)
    }
  })

  return errors
}

export function validateCatalogV1MotionPilot(manifest: CatalogV1Manifest): string[] {
  const errors: string[] = []
  const selected = new Set<string>(CATALOG_V1_MOTION_PILOT_SLUGS)
  const withMotion = manifest.exercises.filter(exercise => exercise.motion !== undefined)
  const motionSlugs = new Set(withMotion.map(exercise => exercise.slug))

  if (
    withMotion.length !== CATALOG_V1_MOTION_PILOT_SLUGS.length
    || motionSlugs.size !== CATALOG_V1_MOTION_PILOT_SLUGS.length
    || CATALOG_V1_MOTION_PILOT_SLUGS.some(slug => !motionSlugs.has(slug))
  ) {
    errors.push(`motion pilot must contain exactly the ${CATALOG_V1_MOTION_PILOT_SLUGS.length} selected slugs`)
  }

  for (const exercise of manifest.exercises) {
    if (!selected.has(exercise.slug) && exercise.motion !== undefined) {
      errors.push(`motion is not selected for pilot: ${exercise.slug}`)
    }
    if (exercise.status !== 'visual-approved') {
      errors.push(`motion pilot exercise must be visual-approved: ${exercise.slug}`)
    }
    if (exercise.reviews.technique !== undefined) {
      errors.push(`motion pilot exercise must not include a technique review: ${exercise.slug}`)
    }
    if (selected.has(exercise.slug) && exercise.motion?.status !== 'visual-approved') {
      errors.push(`motion pilot motion must be visual-approved: ${exercise.slug}`)
    }
  }

  return errors
}

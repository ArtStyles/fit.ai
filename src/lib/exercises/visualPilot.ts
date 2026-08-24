export const PILOT_EXERCISE_SLUGS = [
  'sentadilla-trasera-barra',
  'press-banca-barra',
  'jalon-pecho-polea',
  'arnold-press-mancuernas',
  'rueda-abdominal-rodillas',
] as const

export type PilotExerciseSlug = (typeof PILOT_EXERCISE_SLUGS)[number]
export type PilotReviewStatus = 'draft' | 'visual-approved' | 'technique-approved' | 'published'

export type PilotExerciseEntry = {
  slug: PilotExerciseSlug
  nameEs: string
  nameEn: string
  pattern: string
  equipment: string[]
  primaryMuscles: string[]
  secondaryMuscles: string[]
  startPosition: string
  endPosition: string
  techniqueChecks: string[]
  status: PilotReviewStatus
  assets: {
    source: string
    poster: string
    motionPreview?: string
  }
}

export type PilotManifest = {
  version: 1
  generatedAt: string
  visualStyle: 'vekira-anatomical-3d-v1'
  exercises: PilotExerciseEntry[]
}

const STATUSES = new Set<PilotReviewStatus>([
  'draft',
  'visual-approved',
  'technique-approved',
  'published',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString)
}

export function validatePilotManifest(value: unknown): string[] {
  const errors: string[] = []

  if (!isRecord(value)) return ['manifest must be an object']
  if (value.version !== 1) errors.push('version must be 1')
  if (!isNonEmptyString(value.generatedAt)) errors.push('generatedAt must be a non-empty string')
  if (value.visualStyle !== 'vekira-anatomical-3d-v1') {
    errors.push('visualStyle must be vekira-anatomical-3d-v1')
  }
  if (!Array.isArray(value.exercises)) {
    errors.push('exercises must be an array')
    return errors
  }

  const seenSlugs = new Set<string>()

  value.exercises.forEach((candidate, index) => {
    const prefix = `exercises[${index}]`
    if (!isRecord(candidate)) {
      errors.push(`${prefix} must be an object`)
      return
    }

    const slug = candidate.slug
    if (!isNonEmptyString(slug) || !PILOT_EXERCISE_SLUGS.includes(slug as PilotExerciseSlug)) {
      errors.push(`${prefix}.slug must be a supported pilot exercise`)
    } else if (seenSlugs.has(slug)) {
      errors.push(`${prefix}.slug must be unique`)
    } else {
      seenSlugs.add(slug)
    }

    const stringFields = ['nameEs', 'nameEn', 'pattern', 'startPosition', 'endPosition'] as const
    for (const field of stringFields) {
      if (!isNonEmptyString(candidate[field])) errors.push(`${prefix}.${field} must be a non-empty string`)
    }

    const arrayFields = ['equipment', 'primaryMuscles', 'secondaryMuscles', 'techniqueChecks'] as const
    for (const field of arrayFields) {
      if (!isStringArray(candidate[field])) errors.push(`${prefix}.${field} must be a string array`)
    }

    const status = candidate.status
    if (!isNonEmptyString(status) || !STATUSES.has(status as PilotReviewStatus)) {
      errors.push(`${prefix}.status must be a supported review status`)
    }

    if (!isRecord(candidate.assets)) {
      errors.push(`${prefix}.assets must be an object`)
      return
    }

    const assetRules = [
      ['source', '/source.png'],
      ['poster', '/poster.webp'],
      ['motionPreview', '/motion-preview.webp'],
    ] as const

    for (const [field, suffix] of assetRules) {
      const path = candidate.assets[field]
      if (field === 'motionPreview' && path === undefined) continue
      if (!isNonEmptyString(path)) {
        errors.push(`${prefix}.assets.${field} must be a non-empty string`)
        continue
      }
      if (!path.startsWith('/exercises/pilot/')) {
        errors.push(`${prefix}.assets.${field} must start with /exercises/pilot/`)
      }
      if (!path.endsWith(suffix)) errors.push(`${prefix}.assets.${field} must end with ${suffix}`)
    }

    if (
      isNonEmptyString(candidate.assets.motionPreview)
      && status !== 'draft'
      && status !== 'visual-approved'
    ) {
      errors.push(`${prefix} with motionPreview must remain draft or visual-approved in the pilot`)
    }
  })

  return errors
}

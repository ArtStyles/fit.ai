import {
  CATALOG_V1_MOTION_PILOT_SLUGS,
  type CatalogV1Manifest,
  type CatalogV1MotionPilotSlug,
} from './visualCatalogV1'

export type MotionPreviewMapping = Record<CatalogV1MotionPilotSlug, string>

export type ExerciseMotionRow = {
  id: string
  name: string
  image_url: string | null
  motion_preview_url: string | null
}

export type MotionPreviewUpdatePlan = {
  slug: CatalogV1MotionPilotSlug
  exerciseId: string
  currentName: string
  currentImageUrl: string | null
  currentMotionPreviewUrl: string | null
  nextMotionPreviewUrl: string
}

const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateMotionPreviewMapping(value: unknown): asserts value is MotionPreviewMapping {
  if (!isRecord(value)) throw new Error('motion preview mapping must be an object')

  const expectedSlugs = new Set<string>(CATALOG_V1_MOTION_PILOT_SLUGS)
  const actualSlugs = Object.keys(value)
  if (
    actualSlugs.length !== CATALOG_V1_MOTION_PILOT_SLUGS.length
    || actualSlugs.some(slug => !expectedSlugs.has(slug))
    || CATALOG_V1_MOTION_PILOT_SLUGS.some(slug => !(slug in value))
  ) {
    throw new Error('motion preview mapping must contain exactly the ten pilot slugs')
  }

  const exerciseIds = new Set<string>()
  for (const slug of CATALOG_V1_MOTION_PILOT_SLUGS) {
    const exerciseId = value[slug]
    if (typeof exerciseId !== 'string' || !CANONICAL_UUID.test(exerciseId)) {
      throw new Error(`invalid canonical exercise UUID: ${slug}`)
    }
    if (exerciseIds.has(exerciseId)) throw new Error(`duplicate exercise UUID: ${exerciseId}`)
    exerciseIds.add(exerciseId)
  }
}

export function buildMotionPreviewUpdatePlan(input: {
  mapping: MotionPreviewMapping
  manifest: CatalogV1Manifest
  rows: ExerciseMotionRow[]
}): MotionPreviewUpdatePlan[] {
  validateMotionPreviewMapping(input.mapping)

  const rowsById = new Map<string, ExerciseMotionRow>()
  for (const row of input.rows) {
    if (rowsById.has(row.id)) throw new Error(`duplicate exercise row: ${row.id}`)
    rowsById.set(row.id, row)
  }

  return CATALOG_V1_MOTION_PILOT_SLUGS.map(slug => {
    const exerciseId = input.mapping[slug]
    const row = rowsById.get(exerciseId)
    if (!row) throw new Error(`missing exercise row: ${exerciseId}`)

    const manifestEntry = input.manifest.exercises.find(entry => entry.slug === slug)
    if (manifestEntry?.motion?.status !== 'visual-approved') {
      throw new Error(`visual-approved motion preview is required: ${slug}`)
    }

    return {
      slug,
      exerciseId,
      currentName: row.name,
      currentImageUrl: row.image_url,
      currentMotionPreviewUrl: row.motion_preview_url,
      nextMotionPreviewUrl: manifestEntry.motion.preview,
    }
  })
}

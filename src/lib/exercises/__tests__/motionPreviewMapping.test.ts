import { describe, expect, it } from 'vitest'
import {
  CATALOG_V1_MOTION_PILOT_SLUGS,
  type CatalogV1Manifest,
  type CatalogV1MotionPilotSlug,
} from '../visualCatalogV1'
import {
  buildMotionPreviewUpdatePlan,
  validateMotionPreviewMapping,
  type ExerciseMotionRow,
  type MotionPreviewMapping,
} from '../motionPreviewMapping'

const ids = CATALOG_V1_MOTION_PILOT_SLUGS.map((_, index) =>
  `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
)

function mappingFixture(): MotionPreviewMapping {
  return Object.fromEntries(
    CATALOG_V1_MOTION_PILOT_SLUGS.map((slug, index) => [slug, ids[index]]),
  ) as MotionPreviewMapping
}

function manifestFixture(): CatalogV1Manifest {
  return {
    version: 1,
    generatedAt: '2026-08-31T00:00:00.000Z',
    visualStyle: 'vekira-anatomical-3d-v1',
    exercises: CATALOG_V1_MOTION_PILOT_SLUGS.map(slug => ({
      slug,
      nameEs: `Manifest ${slug}`,
      status: 'visual-approved',
      motion: {
        status: 'visual-approved',
        preview: `/exercises/catalog/v1/${slug}/motion-preview.webp`,
      },
    })) as CatalogV1Manifest['exercises'],
  }
}

function rowsFixture(mapping = mappingFixture()): ExerciseMotionRow[] {
  return CATALOG_V1_MOTION_PILOT_SLUGS.map((slug, index) => ({
    id: mapping[slug],
    name: `Database row ${CATALOG_V1_MOTION_PILOT_SLUGS.at(-index - 1)}`,
    image_url: index % 2 === 0 ? `/posters/${slug}.webp` : null,
    motion_preview_url: index % 3 === 0 ? `/old/${slug}.webp` : null,
  }))
}

describe('motion preview mapping validation', () => {
  it('accepts exactly the ten canonical pilot slugs', () => {
    const value: unknown = mappingFixture()

    expect(() => validateMotionPreviewMapping(value)).not.toThrow()
    expect(Object.keys(value as MotionPreviewMapping)).toEqual([...CATALOG_V1_MOTION_PILOT_SLUGS])
  })

  it.each([
    ['a missing slug', (mapping: Record<string, string>) => { delete mapping[CATALOG_V1_MOTION_PILOT_SLUGS[0]] }],
    ['an extra slug', (mapping: Record<string, string>) => { mapping['not-in-pilot'] = '00000000-0000-4000-8000-000000000099' }],
    ['an invalid UUID', (mapping: Record<string, string>) => { mapping[CATALOG_V1_MOTION_PILOT_SLUGS[0]] = 'not-a-uuid' }],
    ['a duplicate UUID', (mapping: Record<string, string>) => { mapping[CATALOG_V1_MOTION_PILOT_SLUGS[1]] = mapping[CATALOG_V1_MOTION_PILOT_SLUGS[0]] }],
  ])('rejects %s', (_label, mutate) => {
    const value = { ...mappingFixture() }
    mutate(value)

    expect(() => validateMotionPreviewMapping(value)).toThrow()
  })
})

describe('motion preview update planning', () => {
  it('rejects a missing or duplicate selected database row', () => {
    const mapping = mappingFixture()
    const manifest = manifestFixture()
    const rows = rowsFixture(mapping)

    expect(() => buildMotionPreviewUpdatePlan({ mapping, manifest, rows: rows.slice(1) }))
      .toThrow(`missing exercise row: ${mapping[CATALOG_V1_MOTION_PILOT_SLUGS[0]]}`)
    expect(() => buildMotionPreviewUpdatePlan({ mapping, manifest, rows: [...rows, rows[0]] }))
      .toThrow(`duplicate exercise row: ${rows[0].id}`)
  })

  it('produces ten plans in canonical slug order using only UUID associations', () => {
    const mapping = mappingFixture()
    const manifest = manifestFixture()
    const rows = rowsFixture(mapping).reverse()

    const plans = buildMotionPreviewUpdatePlan({ mapping, manifest, rows })

    expect(plans).toHaveLength(10)
    expect(plans.map(plan => plan.slug)).toEqual([...CATALOG_V1_MOTION_PILOT_SLUGS])
    expect(plans).toEqual(CATALOG_V1_MOTION_PILOT_SLUGS.map((slug, index) => ({
      slug,
      exerciseId: mapping[slug],
      currentName: `Database row ${CATALOG_V1_MOTION_PILOT_SLUGS.at(-index - 1)}`,
      currentImageUrl: index % 2 === 0 ? `/posters/${slug}.webp` : null,
      currentMotionPreviewUrl: index % 3 === 0 ? `/old/${slug}.webp` : null,
      nextMotionPreviewUrl: `/exercises/catalog/v1/${slug}/motion-preview.webp`,
    })))
  })

  it('requires a visual-approved manifest motion for every selected slug', () => {
    const mapping = mappingFixture()
    const manifest = manifestFixture()
    const slug: CatalogV1MotionPilotSlug = CATALOG_V1_MOTION_PILOT_SLUGS[0]
    const entry = manifest.exercises.find(candidate => candidate.slug === slug)!
    entry.motion = undefined

    expect(() => buildMotionPreviewUpdatePlan({ mapping, manifest, rows: rowsFixture(mapping) }))
      .toThrow(`visual-approved motion preview is required: ${slug}`)
  })
})

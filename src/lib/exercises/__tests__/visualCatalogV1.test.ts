import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  CATALOG_V1_BATCHES,
  CATALOG_V1_EXERCISE_SLUGS,
  validateCatalogV1Manifest,
} from '../visualCatalogV1'

const entry = (slug: string, index: number) => ({
  slug,
  nameEs: `Nombre ${index}`,
  nameEn: `Name ${index}`,
  aliasesEs: [`alias ${index}`],
  aliasesEn: [`alias en ${index}`],
  region: 'legs',
  difficulty: 'beginner',
  movementPatterns: ['isolation'],
  equipment: ['equipo'],
  primaryMuscles: ['principal'],
  secondaryMuscles: ['secundario'],
  startPosition: 'Posición inicial completa.',
  endPosition: 'Posición final completa.',
  techniqueChecks: ['Control técnico uno', 'Control técnico dos', 'Control técnico tres'],
  batch: index < 5 ? 'pilot' : Math.min(4, Math.floor((index - 5) / 5) + 1),
  status: 'draft',
  reviews: {},
  assets: { poster: `/exercises/catalog/v1/${slug}/poster.webp` },
})

const valid = {
  version: 1,
  generatedAt: '2026-08-25',
  visualStyle: 'vekira-anatomical-3d-v1',
  exercises: CATALOG_V1_EXERCISE_SLUGS.map(entry),
}

describe('validateCatalogV1Manifest', () => {
  it('accepts the committed 25-entry V1 manifest', () => {
    const manifest = JSON.parse(readFileSync(
      path.resolve(process.cwd(), 'public/exercises/catalog/v1/manifest.json'),
      'utf8',
    ))

    expect(validateCatalogV1Manifest(manifest)).toEqual([])
    expect(manifest.exercises).toHaveLength(25)
    expect(manifest.exercises.slice(0, 5).every((entry: { batch: unknown }) => entry.batch === 'pilot')).toBe(true)
    expect(manifest.exercises.every((entry: { status: unknown }) =>
      entry.status === 'draft' || entry.status === 'visual-approved',
    )).toBe(true)
    expect(Object.fromEntries(['pilot', 1, 2, 3, 4].map(batch => [
      batch,
      manifest.exercises.filter((entry: { batch: unknown }) => entry.batch === batch).length,
    ]))).toEqual({ pilot: 5, 1: 5, 2: 5, 3: 5, 4: 5 })
  })

  it('accepts the exact V1 draft catalog', () => {
    expect(validateCatalogV1Manifest(valid)).toEqual([])
  })

  it('rejects a missing slug and a cross-exercise poster path', () => {
    const exercises = valid.exercises.slice(1)
    exercises[0] = { ...exercises[0], assets: { poster: '/exercises/catalog/v1/wrong/poster.webp' } }
    const errors = validateCatalogV1Manifest({ ...valid, exercises })
    expect(errors).toContain(
      `exercises must contain exactly the ${CATALOG_V1_EXERCISE_SLUGS.length} supported V1 slugs`,
    )
    expect(errors).toContain(`exercises[0].assets.poster must belong to ${exercises[0].slug}`)
  })

  it('requires the specification batch for each catalog position', () => {
    const exercises = valid.exercises.map((exercise, index) => index === 5
      ? { ...exercise, batch: 4 }
      : exercise)

    expect(validateCatalogV1Manifest({ ...valid, exercises })).toContain(
      'exercises[5].batch must be 1',
    )
  })

  it('derives the V1 order from five literal groups of five', () => {
    expect(CATALOG_V1_BATCHES.map(group => group.batch)).toEqual(['pilot', 1, 2, 3, 4])
    expect(CATALOG_V1_BATCHES.every(group => group.slugs.length === 5)).toBe(true)
    expect(CATALOG_V1_BATCHES.flatMap(group => [...group.slugs])).toEqual(CATALOG_V1_EXERCISE_SLUGS)
  })

  it('preserves the immutable wave-1 asset and review contract', () => {
    const manifest = JSON.parse(readFileSync(
      path.resolve(process.cwd(), 'public/exercises/catalog/v1/manifest.json'),
      'utf8',
    ))
    const projection = manifest.exercises.slice(0, 25).map(({
      slug, batch, status, reviews, assets,
    }: {
      slug: string
      batch: unknown
      status: unknown
      reviews: unknown
      assets: unknown
    }) => ({ slug, batch, status, reviews, assets }))
    const digest = createHash('sha256').update(JSON.stringify(projection)).digest('hex')

    expect(digest).toBe('829c098ec3690f56b9c9a3a404bf2f577dd74301bd757cb80a7077cead4ad63c')
  })

  it('rejects an out-of-order manifest even when membership is unchanged', () => {
    const exercises = valid.exercises.map(exercise => ({ ...exercise }))
    ;[exercises[0], exercises[1]] = [exercises[1], exercises[0]]

    expect(validateCatalogV1Manifest({ ...valid, exercises })).toEqual(expect.arrayContaining([
      'exercises[0].slug must be sentadilla-trasera-barra',
      'exercises[1].slug must be press-banca-barra',
    ]))
  })

  it('requires hashes and a private source key before visual approval', () => {
    const exercises = valid.exercises.map((exercise, index) => index === 5
      ? { ...exercise, status: 'visual-approved' }
      : exercise)
    expect(validateCatalogV1Manifest({ ...valid, exercises })).toEqual(expect.arrayContaining([
      'exercises[5].assets.posterSha256 is required for visual-approved',
      'exercises[5].assets.sourceSha256 is required for visual-approved',
      'exercises[5].assets.sourceObjectKey is required for visual-approved',
    ]))
  })

  it('requires recorded human review before elevated states', () => {
    const exercises = valid.exercises.map((exercise, index) => index === 5
      ? { ...exercise, status: 'published' }
      : exercise)
    expect(validateCatalogV1Manifest({ ...valid, exercises })).toEqual(expect.arrayContaining([
      'exercises[5].reviews.visual is required for published',
      'exercises[5].reviews.technique is required for published',
    ]))
  })

  it('rejects a present but invalid technique review before an elevated state', () => {
    const manifest = {
      ...valid,
      exercises: valid.exercises.map((exercise, index) => index === 5
        ? { ...exercise, reviews: { technique: null } }
        : exercise),
    }

    expect(validateCatalogV1Manifest(manifest)).toContain(
      'exercises[5].reviews.technique must be an object',
    )
  })

  it('rejects a technical approval claim in visual notes without a valid technique review', () => {
    const manifest = {
      ...valid,
      exercises: valid.exercises.map((exercise, index) => index === 5
        ? {
            ...exercise,
            reviews: {
              visual: {
                reviewer: 'Codex visual QA',
                reviewedAt: '2026-08-26',
                notes: ['Grupo 5 aprobado tras QA visual y técnica'],
              },
            },
          }
        : exercise),
    }

    expect(validateCatalogV1Manifest(manifest)).toContain(
      'exercises[5].reviews.visual.notes cannot claim technical approval without a valid technique review',
    )
  })

  it('allows a technical note only with a complete technique review', () => {
    const manifest = {
      ...valid,
      exercises: valid.exercises.map((exercise, index) => index === 5
        ? {
            ...exercise,
            reviews: {
              visual: {
                reviewer: 'Codex visual QA',
                reviewedAt: '2026-08-26',
                notes: ['Composición visual lista para revisión técnica'],
              },
              technique: {
                reviewer: 'Revisor clínico',
                reviewedAt: '2026-08-26',
                notes: ['Trayectoria revisada'],
                qualification: 'Fisioterapeuta colegiado',
                references: ['Registro interno de revisión técnica'],
              },
            },
          }
        : exercise),
    }

    expect(validateCatalogV1Manifest(manifest)).toEqual([])
  })
})

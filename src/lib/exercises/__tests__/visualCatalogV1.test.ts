import { describe, expect, it } from 'vitest'
import {
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
  it('accepts the exact V1 draft catalog', () => {
    expect(validateCatalogV1Manifest(valid)).toEqual([])
  })

  it('rejects a missing slug and a cross-exercise poster path', () => {
    const exercises = valid.exercises.slice(1)
    exercises[0] = { ...exercises[0], assets: { poster: '/exercises/catalog/v1/wrong/poster.webp' } }
    const errors = validateCatalogV1Manifest({ ...valid, exercises })
    expect(errors).toContain('exercises must contain exactly the 25 supported V1 slugs')
    expect(errors).toContain(`exercises[0].assets.poster must belong to ${exercises[0].slug}`)
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
})

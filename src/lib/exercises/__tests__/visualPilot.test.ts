import { describe, expect, it } from 'vitest'
import { PILOT_EXERCISE_SLUGS, validatePilotManifest } from '../visualPilot'

function entry(slug: (typeof PILOT_EXERCISE_SLUGS)[number]) {
  return {
    slug,
    nameEs: slug,
    nameEn: slug,
    pattern: 'patrón',
    equipment: ['equipo'],
    primaryMuscles: ['principal'],
    secondaryMuscles: ['secundario'],
    startPosition: 'Posición inicial.',
    endPosition: 'Posición final.',
    techniqueChecks: ['Control técnico'],
    status: 'draft',
    assets: {
      source: `/exercises/pilot/${slug}/source.png`,
      poster: `/exercises/pilot/${slug}/poster.webp`,
      ...(slug === 'arnold-press-mancuernas'
        ? { motionPreview: `/exercises/pilot/${slug}/motion-preview.webp` }
        : {}),
    },
  }
}

const validManifest = {
  version: 1,
  generatedAt: '2026-08-24',
  visualStyle: 'vekira-anatomical-3d-v1',
  exercises: PILOT_EXERCISE_SLUGS.map(entry),
}

describe('validatePilotManifest', () => {
  it('accepts the exact five-exercise pilot manifest', () => {
    expect(validatePilotManifest(validManifest)).toEqual([])
  })

  it('requires the exact set of five pilot exercises', () => {
    const incomplete = { ...validManifest, exercises: validManifest.exercises.slice(0, 4) }

    expect(validatePilotManifest(incomplete)).toContain(
      'exercises must contain exactly the five supported pilot slugs',
    )
  })

  it('rejects a duplicate slug', () => {
    const duplicate = {
      ...validManifest,
      exercises: [...validManifest.exercises, validManifest.exercises[0]],
    }

    expect(validatePilotManifest(duplicate)).toContain('exercises[5].slug must be unique')
  })

  it('rejects asset paths outside the pilot root', () => {
    const outsidePilot = {
      ...validManifest,
      exercises: validManifest.exercises.map((exercise, index) => index === 0
        ? { ...exercise, assets: { ...exercise.assets, poster: '/other/poster.webp' } }
        : exercise),
    }

    expect(validatePilotManifest(outsidePilot)).toContain(
      'exercises[0].assets.poster must start with /exercises/pilot/',
    )
  })

  it('rejects an asset stored beneath another exercise slug', () => {
    const wrongExerciseDirectory = {
      ...validManifest,
      exercises: validManifest.exercises.map((exercise, index) => index === 0
        ? {
            ...exercise,
            assets: {
              ...exercise.assets,
              source: '/exercises/pilot/press-banca-barra/source.png',
            },
          }
        : exercise),
    }

    expect(validatePilotManifest(wrongExerciseDirectory)).toContain(
      'exercises[0].assets.source must start with /exercises/pilot/sentadilla-trasera-barra/',
    )
  })

  it('rejects asset paths reused by two exercises', () => {
    const duplicatedAsset = {
      ...validManifest,
      exercises: validManifest.exercises.map((exercise, index) => index === 1
        ? {
            ...exercise,
            assets: {
              ...exercise.assets,
              source: validManifest.exercises[0].assets.source,
            },
          }
        : exercise),
    }

    expect(validatePilotManifest(duplicatedAsset)).toContain(
      'exercises[1].assets.source must be unique',
    )
  })

  it('rejects an experimental motion preview marked as published', () => {
    const published = {
      ...validManifest,
      exercises: validManifest.exercises.map(exercise => exercise.slug === 'arnold-press-mancuernas'
        ? { ...exercise, status: 'published' }
        : exercise),
    }

    expect(validatePilotManifest(published)).toContain(
      'exercises[3] with motionPreview must remain draft or visual-approved in the pilot',
    )
  })
})

import { describe, expect, it } from 'vitest'
import { validatePilotManifest } from '../visualPilot'

const validManifest = {
  version: 1,
  generatedAt: '2026-08-24',
  visualStyle: 'vekira-anatomical-3d-v1',
  exercises: [
    {
      slug: 'arnold-press-mancuernas',
      nameEs: 'Arnold Press sentado con mancuernas',
      nameEn: 'Seated Arnold Dumbbell Press',
      pattern: 'empuje-vertical',
      equipment: ['mancuernas', 'banco'],
      primaryMuscles: ['deltoides anterior', 'deltoides lateral'],
      secondaryMuscles: ['tríceps'],
      startPosition: 'Sentado, mancuernas a la altura de los hombros y palmas hacia el cuerpo.',
      endPosition: 'Brazos elevados sobre la cabeza y palmas orientadas al frente.',
      techniqueChecks: ['Columna neutra', 'Pies apoyados', 'Rotación progresiva de las manos'],
      status: 'visual-approved',
      assets: {
        source: '/exercises/pilot/arnold-press-mancuernas/source.png',
        poster: '/exercises/pilot/arnold-press-mancuernas/poster.webp',
        motionPreview: '/exercises/pilot/arnold-press-mancuernas/motion-preview.webp',
      },
    },
  ],
}

describe('validatePilotManifest', () => {
  it('accepts a complete pilot manifest entry', () => {
    expect(validatePilotManifest(validManifest)).toEqual([])
  })

  it('rejects a duplicate slug', () => {
    const duplicate = {
      ...validManifest,
      exercises: [validManifest.exercises[0], validManifest.exercises[0]],
    }

    expect(validatePilotManifest(duplicate)).toContain('exercises[1].slug must be unique')
  })

  it('rejects asset paths outside the pilot root', () => {
    const outsidePilot = {
      ...validManifest,
      exercises: [
        {
          ...validManifest.exercises[0],
          assets: { ...validManifest.exercises[0].assets, poster: '/other/poster.webp' },
        },
      ],
    }

    expect(validatePilotManifest(outsidePilot)).toContain(
      'exercises[0].assets.poster must start with /exercises/pilot/',
    )
  })

  it('rejects an experimental motion preview marked as published', () => {
    const published = {
      ...validManifest,
      exercises: [{ ...validManifest.exercises[0], status: 'published' }],
    }

    expect(validatePilotManifest(published)).toContain(
      'exercises[0] with motionPreview must remain draft or visual-approved in the pilot',
    )
  })
})

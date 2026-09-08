import { describe, expect, it } from 'vitest'
import manifestJson from '../../../../public/exercises/catalog/v1/manifest.json'
import {
  EXERCISE_CATALOG_V1_SOURCE,
  EXERCISE_MEDIA_BUCKET,
  mapCatalogV1ManifestToRows,
} from '../catalogV1Rows'
import type { CatalogV1Manifest } from '../visualCatalogV1'

const manifest = manifestJson as unknown as CatalogV1Manifest
const supabaseUrl = 'https://project-ref.supabase.co/'
const rows = mapCatalogV1ManifestToRows(manifest, supabaseUrl)

describe('mapCatalogV1ManifestToRows', () => {
  it('maps the 50 supported slugs to unique V1 source identities', () => {
    expect(rows).toHaveLength(50)
    expect(new Set(rows.map(row => row.external_id)).size).toBe(50)
    expect(rows.map(row => row.external_id)).toEqual(manifest.exercises.map(exercise => exercise.slug))
    expect(rows.every(row => row.source === EXERCISE_CATALOG_V1_SOURCE)).toBe(true)
    expect(EXERCISE_MEDIA_BUCKET).toBe('exercise-media')
  })

  it('emits the complete cutover payload with valid database values', () => {
    const expectedKeys = [
      'cardio_modality',
      'description',
      'description_es',
      'difficulty',
      'equipment',
      'equipment_es',
      'exercise_type',
      'external_id',
      'image_url',
      'impact_level',
      'instructions',
      'instructions_es',
      'is_compound',
      'is_public',
      'joint_stress_tags',
      'legacy_external_id',
      'legacy_source',
      'motion_preview_url',
      'movement_patterns',
      'muscle_groups',
      'muscle_groups_es',
      'name',
      'name_es',
      'source',
      'video_url',
      'wger_id',
    ]

    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(expectedKeys)
      expect(['beginner', 'intermediate', 'advanced']).toContain(row.difficulty)
      expect(['strength', 'cardio', 'flexibility', 'balance', 'hiit']).toContain(row.exercise_type)
      expect(row.cardio_modality === null || [
        'walking', 'running', 'cycling', 'elliptical', 'rowing', 'stairs', 'jump_rope',
      ].includes(row.cardio_modality)).toBe(true)
      expect(row.impact_level === null || ['low', 'moderate', 'high'].includes(row.impact_level)).toBe(true)
      expect(row.is_public).toBe(true)
    }
  })

  it('keeps the reviewed Spanish coaching instructions in the database payload', () => {
    rows.forEach((row, index) => {
      const exercise = manifest.exercises[index]

      expect(row.name).toBe(exercise.nameEn)
      expect(row.name_es).toBe(exercise.nameEs)
      expect(row.instructions).toBeNull()
      expect(row.instructions_es).toContain(`Posición inicial: ${exercise.startPosition}`)
      expect(row.instructions_es).toContain(`Posición final: ${exercise.endPosition}`)
      exercise.techniqueChecks.forEach(check => {
        expect(row.instructions_es).toContain(`- ${check}`)
      })
    })
  })

  it('builds deterministic public Storage URLs and exposes motion only when reviewed', () => {
    rows.forEach(row => {
      expect(row.image_url).toBe(
        `https://project-ref.supabase.co/storage/v1/object/public/exercise-media/catalog/v1/${row.external_id}/poster.webp`,
      )
    })

    expect(rows.filter(row => row.motion_preview_url !== null).map(row => row.external_id)).toEqual([
      'sentadilla-trasera-barra',
      'arnold-press-mancuernas',
      'elevacion-lateral-mancuernas',
    ])
    rows.filter(row => row.motion_preview_url !== null).forEach(row => {
      expect(row.motion_preview_url).toBe(
        `https://project-ref.supabase.co/storage/v1/object/public/exercise-media/catalog/v1/${row.external_id}/motion-preview.webp`,
      )
    })
  })

  it('carries only the 21 explicit legacy identities and never emits a half-pair', () => {
    const legacyRows = rows.filter(row => row.legacy_source !== null || row.legacy_external_id !== null)

    expect(legacyRows).toHaveLength(21)
    rows.forEach(row => {
      expect(row.legacy_source === null).toBe(row.legacy_external_id === null)
      if (row.legacy_source !== null) expect(row.legacy_source).toBe('free-exercise-db')
    })
  })
})

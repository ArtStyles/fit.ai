import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import catalogManifest from '../../public/exercises/catalog/v1/manifest.json'
import {
  CATALOG_V1_MOTION_FRAME_COUNT,
  CATALOG_V1_MOTION_FRAME_DURATION_MS,
  CATALOG_V1_MOTION_PILOT_SLUGS,
  CATALOG_V1_MOTION_SEQUENCE,
  type CatalogV1Manifest,
} from '../../src/lib/exercises/visualCatalogV1'
import type {
  ExerciseMotionRow,
  MotionPreviewMapping,
} from '../../src/lib/exercises/motionPreviewMapping'
import { runMotionPreviewMappingCli } from '../map-exercise-motion-previews'

const ids = CATALOG_V1_MOTION_PILOT_SLUGS.map((_, index) =>
  `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
)
const mapping = Object.fromEntries(
  CATALOG_V1_MOTION_PILOT_SLUGS.map((slug, index) => [slug, ids[index]]),
) as MotionPreviewMapping
const manifest = structuredClone(catalogManifest) as unknown as CatalogV1Manifest
for (const slug of CATALOG_V1_MOTION_PILOT_SLUGS) {
  const entry = manifest.exercises.find(candidate => candidate.slug === slug)!
  entry.motion = {
    status: 'visual-approved',
    preview: `/exercises/catalog/v1/${slug}/motion-preview.webp`,
    previewSha256: 'a'.repeat(64),
    previewBytes: 1,
    sourceSha256: 'b'.repeat(64),
    frameCount: CATALOG_V1_MOTION_FRAME_COUNT,
    frameDurationMs: CATALOG_V1_MOTION_FRAME_DURATION_MS,
    sequence: CATALOG_V1_MOTION_SEQUENCE,
    review: {
      reviewer: 'Motion pilot reviewer',
      reviewedAt: '2026-08-31T00:00:00.000Z',
      notes: ['Visual review only.'],
    },
  }
}
const rows: ExerciseMotionRow[] = CATALOG_V1_MOTION_PILOT_SLUGS.map((slug, index) => ({
  id: mapping[slug],
  name: `Exercise ${index + 1}`,
  image_url: null,
  motion_preview_url: null,
}))

describe('map exercise motion previews CLI', () => {
  it('performs only the selected read query and prints a dry-run plan', async () => {
    const update = vi.fn(() => { throw new Error('update must never be called') })
    const upsert = vi.fn(() => { throw new Error('upsert must never be called') })
    const inFilter = vi.fn().mockResolvedValue({ data: rows, error: null })
    const select = vi.fn(() => ({ in: inFilter, update, upsert }))
    const from = vi.fn(() => ({ select, update, upsert }))
    const createClient = vi.fn(() => ({ from }))
    const printTable = vi.fn()
    const printJson = vi.fn()
    const cwd = path.resolve('safe-cli-root')
    const mappingPath = path.join(cwd, '.artifacts', 'exercises', 'catalog-v1-motion', 'motion-preview-map.json')
    const manifestPath = path.join(cwd, 'public', 'exercises', 'catalog', 'v1', 'manifest.json')
    const readFile = vi.fn(async (filePath: string) => {
      if (filePath === mappingPath) return JSON.stringify(mapping)
      if (filePath === manifestPath) return JSON.stringify(manifest)
      throw new Error(`unexpected read: ${filePath}`)
    })

    const plans = await runMotionPreviewMappingCli([
      '--mapping',
      '.artifacts/exercises/catalog-v1-motion/motion-preview-map.json',
    ], { cwd, createClient, readFile, printTable, printJson })

    expect(createClient).toHaveBeenCalledOnce()
    expect(from).toHaveBeenCalledWith('exercises')
    expect(select).toHaveBeenCalledWith('id, name, image_url, motion_preview_url')
    expect(inFilter).toHaveBeenCalledWith('id', ids)
    expect(update).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
    expect(plans).toHaveLength(10)
    expect(printTable).toHaveBeenCalledWith(plans)
    expect(printJson).toHaveBeenCalledWith(JSON.stringify(plans, null, 2))
  })

  it('rejects --execute before creating a client', async () => {
    const createClient = vi.fn(() => { throw new Error('client must not be created') })

    await expect(runMotionPreviewMappingCli(['--execute'], { createClient }))
      .rejects.toThrow('--execute is intentionally unavailable in this phase')
    expect(createClient).not.toHaveBeenCalled()
  })

  it('requires a mapping path inside the local .artifacts directory', async () => {
    const createClient = vi.fn(() => { throw new Error('client must not be created') })

    await expect(runMotionPreviewMappingCli(['--mapping', 'mapping.json'], { createClient }))
      .rejects.toThrow('mapping must be inside .artifacts')
    expect(createClient).not.toHaveBeenCalled()
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { PilotManifest } from '../../src/lib/exercises/visualPilot'
import { validatePilotAssetFiles } from '../validate-exercise-visual-pilot'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { force: true, recursive: true })))
})

async function createPublicRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'vekira-visual-pilot-'))
  temporaryRoots.push(root)
  return root
}

function manifest(): PilotManifest {
  return {
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
        primaryMuscles: ['deltoides anterior'],
        secondaryMuscles: ['tríceps'],
        startPosition: 'Mancuernas frente a los hombros.',
        endPosition: 'Mancuernas estables sobre la cabeza.',
        techniqueChecks: ['Columna neutra'],
        status: 'draft',
        assets: {
          source: '/exercises/pilot/arnold-press-mancuernas/source.png',
          poster: '/exercises/pilot/arnold-press-mancuernas/poster.webp',
        },
      },
    ],
  }
}

describe('validatePilotAssetFiles', () => {
  it('accepts source and poster files beneath the public root', async () => {
    const publicRoot = await createPublicRoot()
    const assetDir = path.join(publicRoot, 'exercises', 'pilot', 'arnold-press-mancuernas')
    await mkdir(assetDir, { recursive: true })
    await Promise.all([
      writeFile(path.join(assetDir, 'source.png'), 'source'),
      writeFile(path.join(assetDir, 'poster.webp'), 'poster'),
    ])

    await expect(validatePilotAssetFiles(manifest(), publicRoot)).resolves.toEqual([])
  })

  it('reports a referenced poster that is missing', async () => {
    const publicRoot = await createPublicRoot()
    const assetDir = path.join(publicRoot, 'exercises', 'pilot', 'arnold-press-mancuernas')
    await mkdir(assetDir, { recursive: true })
    await writeFile(path.join(assetDir, 'source.png'), 'source')

    await expect(validatePilotAssetFiles(manifest(), publicRoot)).resolves.toEqual([
      'missing asset: /exercises/pilot/arnold-press-mancuernas/poster.webp',
    ])
  })
})

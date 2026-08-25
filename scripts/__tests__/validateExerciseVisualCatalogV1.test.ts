import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { CatalogV1Manifest } from '../../src/lib/exercises/visualCatalogV1'
import { validateCatalogV1AssetFiles } from '../validate-exercise-visual-catalog-v1'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { force: true, recursive: true })))
})

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

async function fixtureWithOneApprovedEntry() {
  const root = await mkdtemp(path.join(tmpdir(), 'vekira-visual-catalog-v1-'))
  temporaryRoots.push(root)
  const publicRoot = path.join(root, 'public')
  const artifactsRoot = path.join(root, 'artifacts')
  const slug = 'sentadilla-trasera-barra'
  const poster = Buffer.from('approved poster')
  const source = Buffer.from('approved source')
  const posterSha256 = sha256(poster)
  const sourceSha256 = sha256(source)
  const sourceObjectKey = `v1/${slug}/${sourceSha256}.png`

  await mkdir(path.join(publicRoot, 'exercises', 'catalog', 'v1', slug), { recursive: true })
  await mkdir(path.join(artifactsRoot, 'v1', slug), { recursive: true })
  await Promise.all([
    writeFile(path.join(publicRoot, 'exercises', 'catalog', 'v1', slug, 'poster.webp'), poster),
    writeFile(path.join(artifactsRoot, sourceObjectKey), source),
  ])

  const manifest = {
    version: 1,
    generatedAt: '2026-08-25',
    visualStyle: 'vekira-anatomical-3d-v1',
    exercises: [
      {
        slug,
        status: 'visual-approved',
        assets: {
          poster: `/exercises/catalog/v1/${slug}/poster.webp`,
          posterSha256,
          sourceObjectKey,
          sourceSha256,
        },
      },
      {
        slug: 'peso-muerto-rumano-barra',
        status: 'draft',
        assets: { poster: '/exercises/catalog/v1/peso-muerto-rumano-barra/poster.webp' },
      },
    ],
  } as CatalogV1Manifest

  return { artifactsRoot, manifest, publicRoot }
}

describe('validateCatalogV1AssetFiles', () => {
  it('accepts matching approved poster and staged source paths and hashes', async () => {
    const { artifactsRoot, manifest, publicRoot } = await fixtureWithOneApprovedEntry()

    await expect(validateCatalogV1AssetFiles(manifest, publicRoot, artifactsRoot)).resolves.toEqual([])
  })

  it('rejects digest mismatches and skips unbuilt drafts in partial mode', async () => {
    const { artifactsRoot, manifest, publicRoot } = await fixtureWithOneApprovedEntry()
    manifest.exercises[0].assets.posterSha256 = '0'.repeat(64)

    const errors = await validateCatalogV1AssetFiles(manifest, publicRoot, artifactsRoot, { complete: false })

    expect(errors).toContain('poster digest mismatch: sentadilla-trasera-barra')
    expect(errors).not.toContain('missing poster: peso-muerto-rumano-barra')
  })

  it('reports missing files, root escapes, and oversized posters explicitly', async () => {
    const { artifactsRoot, manifest, publicRoot } = await fixtureWithOneApprovedEntry()
    const approved = manifest.exercises[0]
    await rm(path.join(publicRoot, 'exercises', 'catalog', 'v1', approved.slug, 'poster.webp'))
    await rm(path.join(artifactsRoot, approved.assets.sourceObjectKey!))
    approved.assets.poster = '/../escape.webp'
    approved.assets.sourceObjectKey = '../escape.png'

    const errors = await validateCatalogV1AssetFiles(manifest, publicRoot, artifactsRoot)

    expect(errors).toEqual(expect.arrayContaining([
      'poster path escapes public root: sentadilla-trasera-barra',
      'source path escapes artifacts root: sentadilla-trasera-barra',
    ]))

    approved.assets.poster = `/exercises/catalog/v1/${approved.slug}/poster.webp`
    approved.assets.sourceObjectKey = `v1/${approved.slug}/${approved.assets.sourceSha256}.png`
    await mkdir(path.join(publicRoot, 'exercises', 'catalog', 'v1', approved.slug), { recursive: true })
    await writeFile(path.join(publicRoot, 'exercises', 'catalog', 'v1', approved.slug, 'poster.webp'), Buffer.alloc(102401))

    await expect(validateCatalogV1AssetFiles(manifest, publicRoot, artifactsRoot)).resolves.toEqual(expect.arrayContaining([
      'poster exceeds 102400 bytes: sentadilla-trasera-barra',
      'missing source: sentadilla-trasera-barra',
    ]))
  })

  it('requires draft poster files in complete mode', async () => {
    const { artifactsRoot, manifest, publicRoot } = await fixtureWithOneApprovedEntry()

    await expect(validateCatalogV1AssetFiles(manifest, publicRoot, artifactsRoot, { complete: true })).resolves.toContain(
      'missing poster: peso-muerto-rumano-barra',
    )
  })
})

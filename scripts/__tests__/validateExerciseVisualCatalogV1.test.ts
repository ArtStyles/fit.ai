import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
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
  await mkdir(path.join(artifactsRoot, slug), { recursive: true })
  await Promise.all([
    writeFile(path.join(publicRoot, 'exercises', 'catalog', 'v1', slug, 'poster.webp'), poster),
    writeFile(path.join(artifactsRoot, slug, 'source.png'), source),
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
  it('accepts matching approved poster and real staged source paths and hashes', async () => {
    const { artifactsRoot, manifest, publicRoot } = await fixtureWithOneApprovedEntry()
    manifest.exercises[0].assets.sourceObjectKey = 'v1/archive/remote-identity.png'

    await expect(validateCatalogV1AssetFiles(manifest, publicRoot, artifactsRoot)).resolves.toEqual([])
  })

  it('rejects digest mismatches and skips unbuilt drafts in partial mode', async () => {
    const { artifactsRoot, manifest, publicRoot } = await fixtureWithOneApprovedEntry()
    manifest.exercises[0].assets.posterSha256 = '0'.repeat(64)

    const errors = await validateCatalogV1AssetFiles(manifest, publicRoot, artifactsRoot, { complete: false })

    expect(errors).toContain('poster digest mismatch: sentadilla-trasera-barra')
    expect(errors).not.toContain('missing poster: peso-muerto-rumano-barra')
  })

  it.each(['technique-approved', 'published'] as const)(
    'validates %s assets in partial mode',
    async status => {
      const { artifactsRoot, manifest, publicRoot } = await fixtureWithOneApprovedEntry()
      manifest.exercises[0].status = status
      manifest.exercises[0].assets.posterSha256 = '0'.repeat(64)

      await expect(validateCatalogV1AssetFiles(
        manifest,
        publicRoot,
        artifactsRoot,
        { complete: false },
      )).resolves.toContain('poster digest mismatch: sentadilla-trasera-barra')
    },
  )

  it('reports missing files, root escapes, and oversized posters explicitly', async () => {
    const { artifactsRoot, manifest, publicRoot } = await fixtureWithOneApprovedEntry()
    const approved = manifest.exercises[0]
    await rm(path.join(publicRoot, 'exercises', 'catalog', 'v1', approved.slug, 'poster.webp'))

    await expect(validateCatalogV1AssetFiles(manifest, publicRoot, artifactsRoot)).resolves.toContain(
      'missing poster: sentadilla-trasera-barra',
    )

    approved.assets.poster = '/../escape.webp'

    const errors = await validateCatalogV1AssetFiles(manifest, publicRoot, artifactsRoot)

    expect(errors).toContain('poster path escapes public root: sentadilla-trasera-barra')

    approved.assets.poster = `/exercises/catalog/v1/${approved.slug}/poster.webp`
    await mkdir(path.join(publicRoot, 'exercises', 'catalog', 'v1', approved.slug), { recursive: true })
    await writeFile(path.join(publicRoot, 'exercises', 'catalog', 'v1', approved.slug, 'poster.webp'), Buffer.alloc(102401))

    await expect(validateCatalogV1AssetFiles(manifest, publicRoot, artifactsRoot)).resolves.toEqual(expect.arrayContaining([
      'poster exceeds 102400 bytes: sentadilla-trasera-barra',
    ]))
  })

  it('requires hashes for approved assets before comparing their contents', async () => {
    const { artifactsRoot, manifest, publicRoot } = await fixtureWithOneApprovedEntry()
    manifest.exercises[0].assets.posterSha256 = undefined
    manifest.exercises[0].assets.sourceSha256 = undefined

    await expect(validateCatalogV1AssetFiles(manifest, publicRoot, artifactsRoot)).resolves.toEqual(expect.arrayContaining([
      'missing poster digest: sentadilla-trasera-barra',
      'missing source digest: sentadilla-trasera-barra',
    ]))
  })

  it('rejects non-regular asset paths', async () => {
    const { artifactsRoot, manifest, publicRoot } = await fixtureWithOneApprovedEntry()
    const posterPath = path.join(publicRoot, 'exercises', 'catalog', 'v1', manifest.exercises[0].slug, 'poster.webp')
    await rm(posterPath)
    await mkdir(posterPath)

    await expect(validateCatalogV1AssetFiles(manifest, publicRoot, artifactsRoot)).resolves.toContain(
      'poster is not a regular file: sentadilla-trasera-barra',
    )
  })

  it('rejects a reparse link inside the public root that points outside it', async ({ skip }) => {
    const { artifactsRoot, manifest, publicRoot } = await fixtureWithOneApprovedEntry()
    const root = path.dirname(publicRoot)
    const externalDirectory = path.join(root, 'external-assets')
    const linkDirectory = path.join(publicRoot, 'linked-assets')
    await mkdir(externalDirectory)
    await writeFile(path.join(externalDirectory, 'poster.webp'), Buffer.from('approved poster'))

    try {
      await symlink(externalDirectory, linkDirectory, process.platform === 'win32' ? 'junction' : 'dir')
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EPERM' || code === 'EACCES' || code === 'ENOTSUP') {
        skip(`cannot create a directory link on this platform (${code})`)
        return
      }
      throw error
    }
    manifest.exercises[0].assets.poster = '/linked-assets/poster.webp'

    await expect(validateCatalogV1AssetFiles(manifest, publicRoot, artifactsRoot)).resolves.toContain(
      'poster path escapes public root: sentadilla-trasera-barra',
    )
  })

  it('requires draft poster files in complete mode', async () => {
    const { artifactsRoot, manifest, publicRoot } = await fixtureWithOneApprovedEntry()

    await expect(validateCatalogV1AssetFiles(manifest, publicRoot, artifactsRoot, { complete: true })).resolves.toContain(
      'missing poster: peso-muerto-rumano-barra',
    )
  })
})

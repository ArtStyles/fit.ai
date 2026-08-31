import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import path from 'node:path'
import type { CatalogV1Manifest } from '../../src/lib/exercises/visualCatalogV1'
import { validateCatalogV1AssetFiles } from '../validate-exercise-visual-catalog-v1'

const temporaryRoots: string[] = []
const executeFile = promisify(execFile)

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

  it('validates present motion files and their local motion source in partial mode', async () => {
    const { artifactsRoot, manifest, publicRoot } = await fixtureWithOneApprovedEntry()
    const entry = manifest.exercises[0]
    const preview = Buffer.from('motion preview')
    const motionSource = Buffer.from('motion source')
    const motionArtifactsRoot = path.join(path.dirname(artifactsRoot), 'catalog-v1-motion')
    const previewPath = path.join(publicRoot, 'exercises', 'catalog', 'v1', entry.slug, 'motion-preview.webp')
    const sourcePath = path.join(motionArtifactsRoot, entry.slug, 'motion-source.png')
    await mkdir(path.dirname(sourcePath), { recursive: true })
    await Promise.all([writeFile(previewPath, preview), writeFile(sourcePath, motionSource)])
    ;(entry as CatalogV1Manifest['exercises'][number] & { motion?: unknown }).motion = {
      status: 'visual-approved',
      preview: `/exercises/catalog/v1/${entry.slug}/motion-preview.webp`,
      previewSha256: sha256(preview),
      previewBytes: preview.length,
      sourceSha256: sha256(motionSource),
      frameCount: 10,
      frameDurationMs: 180,
      sequence: [0, 1, 2, 3, 4, 3, 2, 1, 0, 1],
      review: { reviewer: 'Motion QA', reviewedAt: '2026-08-30', notes: ['Approved.'] },
    }

    await expect(validateCatalogV1AssetFiles(manifest, publicRoot, artifactsRoot, {
      motionArtifactsRoot,
    })).resolves.toEqual([])

    ;(entry as CatalogV1Manifest['exercises'][number] & { motion: { preview: string; previewSha256: string; previewBytes: number; sourceSha256: string } }).motion.preview = '/../escape.webp'
    ;(entry as CatalogV1Manifest['exercises'][number] & { motion: { preview: string; previewSha256: string; previewBytes: number; sourceSha256: string } }).motion.previewSha256 = '0'.repeat(64)
    ;(entry as CatalogV1Manifest['exercises'][number] & { motion: { preview: string; previewSha256: string; previewBytes: number; sourceSha256: string } }).motion.previewBytes = 512001
    ;(entry as CatalogV1Manifest['exercises'][number] & { motion: { preview: string; previewSha256: string; previewBytes: number; sourceSha256: string } }).motion.sourceSha256 = '0'.repeat(64)

    await expect(validateCatalogV1AssetFiles(manifest, publicRoot, artifactsRoot, {
      motionArtifactsRoot,
    })).resolves.toEqual(expect.arrayContaining([
      `motion preview path escapes public root: ${entry.slug}`,
      `motion preview exceeds 512000 bytes: ${entry.slug}`,
      `motion source digest mismatch: ${entry.slug}`,
    ]))
  })

  it('makes the motion-pilot CLI reject nine previews and accept the exact ten', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vekira-motion-pilot-cli-'))
    temporaryRoots.push(root)
    const manifest = JSON.parse(await (await import('node:fs/promises')).readFile(
      path.resolve(process.cwd(), 'public/exercises/catalog/v1/manifest.json'),
      'utf8',
    )) as CatalogV1Manifest
    const motionSlugs = [
      'arnold-press-mancuernas', 'sentadilla-trasera-barra', 'press-banca-barra',
      'peso-muerto-rumano-barra', 'jalon-pecho-polea', 'remo-sentado-polea',
      'elevacion-lateral-mancuernas', 'curl-biceps-barra-ez',
      'extension-triceps-cuerda', 'rueda-abdominal-rodillas',
    ]
    const publicRoot = path.join(root, 'public')
    const artifactsRoot = path.join(root, '.artifacts', 'exercises', 'catalog-v1')
    const motionArtifactsRoot = path.join(root, '.artifacts', 'exercises', 'catalog-v1-motion')

    for (const exercise of manifest.exercises) {
      const poster = Buffer.from(`poster:${exercise.slug}`)
      const source = Buffer.from(`source:${exercise.slug}`)
      const posterPath = path.join(publicRoot, 'exercises', 'catalog', 'v1', exercise.slug, 'poster.webp')
      const sourcePath = path.join(artifactsRoot, exercise.slug, 'source.png')
      await Promise.all([mkdir(path.dirname(posterPath), { recursive: true }), mkdir(path.dirname(sourcePath), { recursive: true })])
      await Promise.all([writeFile(posterPath, poster), writeFile(sourcePath, source)])
      exercise.status = 'visual-approved'
      exercise.assets.posterSha256 = sha256(poster)
      exercise.assets.sourceSha256 = sha256(source)
      exercise.assets.sourceObjectKey = `v1/${exercise.slug}/${exercise.assets.sourceSha256}.png`
      exercise.reviews = { visual: { reviewer: 'Visual QA', reviewedAt: '2026-08-30', notes: ['Approved.'] } }
    }

    const writeMotion = async (slug: string) => {
      const preview = Buffer.from(`preview:${slug}`)
      const source = Buffer.from(`motion-source:${slug}`)
      const previewPath = path.join(publicRoot, 'exercises', 'catalog', 'v1', slug, 'motion-preview.webp')
      const sourcePath = path.join(motionArtifactsRoot, slug, 'motion-source.png')
      await Promise.all([mkdir(path.dirname(previewPath), { recursive: true }), mkdir(path.dirname(sourcePath), { recursive: true })])
      await Promise.all([writeFile(previewPath, preview), writeFile(sourcePath, source)])
      const exercise = manifest.exercises.find(candidate => candidate.slug === slug)!
      exercise.motion = {
        status: 'visual-approved', preview: `/exercises/catalog/v1/${slug}/motion-preview.webp`,
        previewSha256: sha256(preview), previewBytes: preview.length, sourceSha256: sha256(source),
        frameCount: 10, frameDurationMs: 180, sequence: [0, 1, 2, 3, 4, 3, 2, 1, 0, 1],
        review: { reviewer: 'Motion QA', reviewedAt: '2026-08-30', notes: ['Approved.'] },
      }
    }
    for (const slug of motionSlugs.slice(0, 9)) await writeMotion(slug)
    const manifestPath = path.join(publicRoot, 'exercises', 'catalog', 'v1', 'manifest.json')
    await writeFile(manifestPath, JSON.stringify(manifest))
    const script = path.resolve(process.cwd(), 'scripts', 'validate-exercise-visual-catalog-v1.ts')
    const tsx = path.resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs')

    await expect(executeFile(process.execPath, [tsx, script, '--complete', '--motion-pilot'], { cwd: root }))
      .rejects.toMatchObject({ stderr: expect.stringContaining('motion pilot must contain exactly the 10 selected slugs') })

    await writeMotion(motionSlugs[9])
    await writeFile(manifestPath, JSON.stringify(manifest))
    await expect(executeFile(process.execPath, [tsx, script, '--complete', '--motion-pilot'], { cwd: root }))
      .resolves.toMatchObject({ stderr: '' })
  })
})

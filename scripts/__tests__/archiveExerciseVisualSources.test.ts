import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CatalogV1ExerciseEntry } from '../../src/lib/exercises/visualCatalogV1'
import {
  archiveApprovedSources,
  archiveSource,
  buildSourceObjectKey,
  sha256File,
  type ArchiveSourceInput,
} from '../archive-exercise-visual-sources'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { force: true, recursive: true })))
})

async function sourceFixture(slug = 'plancha-frontal' as const) {
  const root = await mkdtemp(path.join(tmpdir(), 'vekira-source-archive-'))
  temporaryRoots.push(root)
  const sourcePath = path.join(root, slug, 'source.png')
  const bytes = Buffer.from('vekira immutable source')
  const expectedSha256 = createHash('sha256').update(bytes).digest('hex')
  await mkdir(path.dirname(sourcePath), { recursive: true })
  await writeFile(sourcePath, bytes)
  return { bytes, expectedSha256, root, slug, sourcePath }
}

function bucketDouble(overrides: Partial<ArchiveSourceInput['bucket']> = {}): ArchiveSourceInput['bucket'] {
  return {
    upload: vi.fn().mockResolvedValue({ error: null }),
    download: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
}

describe('exercise visual source archive', () => {
  it('builds immutable source keys', () => {
    expect(buildSourceObjectKey('plancha-frontal', 'a'.repeat(64))).toBe(
      'v1/plancha-frontal/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png',
    )
  })

  it('calculates the SHA-256 digest of a local source', async () => {
    const fixture = await sourceFixture()

    await expect(sha256File(fixture.sourcePath)).resolves.toBe(fixture.expectedSha256)
  })

  it('refuses to archive a source whose local digest changed', async () => {
    const fixture = await sourceFixture()
    const bucket = bucketDouble()

    await expect(archiveSource({
      slug: fixture.slug,
      expectedSha256: 'a'.repeat(64),
      sourcePath: fixture.sourcePath,
      bucket,
    })).rejects.toThrow('source digest mismatch: plancha-frontal')
    expect(bucket.upload).not.toHaveBeenCalled()
  })

  it('uploads a new PNG source without overwriting an existing object', async () => {
    const fixture = await sourceFixture()
    const bucket = bucketDouble()

    await expect(archiveSource({
      slug: fixture.slug,
      expectedSha256: fixture.expectedSha256,
      sourcePath: fixture.sourcePath,
      bucket,
    })).resolves.toBe('uploaded')
    expect(bucket.upload).toHaveBeenCalledOnce()
    expect(bucket.upload).toHaveBeenCalledWith(
      `v1/plancha-frontal/${fixture.expectedSha256}.png`,
      expect.any(Uint8Array),
      { contentType: 'image/png', upsert: false },
    )
  })

  it('accepts a 409 only after the existing object digest is verified', async () => {
    const fixture = await sourceFixture()
    const bucket = bucketDouble({
      upload: vi.fn().mockResolvedValue({ error: { message: 'Already exists', statusCode: '409' } }),
      download: vi.fn().mockResolvedValue({ data: new Blob([fixture.bytes]), error: null }),
    })

    await expect(archiveSource({
      slug: fixture.slug,
      expectedSha256: fixture.expectedSha256,
      sourcePath: fixture.sourcePath,
      bucket,
    })).resolves.toBe('verified-existing')
    expect(bucket.download).toHaveBeenCalledWith(
      `v1/plancha-frontal/${fixture.expectedSha256}.png`,
    )
  })

  it('rejects a 409 when the existing object digest differs', async () => {
    const fixture = await sourceFixture()
    const bucket = bucketDouble({
      upload: vi.fn().mockResolvedValue({ error: { message: 'Already exists', statusCode: '409' } }),
      download: vi.fn().mockResolvedValue({ data: new Blob(['different source']), error: null }),
    })

    await expect(archiveSource({
      slug: fixture.slug,
      expectedSha256: fixture.expectedSha256,
      sourcePath: fixture.sourcePath,
      bucket,
    })).rejects.toThrow('existing source digest mismatch: plancha-frontal')
  })

  it('plans approved source keys in dry-run mode without creating a remote bucket', async () => {
    const fixture = await sourceFixture()
    const entry = {
      slug: fixture.slug,
      status: 'visual-approved',
      assets: {
        poster: `/exercises/catalog/v1/${fixture.slug}/poster.webp`,
        sourceSha256: fixture.expectedSha256,
        sourceObjectKey: `v1/${fixture.slug}/${fixture.expectedSha256}.png`,
      },
    } as CatalogV1ExerciseEntry
    const createBucket = vi.fn(() => {
      throw new Error('remote client must not be created in dry-run mode')
    })
    const log = vi.fn()

    await expect(archiveApprovedSources({
      entries: [entry],
      artifactsRoot: fixture.root,
      upload: false,
      createBucket,
      log,
    })).resolves.toEqual([
      `v1/${fixture.slug}/${fixture.expectedSha256}.png`,
    ])
    expect(createBucket).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(
      `[dry-run] v1/${fixture.slug}/${fixture.expectedSha256}.png`,
    )
  })
})

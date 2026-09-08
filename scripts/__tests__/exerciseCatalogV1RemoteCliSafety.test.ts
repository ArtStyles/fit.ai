import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database'
import {
  BACKUP_COMPLETE_FILE,
  BACKUP_INTEGRITY_FILE,
  createVerifyingBackupFileSystemDependencies,
  readStorageInventory,
  runExerciseCatalogV1RemoteCli,
  verifyCompletedBackup,
} from '../exercise-catalog-v1-remote'

const PROJECT_REF = 'abcdefghijklmnopqrst'
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, {
    recursive: true,
    force: true,
  })))
})

describe('exercise catalog V1 destructive target confirmation', () => {
  it('rejects an execute command without an explicit expected project ref before remote access', async () => {
    let remoteReads = 0

    await expect(runExerciseCatalogV1RemoteCli(['deploy', '--execute'], {
      cwd: process.cwd(),
      env: { NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL },
      remote: {
        async readSnapshot() {
          remoteReads += 1
          throw new Error('must not be reached')
        },
        async uploadAsset() { throw new Error('must not be reached') },
        async inspectAsset() { throw new Error('must not be reached') },
        async probePublicUrl() { throw new Error('must not be reached') },
        async replaceCatalog() { throw new Error('must not be reached') },
      },
    })).rejects.toThrow('explicit --expected-project-ref')

    expect(remoteReads).toBe(0)
  })

  it('rejects an execute command when the expected project ref differs from the URL hostname', async () => {
    let remoteReads = 0

    await expect(runExerciseCatalogV1RemoteCli([
      'deploy',
      '--execute',
      '--expected-project-ref=zyxwvutsrqponmlkjihg',
    ], {
      cwd: process.cwd(),
      env: { NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL },
      remote: {
        async readSnapshot() {
          remoteReads += 1
          throw new Error('must not be reached')
        },
        async uploadAsset() { throw new Error('must not be reached') },
        async inspectAsset() { throw new Error('must not be reached') },
        async probePublicUrl() { throw new Error('must not be reached') },
        async replaceCatalog() { throw new Error('must not be reached') },
      },
    })).rejects.toThrow('does not match NEXT_PUBLIC_SUPABASE_URL')

    expect(remoteReads).toBe(0)
  })
})

describe('exercise media bucket inventory', () => {
  it('captures bucket metadata and recursively inventories objects from the bucket root', async () => {
    const visitedPrefixes: string[] = []
    const pages = new Map<string, Array<Record<string, unknown>>>([
      ['', [
        { id: null, name: 'catalog' },
        {
          id: 'legacy-id',
          name: 'legacy.webp',
          updated_at: '2026-09-07T10:00:00Z',
          metadata: { size: 17, sha256: '1'.repeat(64) },
        },
      ]],
      ['catalog', [{ id: null, name: 'v1' }]],
      ['catalog/v1', [{
        id: 'new-id',
        name: 'poster.webp',
        updated_at: '2026-09-07T11:00:00Z',
        metadata: { size: 23, sha256: '2'.repeat(64) },
      }]],
    ])
    const fakeClient = {
      storage: {
        async getBucket(bucket: string) {
          expect(bucket).toBe('exercise-media')
          return {
            data: {
              id: bucket,
              name: bucket,
              public: true,
              file_size_limit: 5_000_000,
              allowed_mime_types: ['image/webp'],
              created_at: '2026-09-07T09:00:00Z',
              updated_at: '2026-09-07T09:30:00Z',
            },
            error: null,
          }
        },
        from(bucket: string) {
          expect(bucket).toBe('exercise-media')
          return {
            async list(prefix: string, options: { offset: number }) {
              visitedPrefixes.push(prefix)
              return {
                data: options.offset === 0 ? (pages.get(prefix) ?? []) : [],
                error: null,
              }
            },
          }
        },
      },
    } as unknown as SupabaseClient<Database>

    const inventory = await readStorageInventory(fakeClient)

    expect(visitedPrefixes).toEqual(['', 'catalog', 'catalog/v1'])
    expect(inventory).toEqual([
      expect.objectContaining({
        name: '$bucket',
        kind: 'bucket',
        bucket: expect.objectContaining({
          id: 'exercise-media',
          public: true,
          allowed_mime_types: ['image/webp'],
        }),
      }),
      expect.objectContaining({ name: 'catalog/v1/poster.webp', kind: 'object' }),
      expect.objectContaining({ name: 'legacy.webp', kind: 'object' }),
    ])
  })
})

describe('exercise catalog V1 durable backup', () => {
  it('writes and reads back per-file digests before creating a completion marker', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'vekira-catalog-backup-'))
    temporaryDirectories.push(directory)
    const fileSystem = createVerifyingBackupFileSystemDependencies()
    await fileSystem.mkdir(directory)

    await fileSystem.writeFile(path.join(directory, 'catalog-rows.json'), '[{"id":"1"}]\n')
    await fileSystem.writeFile(path.join(directory, 'bucket-inventory.json'), '[{"name":"legacy.webp"}]\n')
    await fileSystem.writeFile(path.join(directory, 'reference-counts.json'), '{"exercise_logs":1}\n')
    await fileSystem.writeFile(path.join(directory, 'manifest.sha256'), `${'a'.repeat(64)}\n`)

    const integrity = JSON.parse(await readFile(path.join(directory, BACKUP_INTEGRITY_FILE), 'utf8'))
    const completion = JSON.parse(await readFile(path.join(directory, BACKUP_COMPLETE_FILE), 'utf8'))
    expect(Object.keys(integrity.files)).toEqual([
      'bucket-inventory.json',
      'catalog-rows.json',
      'manifest.sha256',
      'reference-counts.json',
    ])
    expect(integrity.files['catalog-rows.json'].sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(completion.integritySha256).toMatch(/^[a-f0-9]{64}$/)
    await expect(verifyCompletedBackup(directory)).resolves.toBeUndefined()

    await writeFile(path.join(directory, 'catalog-rows.json'), 'tampered\n')
    await expect(verifyCompletedBackup(directory)).rejects.toThrow('backup digest mismatch')
  })
})

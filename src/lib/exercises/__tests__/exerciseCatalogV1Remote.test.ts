import { createHash } from 'node:crypto'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import manifestJson from '../../../../public/exercises/catalog/v1/manifest.json'
import {
  mapCatalogV1ManifestToRows,
  type CatalogV1ExerciseRow,
} from '../catalogV1Rows'
import {
  buildCatalogV1AssetSpecs,
  catalogV1SemanticSha256,
  EXPECTED_CATALOG_V1_SEMANTIC_SHA256,
  parseExerciseCatalogV1RemoteCommand,
  runExerciseCatalogV1Remote,
  sanitizeRemoteDiagnostic,
  sha256Bytes,
  type CatalogV1AssetSpec,
  type CatalogV1RemoteDependencies,
  type CatalogV1RemoteSnapshot,
  type ExerciseCatalogV1RemoteInput,
} from '../exerciseCatalogV1Remote'
import type { CatalogV1Manifest } from '../visualCatalogV1'
import { runExerciseCatalogV1RemoteCli } from '../../../../scripts/exercise-catalog-v1-remote'

const SUPABASE_URL = 'https://project-ref.supabase.co'
const manifest = manifestJson as unknown as CatalogV1Manifest

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function catalogRows(): CatalogV1ExerciseRow[] {
  return mapCatalogV1ManifestToRows(manifest, SUPABASE_URL)
}

function assetSpecs(): CatalogV1AssetSpec[] {
  return catalogRows().flatMap(row => {
    const posterBytes = new TextEncoder().encode(`poster:${row.external_id}`)
    const poster: CatalogV1AssetSpec = {
      slug: row.external_id,
      kind: 'poster',
      objectKey: `catalog/v1/${row.external_id}/poster.webp`,
      localPath: path.resolve('public', 'exercises', 'catalog', 'v1', row.external_id, 'poster.webp'),
      publicUrl: row.image_url!,
      expectedSha256: digest(posterBytes),
      contentType: 'image/webp',
    }
    if (row.motion_preview_url === null) return [poster]
    const motionBytes = new TextEncoder().encode(`motion:${row.external_id}`)
    return [poster, {
      slug: row.external_id,
      kind: 'motion',
      objectKey: `catalog/v1/${row.external_id}/motion-preview.webp`,
      localPath: path.resolve('public', 'exercises', 'catalog', 'v1', row.external_id, 'motion-preview.webp'),
      publicUrl: row.motion_preview_url,
      expectedSha256: digest(motionBytes),
      contentType: 'image/webp',
    }]
  })
}

function snapshot(
  referenceCounts = {
    exercise_logs: 11,
    workout_exercises: 22,
    trainer_template_exercises: 33,
  },
): CatalogV1RemoteSnapshot {
  return {
    capturedAt: '2026-09-07T23:00:00.000Z',
    catalogRows: catalogRows().map(row => {
      const { legacy_source: _legacySource, legacy_external_id: _legacyExternalId, ...persisted } = row
      return {
        id: `id-${row.external_id}`,
        created_at: '2026-09-07T23:00:00.000Z',
        ...persisted,
      }
    }),
    storageObjects: [],
    referenceCounts,
  }
}

function input(assets = assetSpecs()): ExerciseCatalogV1RemoteInput {
  return {
    rows: catalogRows(),
    assets,
    manifestSha256: 'a'.repeat(64),
  }
}

function dependencies(events: string[], snapshots = [snapshot(), snapshot()]): CatalogV1RemoteDependencies {
  let snapshotIndex = 0
  return {
    cwd: 'D:\\work\\project',
    now: () => new Date('2026-09-07T23:12:34.567Z'),
    secrets: ['service-secret'],
    fileSystem: {
      async readFile(filePath) {
        events.push(`read:${path.basename(path.dirname(filePath))}`)
        const slug = path.basename(path.dirname(filePath))
        const kind = path.basename(filePath) === 'motion-preview.webp' ? 'motion' : 'poster'
        return new TextEncoder().encode(`${kind}:${slug}`)
      },
      async mkdir(directory) {
        events.push(`mkdir:${directory}`)
      },
      async writeFile(filePath) {
        events.push(`write:${path.basename(filePath)}`)
      },
    },
    remote: {
      async readSnapshot() {
        events.push('remote:audit')
        return snapshots[Math.min(snapshotIndex++, snapshots.length - 1)]
      },
      async uploadAsset(asset, bytes) {
        events.push(`remote:upload:${asset.objectKey}`)
        return { size: bytes.byteLength, sha256: asset.expectedSha256 }
      },
      async inspectAsset(asset) {
        events.push(`remote:inspect:${asset.objectKey}`)
        const bytes = new TextEncoder().encode(`${asset.kind}:${asset.slug}`)
        return { size: bytes.byteLength, sha256: asset.expectedSha256 }
      },
      async probePublicUrl(asset) {
        events.push(`remote:probe:${asset.objectKey}`)
      },
      async replaceCatalog(rows) {
        events.push(`remote:rpc:${rows.length}`)
        return {
          source: 'vekira-catalog-v1',
          input_count: 50,
          inserted_count: 0,
          updated_count: 50,
          hidden_count: 0,
          deleted_count: 0,
          public_v1_count: 50,
          public_legacy_count: 0,
          exercise_logs_remapped_count: 3,
          workout_exercises_remapped_count: 7,
          trainer_template_exercises_remapped_count: 2,
          catalog_semantic_sha256: EXPECTED_CATALOG_V1_SEMANTIC_SHA256,
        }
      },
    },
    log(message) {
      events.push(`log:${message}`)
    },
  }
}

describe('exercise catalog V1 remote command parsing', () => {
  it.each([
    [[], { mode: 'audit' }],
    [['audit'], { mode: 'audit' }],
    [['backup'], { mode: 'backup' }],
    [['verify'], { mode: 'verify' }],
    [['deploy'], { mode: 'deploy', execute: false }],
    [['deploy', '--execute'], { mode: 'deploy', execute: true }],
  ])('parses %j', (args, expected) => {
    expect(parseExerciseCatalogV1RemoteCommand(args)).toEqual(expected)
  })

  it.each([
    ['audit', '--execute'],
    ['deploy', '--execute', '--execute'],
    ['unknown'],
  ])('rejects unsafe or unknown arguments: %s', (...args) => {
    expect(() => parseExerciseCatalogV1RemoteCommand(args)).toThrow()
  })
})

describe('exercise catalog V1 asset contract', () => {
  it('pins the exact approved semantic catalog independent of the Supabase origin', async () => {
    const expectedDigest = '58e3b1621b74a930405878c68b47fff2bf7ebe28b91111f62087c326de814917'
    expect(EXPECTED_CATALOG_V1_SEMANTIC_SHA256).toBe(expectedDigest)
    expect(catalogV1SemanticSha256(catalogRows())).toBe(expectedDigest)

    const otherOriginRows = mapCatalogV1ManifestToRows(manifest, 'https://another-project.supabase.co')
    expect(catalogV1SemanticSha256(otherOriginRows)).toBe(expectedDigest)

    const changed = input()
    changed.rows[0] = { ...changed.rows[0], name_es: `${changed.rows[0].name_es} alterado` }
    await expect(runExerciseCatalogV1Remote(
      { mode: 'audit' },
      changed,
      dependencies([]),
    )).rejects.toThrow('catalog semantic SHA-256 does not match the approved V1')
  })

  it('builds deterministic poster and optional motion keys under exercise-media', () => {
    const manifest = {
      exercises: [{
        slug: 'sentadilla-trasera-barra',
        assets: {
          poster: '/exercises/catalog/v1/sentadilla-trasera-barra/poster.webp',
          posterSha256: '1'.repeat(64),
        },
        motion: {
          status: 'visual-approved',
          preview: '/exercises/catalog/v1/sentadilla-trasera-barra/motion-preview.webp',
          previewSha256: '2'.repeat(64),
          previewBytes: 123,
        },
      }],
    } as CatalogV1Manifest

    expect(buildCatalogV1AssetSpecs(manifest, 'D:\\repo', SUPABASE_URL)).toEqual([
      {
        slug: 'sentadilla-trasera-barra',
        kind: 'poster',
        objectKey: 'catalog/v1/sentadilla-trasera-barra/poster.webp',
        localPath: path.resolve('D:\\repo', 'public', 'exercises', 'catalog', 'v1', 'sentadilla-trasera-barra', 'poster.webp'),
        publicUrl: `${SUPABASE_URL}/storage/v1/object/public/exercise-media/catalog/v1/sentadilla-trasera-barra/poster.webp`,
        expectedSha256: '1'.repeat(64),
        contentType: 'image/webp',
      },
      {
        slug: 'sentadilla-trasera-barra',
        kind: 'motion',
        objectKey: 'catalog/v1/sentadilla-trasera-barra/motion-preview.webp',
        localPath: path.resolve('D:\\repo', 'public', 'exercises', 'catalog', 'v1', 'sentadilla-trasera-barra', 'motion-preview.webp'),
        publicUrl: `${SUPABASE_URL}/storage/v1/object/public/exercise-media/catalog/v1/sentadilla-trasera-barra/motion-preview.webp`,
        expectedSha256: '2'.repeat(64),
        expectedBytes: 123,
        contentType: 'image/webp',
      },
    ])
  })

  it('computes SHA-256 from bytes and refuses a local digest mismatch before upload', async () => {
    const events: string[] = []
    const assets = assetSpecs()
    assets[0] = { ...assets[0], expectedSha256: 'f'.repeat(64) }

    expect(sha256Bytes(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    await expect(runExerciseCatalogV1Remote(
      { mode: 'deploy', execute: true },
      input(assets),
      dependencies(events),
    )).rejects.toThrow('local asset checksum mismatch')
    expect(events.some(event => event.startsWith('remote:upload:'))).toBe(false)
    expect(events.some(event => event.startsWith('remote:rpc:'))).toBe(false)
  })

  it('refuses catalog URLs that do not match their deterministic Storage objects', async () => {
    const events: string[] = []
    const value = input()
    value.rows[0] = {
      ...value.rows[0],
      image_url: `${SUPABASE_URL}/storage/v1/object/public/exercise-media/wrong.webp`,
    }

    await expect(runExerciseCatalogV1Remote(
      { mode: 'deploy', execute: true },
      value,
      dependencies(events),
    )).rejects.toThrow('poster URL does not match')
    expect(events).toEqual([])
  })
})

describe('guarded exercise catalog V1 remote workflow', () => {
  it('verify rejects field or URL drift in an otherwise cardinality-correct remote catalog', async () => {
    const changedName = snapshot()
    changedName.catalogRows[0].name_es = 'Nombre remoto alterado'
    await expect(runExerciseCatalogV1Remote(
      { mode: 'verify' },
      input(),
      dependencies([], [changedName]),
    )).rejects.toThrow(/remote catalog row mismatch.*name_es/)

    const changedUrl = snapshot()
    changedUrl.catalogRows[0].image_url = `${SUPABASE_URL}/storage/v1/object/public/exercise-media/catalog/v1/wrong/poster.webp`
    await expect(runExerciseCatalogV1Remote(
      { mode: 'verify' },
      input(),
      dependencies([], [changedUrl]),
    )).rejects.toThrow(/remote catalog row mismatch.*image_url/)
  })

  it('keeps deploy without --execute immutable while still validating the audit and local hashes', async () => {
    const events: string[] = []

    const result = await runExerciseCatalogV1Remote(
      { mode: 'deploy', execute: false },
      input(),
      dependencies(events),
    )

    expect(result.mode).toBe('deploy-dry-run')
    expect(events.filter(event => event === 'remote:audit')).toHaveLength(1)
    expect(events.some(event => event.startsWith('remote:upload:'))).toBe(false)
    expect(events.some(event => event.startsWith('remote:rpc:'))).toBe(false)
    expect(events.some(event => event.startsWith('mkdir:'))).toBe(false)
    expect(events.filter(event => event.startsWith('read:'))).toHaveLength(53)
  })

  it('composes the reviewed manifest and real local assets without remote writes in CLI dry-run', async () => {
    const events: string[] = []
    const fake = dependencies(events)

    const result = await runExerciseCatalogV1RemoteCli(['deploy'], {
      cwd: process.cwd(),
      env: { NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL },
      remote: fake.remote,
      log: fake.log,
    })

    expect(result.mode).toBe('deploy-dry-run')
    expect(events.some(event => event.startsWith('remote:upload:'))).toBe(false)
    expect(events.some(event => event.startsWith('remote:rpc:'))).toBe(false)
  })

  it('writes the complete backup before uploads and completes every upload before the RPC', async () => {
    const events: string[] = []

    const result = await runExerciseCatalogV1Remote(
      { mode: 'deploy', execute: true },
      input(),
      dependencies(events),
    )

    const firstUpload = events.findIndex(event => event.startsWith('remote:upload:'))
    const rpc = events.findIndex(event => event.startsWith('remote:rpc:'))
    const backupWrites = ['catalog-rows.json', 'bucket-inventory.json', 'reference-counts.json', 'manifest.sha256']
      .map(name => events.findIndex(event => event === `write:${name}`))
    const uploadEvents = events.filter(event => event.startsWith('remote:upload:'))
    expect(backupWrites.every(index => index > -1 && index < firstUpload)).toBe(true)
    expect(uploadEvents).toHaveLength(53)
    expect(rpc).toBeGreaterThan(firstUpload)
    expect(events.slice(firstUpload, rpc).filter(event => event.startsWith('remote:upload:'))).toHaveLength(53)
    expect(result.backupDirectory).toContain(path.join('.artifacts', 'exercises', 'remote-cutover', '2026-09-07T23-12-34-567Z'))
    expect(result.cutover?.exercise_logs_remapped_count).toBe(3)
    expect(result.catalogSemanticSha256).toBe(EXPECTED_CATALOG_V1_SEMANTIC_SHA256)
    expect(events).toContain(
      'log:remapped: exercise_logs=3 workout_exercises=7 trainer_template_exercises=2',
    )
  })

  it('rejects incomplete, contradictory, or snapshot-inconsistent RPC counters', async () => {
    const incompleteEvents: string[] = []
    const incomplete = dependencies(incompleteEvents)
    incomplete.remote.replaceCatalog = async () => ({
      source: 'vekira-catalog-v1',
      input_count: 50,
      inserted_count: 0,
      updated_count: 50,
      hidden_count: 0,
      deleted_count: 0,
      public_v1_count: 50,
      public_legacy_count: 0,
      workout_exercises_remapped_count: 0,
      trainer_template_exercises_remapped_count: 0,
      catalog_semantic_sha256: EXPECTED_CATALOG_V1_SEMANTIC_SHA256,
    }) as never
    await expect(runExerciseCatalogV1Remote(
      { mode: 'deploy', execute: true },
      input(),
      incomplete,
    )).rejects.toThrow('cutover result exercise_logs_remapped_count must be a non-negative integer')

    const contradictory = dependencies([])
    contradictory.remote.replaceCatalog = async () => ({
      source: 'vekira-catalog-v1',
      input_count: 50,
      inserted_count: 1,
      updated_count: 50,
      hidden_count: 0,
      deleted_count: 0,
      public_v1_count: 50,
      public_legacy_count: 0,
      exercise_logs_remapped_count: 0,
      workout_exercises_remapped_count: 0,
      trainer_template_exercises_remapped_count: 0,
      catalog_semantic_sha256: EXPECTED_CATALOG_V1_SEMANTIC_SHA256,
    })
    await expect(runExerciseCatalogV1Remote(
      { mode: 'deploy', execute: true },
      input(),
      contradictory,
    )).rejects.toThrow('cutover inserted and updated counts must equal the input count')

    const inconsistent = dependencies([])
    inconsistent.remote.replaceCatalog = async () => ({
      source: 'vekira-catalog-v1',
      input_count: 50,
      inserted_count: 0,
      updated_count: 50,
      hidden_count: 1,
      deleted_count: 0,
      public_v1_count: 50,
      public_legacy_count: 0,
      exercise_logs_remapped_count: 0,
      workout_exercises_remapped_count: 0,
      trainer_template_exercises_remapped_count: 0,
      catalog_semantic_sha256: EXPECTED_CATALOG_V1_SEMANTIC_SHA256,
    })
    await expect(runExerciseCatalogV1Remote(
      { mode: 'deploy', execute: true },
      input(),
      inconsistent,
    )).rejects.toThrow('cutover hidden and deleted counts do not match the pre-cutover public catalog')
  })

  it('rejects an RPC result that is not bound to the approved semantic digest', async () => {
    const fake = dependencies([])
    fake.remote.replaceCatalog = async () => ({
      source: 'vekira-catalog-v1',
      input_count: 50,
      inserted_count: 0,
      updated_count: 50,
      hidden_count: 0,
      deleted_count: 0,
      public_v1_count: 50,
      public_legacy_count: 0,
      exercise_logs_remapped_count: 0,
      workout_exercises_remapped_count: 0,
      trainer_template_exercises_remapped_count: 0,
    }) as never

    await expect(runExerciseCatalogV1Remote(
      { mode: 'deploy', execute: true },
      input(),
      fake,
    )).rejects.toThrow('cutover result catalog_semantic_sha256 must match the approved V1')
  })

  it('rejects impossible remap counters and a post-cutover total that contradicts the RPC', async () => {
    const excessiveRemaps = dependencies([])
    excessiveRemaps.remote.replaceCatalog = async () => ({
      source: 'vekira-catalog-v1',
      input_count: 50,
      inserted_count: 0,
      updated_count: 50,
      hidden_count: 0,
      deleted_count: 0,
      public_v1_count: 50,
      public_legacy_count: 0,
      exercise_logs_remapped_count: 12,
      workout_exercises_remapped_count: 0,
      trainer_template_exercises_remapped_count: 0,
      catalog_semantic_sha256: EXPECTED_CATALOG_V1_SEMANTIC_SHA256,
    })
    await expect(runExerciseCatalogV1Remote(
      { mode: 'deploy', execute: true },
      input(),
      excessiveRemaps,
    )).rejects.toThrow('exercise_logs_remapped_count exceeds the pre-cutover reference count')

    const afterWithUnexpectedPrivateRow = snapshot()
    afterWithUnexpectedPrivateRow.catalogRows.push({
      ...afterWithUnexpectedPrivateRow.catalogRows[0],
      id: 'unexpected-private-row',
      source: 'legacy-source',
      external_id: 'unexpected-private-row',
      is_public: false,
    })
    await expect(runExerciseCatalogV1Remote(
      { mode: 'deploy', execute: true },
      input(),
      dependencies([], [snapshot(), afterWithUnexpectedPrivateRow]),
    )).rejects.toThrow('post-cutover catalog total is inconsistent')
  })

  it('rejects changed reference totals and a public catalog other than exactly 50 V1 rows', async () => {
    const events: string[] = []
    const after = snapshot({
      exercise_logs: 10,
      workout_exercises: 22,
      trainer_template_exercises: 33,
    })
    after.catalogRows[0].source = 'legacy-source'

    await expect(runExerciseCatalogV1Remote(
      { mode: 'deploy', execute: true },
      input(),
      dependencies(events, [snapshot(), after]),
    )).rejects.toThrow(/reference count changed|public V1 exercise count/)
  })

  it('sanitizes credentials, JWTs, connection strings, and URLs in diagnostics', async () => {
    const jwt = `eyJ${'a'.repeat(40)}.${'b'.repeat(40)}.${'c'.repeat(40)}`
    const message = `service-secret ${jwt} postgres://user:password@host/db https://project-ref.supabase.co/rest/v1`
    const sanitized = sanitizeRemoteDiagnostic(message, ['service-secret'])

    expect(sanitized).not.toContain('service-secret')
    expect(sanitized).not.toContain(jwt)
    expect(sanitized).not.toContain('password')
    expect(sanitized).not.toContain('project-ref')
    expect(sanitized).toContain('[REDACTED]')
  })
})

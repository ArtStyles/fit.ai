import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  EXERCISE_MEDIA_BUCKET,
  mapCatalogV1ManifestToRows,
  type CatalogV1ExerciseRow,
} from '../src/lib/exercises/catalogV1Rows'
import {
  buildCatalogV1AssetSpecs,
  parseExerciseCatalogV1RemoteCommand,
  runExerciseCatalogV1Remote,
  sanitizeRemoteDiagnostic,
  sha256Bytes,
  type CatalogV1AssetSpec,
  type CatalogV1CutoverResult,
  type CatalogV1RemoteDependencies,
  type CatalogV1RemoteSnapshot,
  type ExerciseCatalogV1RemoteResult,
  type RemoteAssetInspection,
  type RemoteCatalogBackupRow,
  type RemoteStorageObject,
} from '../src/lib/exercises/exerciseCatalogV1Remote'
import {
  validateCatalogV1Manifest,
  type CatalogV1Manifest,
} from '../src/lib/exercises/visualCatalogV1'
import type { Database, Json } from '../src/types/database'

const PAGE_SIZE = 1000
const PUBLIC_ASSET_TIMEOUT_MS = 30_000
const PROJECT_REF_PATTERN = /^[a-z0-9]{10,40}$/
const EXPECTED_PROJECT_REF_OPTION = '--expected-project-ref='
const REQUIRED_BACKUP_FILES = [
  'bucket-inventory.json',
  'catalog-rows.json',
  'manifest.sha256',
  'reference-counts.json',
] as const

export const BACKUP_INTEGRITY_FILE = 'backup-integrity.json'
export const BACKUP_COMPLETE_FILE = 'BACKUP_COMPLETE.json'

type CatalogReferenceTable =
  | 'exercise_logs'
  | 'workout_exercises'
  | 'trainer_template_exercises'

type CliEnvironment = Record<string, string | undefined>

export type ExerciseCatalogV1RemoteCliOverrides = {
  cwd?: string
  env?: CliEnvironment
  now?: () => Date
  remote?: CatalogV1RemoteDependencies['remote']
  log?: (message: string) => void
}

function storageMetadataSha256(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const record = metadata as Record<string, unknown>
  if (typeof record.sha256 === 'string') return record.sha256
  for (const key of ['metadata', 'user_metadata', 'userMetadata']) {
    const nested = record[key]
    if (
      nested
      && typeof nested === 'object'
      && typeof (nested as Record<string, unknown>).sha256 === 'string'
    ) {
      return (nested as Record<string, string>).sha256
    }
  }
  return null
}

function storageMetadataSize(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.size === 'number') return record.size
  const metadata = record.metadata
  if (metadata && typeof metadata === 'object') {
    const size = (metadata as Record<string, unknown>).size
    if (typeof size === 'number') return size
  }
  return null
}

function isMissingBucketError(error: { message: string; statusCode?: string }): boolean {
  const status = (error as { status?: number }).status
  const message = error.message.toLowerCase()
  return status === 404
    || error.statusCode === '404'
    || message.includes('bucket not found')
    || message.includes('bucket does not exist')
}

async function readAllCatalogRows(
  client: SupabaseClient<Database>,
): Promise<RemoteCatalogBackupRow[]> {
  const rows: RemoteCatalogBackupRow[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from('exercises')
      .select('*')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`catalog read failed: ${error.message}`)
    const page = (data ?? []) as RemoteCatalogBackupRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

async function readReferenceCount(
  client: SupabaseClient<Database>,
  table: CatalogReferenceTable,
): Promise<number> {
  const { count, error } = await client
    .from(table)
    .select('id', { count: 'exact', head: true })
  if (error) throw new Error(`${table} count failed: ${error.message}`)
  if (count === null) throw new Error(`${table} count was unavailable`)
  return count
}

export async function readStorageInventory(
  client: SupabaseClient<Database>,
): Promise<RemoteStorageObject[]> {
  const { data: bucketMetadata, error: bucketError } = await client.storage.getBucket(
    EXERCISE_MEDIA_BUCKET,
  )
  if (bucketError) {
    if (isMissingBucketError(bucketError)) {
      return [{
        name: '$bucket',
        size: null,
        sha256: null,
        updatedAt: null,
        kind: 'bucket',
        bucket: { id: EXERCISE_MEDIA_BUCKET, missing: true },
      } as RemoteStorageObject]
    }
    throw new Error(`storage bucket metadata failed: ${bucketError.message}`)
  }

  const bucket = client.storage.from(EXERCISE_MEDIA_BUCKET)
  const objects: RemoteStorageObject[] = []

  async function visit(prefix: string): Promise<void> {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await bucket.list(prefix, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) {
        if (prefix === '' && isMissingBucketError(error)) return
        throw new Error(`storage inventory failed: ${error.message}`)
      }
      const page = data ?? []
      for (const object of page) {
        const objectKey = prefix ? `${prefix}/${object.name}` : object.name
        if (object.id === null) {
          await visit(objectKey)
          continue
        }
        objects.push({
          name: objectKey,
          size: storageMetadataSize(object),
          sha256: storageMetadataSha256(object.metadata),
          updatedAt: object.updated_at,
          kind: 'object',
          id: object.id,
          createdAt: object.created_at,
          lastAccessedAt: object.last_accessed_at,
          metadata: object.metadata,
        } as RemoteStorageObject)
      }
      if (page.length < PAGE_SIZE) break
    }
  }

  await visit('')
  return [
    {
      name: '$bucket',
      size: null,
      sha256: null,
      updatedAt: bucketMetadata.updated_at ?? null,
      kind: 'bucket',
      bucket: bucketMetadata,
    } as RemoteStorageObject,
    ...objects.sort((left, right) => left.name.localeCompare(right.name)),
  ]
}

async function inspectStoredAsset(
  client: SupabaseClient<Database>,
  asset: CatalogV1AssetSpec,
): Promise<RemoteAssetInspection> {
  const { data, error } = await client.storage
    .from(EXERCISE_MEDIA_BUCKET)
    .info(asset.objectKey)
  if (error) throw new Error(`storage info failed: ${error.message}`)
  const size = storageMetadataSize(data)
  if (size === null) throw new Error('storage info did not include an object size')
  return {
    size,
    sha256: storageMetadataSha256(data.metadata),
  }
}

function createSupabaseRemoteGateway(
  client: SupabaseClient<Database>,
  now: () => Date,
): CatalogV1RemoteDependencies['remote'] {
  return {
    async readSnapshot(): Promise<CatalogV1RemoteSnapshot> {
      const [catalogRows, storageObjects, exerciseLogs, workoutExercises, templateExercises] = await Promise.all([
        readAllCatalogRows(client),
        readStorageInventory(client),
        readReferenceCount(client, 'exercise_logs'),
        readReferenceCount(client, 'workout_exercises'),
        readReferenceCount(client, 'trainer_template_exercises'),
      ])
      return {
        capturedAt: now().toISOString(),
        catalogRows,
        storageObjects,
        referenceCounts: {
          exercise_logs: exerciseLogs,
          workout_exercises: workoutExercises,
          trainer_template_exercises: templateExercises,
        },
      }
    },

    async uploadAsset(asset, bytes): Promise<RemoteAssetInspection> {
      const { error } = await client.storage
        .from(EXERCISE_MEDIA_BUCKET)
        .upload(asset.objectKey, bytes, {
          cacheControl: '31536000',
          contentType: asset.contentType,
          upsert: true,
          metadata: { sha256: asset.expectedSha256 },
        })
      if (error) throw new Error(`storage upload failed: ${error.message}`)
      return inspectStoredAsset(client, asset)
    },

    inspectAsset(asset): Promise<RemoteAssetInspection> {
      return inspectStoredAsset(client, asset)
    },

    async probePublicUrl(asset): Promise<void> {
      const response = await fetch(asset.publicUrl, {
        headers: { Range: 'bytes=0-0' },
        signal: AbortSignal.timeout(PUBLIC_ASSET_TIMEOUT_MS),
      })
      if (!response.ok) throw new Error(`public asset returned HTTP ${response.status}`)
      await response.body?.cancel()
    },

    async replaceCatalog(rows: CatalogV1ExerciseRow[]): Promise<CatalogV1CutoverResult> {
      const { data, error } = await client.rpc('replace_exercise_catalog_v1', {
        p_exercises: rows as unknown as Json,
      })
      if (error) throw new Error(`replace_exercise_catalog_v1 failed: ${error.message}`)
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('replace_exercise_catalog_v1 returned an invalid result')
      }
      return data as CatalogV1CutoverResult
    },
  }
}

type BackupIntegrity = {
  formatVersion: 1
  algorithm: 'sha256'
  files: Record<string, { bytes: number; sha256: string }>
}

type BackupCompletion = {
  formatVersion: 1
  integrityFile: typeof BACKUP_INTEGRITY_FILE
  integritySha256: string
  requiredFileCount: number
}

function parseJsonRecord(value: string, label: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error(`${label} is not valid JSON`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`)
  }
  return parsed as Record<string, unknown>
}

async function verifyIntegrityFile(directory: string): Promise<string> {
  const integrityPath = path.join(directory, BACKUP_INTEGRITY_FILE)
  const integrityBytes = await readFile(integrityPath)
  const integrityValue = parseJsonRecord(integrityBytes.toString('utf8'), BACKUP_INTEGRITY_FILE)
  if (integrityValue.formatVersion !== 1 || integrityValue.algorithm !== 'sha256') {
    throw new Error('backup integrity format is invalid')
  }
  const files = integrityValue.files
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    throw new Error('backup integrity file list is invalid')
  }
  const fileNames = Object.keys(files).sort()
  if (JSON.stringify(fileNames) !== JSON.stringify([...REQUIRED_BACKUP_FILES])) {
    throw new Error('backup integrity file list is incomplete')
  }

  for (const fileName of REQUIRED_BACKUP_FILES) {
    const expected = (files as Record<string, unknown>)[fileName]
    if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
      throw new Error(`backup integrity entry is invalid: ${fileName}`)
    }
    const expectedRecord = expected as Record<string, unknown>
    const bytes = await readFile(path.join(directory, fileName))
    if (
      expectedRecord.bytes !== bytes.byteLength
      || expectedRecord.sha256 !== sha256Bytes(bytes)
    ) {
      throw new Error(`backup digest mismatch: ${fileName}`)
    }
  }
  return sha256Bytes(integrityBytes)
}

export async function verifyCompletedBackup(directory: string): Promise<void> {
  const completionBytes = await readFile(path.join(directory, BACKUP_COMPLETE_FILE))
  const completion = parseJsonRecord(completionBytes.toString('utf8'), BACKUP_COMPLETE_FILE)
  if (
    completion.formatVersion !== 1
    || completion.integrityFile !== BACKUP_INTEGRITY_FILE
    || completion.requiredFileCount !== REQUIRED_BACKUP_FILES.length
  ) {
    throw new Error('backup completion marker is invalid')
  }
  const integritySha256 = await verifyIntegrityFile(directory)
  if (completion.integritySha256 !== integritySha256) {
    throw new Error('backup completion integrity digest mismatch')
  }
}

async function finalizeBackup(directory: string): Promise<void> {
  const files: BackupIntegrity['files'] = {}
  for (const fileName of REQUIRED_BACKUP_FILES) {
    const bytes = await readFile(path.join(directory, fileName))
    files[fileName] = {
      bytes: bytes.byteLength,
      sha256: sha256Bytes(bytes),
    }
  }
  const integrity: BackupIntegrity = {
    formatVersion: 1,
    algorithm: 'sha256',
    files,
  }
  const integrityPath = path.join(directory, BACKUP_INTEGRITY_FILE)
  await writeFile(integrityPath, `${JSON.stringify(integrity, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  })

  const integritySha256 = await verifyIntegrityFile(directory)
  const completion: BackupCompletion = {
    formatVersion: 1,
    integrityFile: BACKUP_INTEGRITY_FILE,
    integritySha256,
    requiredFileCount: REQUIRED_BACKUP_FILES.length,
  }
  await writeFile(path.join(directory, BACKUP_COMPLETE_FILE), `${JSON.stringify(completion, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  })
  await verifyCompletedBackup(directory)
}

export function createVerifyingBackupFileSystemDependencies(): CatalogV1RemoteDependencies['fileSystem'] {
  return {
    async readFile(filePath) {
      return readFile(filePath)
    },
    async mkdir(directory) {
      await mkdir(directory, { recursive: true })
    },
    async writeFile(filePath, contents) {
      await writeFile(filePath, contents, { encoding: 'utf8', flag: 'wx' })
      if (path.basename(filePath) === 'manifest.sha256') {
        await finalizeBackup(path.dirname(filePath))
      }
    },
  }
}

function parseCliTargetConfirmation(args: readonly string[]): {
  commandArgs: string[]
  expectedProjectRef: string | null
} {
  const confirmations = args.filter(argument => argument.startsWith(EXPECTED_PROJECT_REF_OPTION))
  if (confirmations.length > 1) {
    throw new Error('--expected-project-ref may be provided only once')
  }
  const expectedProjectRef = confirmations[0]?.slice(EXPECTED_PROJECT_REF_OPTION.length) ?? null
  if (expectedProjectRef !== null && !PROJECT_REF_PATTERN.test(expectedProjectRef)) {
    throw new Error('--expected-project-ref must be a valid Supabase project ref')
  }
  return {
    commandArgs: args.filter(argument => !argument.startsWith(EXPECTED_PROJECT_REF_OPTION)),
    expectedProjectRef,
  }
}

function assertExpectedSupabaseProject(
  supabaseUrl: string,
  expectedProjectRef: string | null,
  execute: boolean,
): void {
  if (!execute) {
    if (expectedProjectRef !== null) {
      throw new Error('--expected-project-ref is only valid with deploy --execute')
    }
    return
  }
  if (expectedProjectRef === null) {
    throw new Error('deploy --execute requires explicit --expected-project-ref=<project-ref>')
  }

  let url: URL
  try {
    url = new URL(supabaseUrl)
  } catch {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not a valid URL')
  }
  const expectedHostname = `${expectedProjectRef}.supabase.co`
  if (
    url.protocol !== 'https:'
    || url.username !== ''
    || url.password !== ''
    || url.port !== ''
    || url.hostname !== expectedHostname
  ) {
    throw new Error('--expected-project-ref does not match NEXT_PUBLIC_SUPABASE_URL hostname')
  }
}

export async function runExerciseCatalogV1RemoteCli(
  args = process.argv.slice(2),
  overrides: ExerciseCatalogV1RemoteCliOverrides = {},
): Promise<ExerciseCatalogV1RemoteResult> {
  const targetConfirmation = parseCliTargetConfirmation(args)
  const command = parseExerciseCatalogV1RemoteCommand(targetConfirmation.commandArgs)
  const cwd = overrides.cwd ?? process.cwd()
  const env = overrides.env ?? process.env
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  assertExpectedSupabaseProject(
    supabaseUrl,
    targetConfirmation.expectedProjectRef,
    command.mode === 'deploy' && command.execute,
  )

  const manifestPath = path.resolve(
    cwd,
    'public',
    'exercises',
    'catalog',
    'v1',
    'manifest.json',
  )
  const manifestBytes = await readFile(manifestPath)
  const manifestValue: unknown = JSON.parse(manifestBytes.toString('utf8'))
  const manifestErrors = validateCatalogV1Manifest(manifestValue)
  if (manifestErrors.length > 0) {
    throw new Error(`invalid catalog V1 manifest:\n${manifestErrors.join('\n')}`)
  }
  const manifest = manifestValue as CatalogV1Manifest
  const now = overrides.now ?? (() => new Date())

  let remote = overrides.remote
  const secrets: string[] = []
  if (!remote) {
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
    secrets.push(serviceRoleKey)
    const client = createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    remote = createSupabaseRemoteGateway(client, now)
  }

  return runExerciseCatalogV1Remote(command, {
    rows: mapCatalogV1ManifestToRows(manifest, supabaseUrl),
    assets: buildCatalogV1AssetSpecs(manifest, cwd, supabaseUrl),
    manifestSha256: sha256Bytes(manifestBytes),
  }, {
    cwd,
    now,
    secrets,
    fileSystem: createVerifyingBackupFileSystemDependencies(),
    remote,
    log: overrides.log ?? console.log,
  })
}

const executedPath = process.argv[1]
if (executedPath && import.meta.url === pathToFileURL(executedPath).href) {
  void runExerciseCatalogV1RemoteCli().catch(error => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Exercise catalog V1 remote command failed: ${sanitizeRemoteDiagnostic(message, [
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    ])}`)
    process.exitCode = 1
  })
}

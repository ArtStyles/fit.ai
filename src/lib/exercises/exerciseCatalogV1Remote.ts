import { createHash } from 'node:crypto'
import path from 'node:path'
import {
  EXERCISE_CATALOG_V1_SOURCE,
  catalogV1MotionObjectKey,
  catalogV1PosterObjectKey,
  exerciseMediaPublicUrl,
  type CatalogV1ExerciseRow,
} from './catalogV1Rows'
import type { CatalogV1Manifest } from './visualCatalogV1'
import type { Database } from '@/types/database'

const SHA256 = /^[a-f0-9]{64}$/
const EXPECTED_PUBLIC_V1_COUNT = 50
export const EXPECTED_CATALOG_V1_SEMANTIC_SHA256 = '58e3b1621b74a930405878c68b47fff2bf7ebe28b91111f62087c326de814917'

const PERSISTED_CATALOG_FIELDS = [
  'wger_id',
  'name',
  'name_es',
  'description',
  'description_es',
  'muscle_groups',
  'equipment',
  'equipment_es',
  'muscle_groups_es',
  'difficulty',
  'exercise_type',
  'is_compound',
  'instructions',
  'instructions_es',
  'video_url',
  'image_url',
  'motion_preview_url',
  'is_public',
  'source',
  'external_id',
  'movement_patterns',
  'cardio_modality',
  'impact_level',
  'joint_stress_tags',
] as const satisfies readonly (keyof Database['public']['Tables']['exercises']['Row'])[]

export type ExerciseCatalogV1RemoteCommand =
  | { mode: 'audit' }
  | { mode: 'backup' }
  | { mode: 'verify' }
  | { mode: 'deploy'; execute: boolean }

export type CatalogV1AssetSpec = {
  slug: string
  kind: 'poster' | 'motion'
  objectKey: string
  localPath: string
  publicUrl: string
  expectedSha256: string
  expectedBytes?: number
  contentType: 'image/webp'
}

export type ExerciseReferenceCounts = {
  exercise_logs: number
  workout_exercises: number
  trainer_template_exercises: number
}

export type RemoteCatalogBackupRow = Database['public']['Tables']['exercises']['Row'] & {
  [key: string]: unknown
}

export type RemoteStorageObject = {
  name: string
  size: number | null
  sha256: string | null
  updatedAt: string | null
}

export type CatalogV1RemoteSnapshot = {
  capturedAt: string
  catalogRows: RemoteCatalogBackupRow[]
  storageObjects: RemoteStorageObject[]
  referenceCounts: ExerciseReferenceCounts
}

export type CatalogV1CutoverResult = {
  source: string
  input_count: number
  inserted_count: number
  updated_count: number
  hidden_count: number
  deleted_count: number
  public_v1_count: number
  public_legacy_count: number
  exercise_logs_remapped_count: number
  workout_exercises_remapped_count: number
  trainer_template_exercises_remapped_count: number
  catalog_semantic_sha256: string
}

export type RemoteAssetInspection = {
  size: number
  sha256: string | null
}

export type ExerciseCatalogV1RemoteInput = {
  rows: CatalogV1ExerciseRow[]
  assets: CatalogV1AssetSpec[]
  manifestSha256: string
}

export type CatalogV1RemoteDependencies = {
  cwd: string
  now: () => Date
  secrets?: string[]
  fileSystem: {
    readFile(filePath: string): Promise<Uint8Array>
    mkdir(directory: string): Promise<void>
    writeFile(filePath: string, contents: string): Promise<void>
  }
  remote: {
    readSnapshot(): Promise<CatalogV1RemoteSnapshot>
    uploadAsset(asset: CatalogV1AssetSpec, bytes: Uint8Array): Promise<RemoteAssetInspection>
    inspectAsset(asset: CatalogV1AssetSpec): Promise<RemoteAssetInspection>
    probePublicUrl(asset: CatalogV1AssetSpec): Promise<void>
    replaceCatalog(rows: CatalogV1ExerciseRow[]): Promise<CatalogV1CutoverResult>
  }
  log(message: string): void
}

export type ExerciseCatalogV1RemoteResult = {
  mode: 'audit' | 'backup' | 'verify' | 'deploy-dry-run' | 'deploy'
  catalogSemanticSha256: string
  before: CatalogV1RemoteSnapshot
  after?: CatalogV1RemoteSnapshot
  backupDirectory?: string
  cutover?: CatalogV1CutoverResult
}

export function parseExerciseCatalogV1RemoteCommand(
  args: readonly string[],
): ExerciseCatalogV1RemoteCommand {
  const mode = args[0] ?? 'audit'
  const rest = args.slice(1)

  if (!['audit', 'backup', 'verify', 'deploy'].includes(mode)) {
    throw new Error('mode must be one of: audit, backup, verify, deploy')
  }
  if (rest.some(argument => argument !== '--execute')) {
    throw new Error(`unknown argument for ${mode}`)
  }
  if (mode !== 'deploy' && rest.length > 0) {
    throw new Error('--execute is only valid with deploy')
  }
  if (rest.filter(argument => argument === '--execute').length > 1) {
    throw new Error('--execute may be provided only once')
  }
  if (mode === 'deploy') return { mode, execute: rest.includes('--execute') }
  if (mode === 'backup') return { mode }
  if (mode === 'verify') return { mode }
  return { mode: 'audit' }
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function normalizedMediaPath(value: string | null): string | null {
  return value === null ? null : new URL(value).pathname
}

/**
 * Hashes the complete reviewed RPC payload as a stable array-of-arrays.
 * Media origins are intentionally removed because the Supabase project URL is
 * deployment-specific; the deterministic Storage path remains part of the identity.
 */
export function catalogV1SemanticSha256(rows: readonly CatalogV1ExerciseRow[]): string {
  const semanticRows = [...rows]
    .sort((left, right) => left.external_id < right.external_id
      ? -1
      : left.external_id > right.external_id ? 1 : 0)
    .map(row => [
      row.wger_id,
      row.name,
      row.name_es,
      row.description,
      row.description_es,
      row.muscle_groups,
      row.equipment,
      row.equipment_es,
      row.muscle_groups_es,
      row.difficulty,
      row.exercise_type,
      row.is_compound,
      row.instructions,
      row.instructions_es,
      row.video_url,
      normalizedMediaPath(row.image_url),
      normalizedMediaPath(row.motion_preview_url),
      row.is_public,
      row.source,
      row.external_id,
      row.movement_patterns,
      row.cardio_modality,
      row.impact_level,
      row.joint_stress_tags,
      row.legacy_source,
      row.legacy_external_id,
    ])
  return createHash('sha256').update(JSON.stringify(semanticRows), 'utf8').digest('hex')
}

export function sanitizeRemoteDiagnostic(message: string, secrets: readonly string[] = []): string {
  let sanitized = message
  for (const secret of [...secrets].filter(Boolean).sort((left, right) => right.length - left.length)) {
    sanitized = sanitized.split(secret).join('[REDACTED]')
  }
  return sanitized
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[REDACTED]')
    .replace(/(?:postgres(?:ql)?):\/\/[^\s]+/gi, '[REDACTED]')
    .replace(/https?:\/\/[^\s]+/gi, '[REDACTED]')
}

function publicAssetPathToLocal(cwd: string, assetPath: string): string {
  const relative = assetPath.replace(/^\/+/, '')
  const localPath = path.resolve(cwd, 'public', relative)
  const publicRoot = path.resolve(cwd, 'public')
  const fromPublic = path.relative(publicRoot, localPath)
  if (fromPublic === '..' || fromPublic.startsWith(`..${path.sep}`) || path.isAbsolute(fromPublic)) {
    throw new Error('catalog asset must remain inside public')
  }
  return localPath
}

export function buildCatalogV1AssetSpecs(
  manifest: CatalogV1Manifest,
  cwd: string,
  supabaseUrl: string,
): CatalogV1AssetSpec[] {
  const assets: CatalogV1AssetSpec[] = []
  for (const entry of manifest.exercises) {
    const posterSha256 = entry.assets.posterSha256
    if (!posterSha256 || !SHA256.test(posterSha256)) {
      throw new Error(`valid poster SHA-256 is required: ${entry.slug}`)
    }
    const posterKey = catalogV1PosterObjectKey(entry.slug)
    assets.push({
      slug: entry.slug,
      kind: 'poster',
      objectKey: posterKey,
      localPath: publicAssetPathToLocal(cwd, entry.assets.poster),
      publicUrl: exerciseMediaPublicUrl(supabaseUrl, posterKey),
      expectedSha256: posterSha256,
      contentType: 'image/webp',
    })

    if (entry.motion?.status === 'visual-approved') {
      const motionKey = catalogV1MotionObjectKey(entry.slug)
      assets.push({
        slug: entry.slug,
        kind: 'motion',
        objectKey: motionKey,
        localPath: publicAssetPathToLocal(cwd, entry.motion.preview),
        publicUrl: exerciseMediaPublicUrl(supabaseUrl, motionKey),
        expectedSha256: entry.motion.previewSha256,
        expectedBytes: entry.motion.previewBytes,
        contentType: 'image/webp',
      })
    }
  }
  return assets
}

function assertCatalogInput(input: ExerciseCatalogV1RemoteInput): void {
  if (!SHA256.test(input.manifestSha256)) throw new Error('manifest SHA-256 is invalid')
  if (input.rows.length !== EXPECTED_PUBLIC_V1_COUNT) {
    throw new Error(`catalog payload must contain exactly ${EXPECTED_PUBLIC_V1_COUNT} rows`)
  }

  const externalIds = new Set<string>()
  for (const row of input.rows) {
    if (row.source !== EXERCISE_CATALOG_V1_SOURCE || row.is_public !== true) {
      throw new Error('catalog payload rows must be public V1 rows')
    }
    if (!row.external_id || externalIds.has(row.external_id)) {
      throw new Error('catalog payload external IDs must be unique and non-empty')
    }
    externalIds.add(row.external_id)
  }

  const posterAssets = input.assets.filter(asset => asset.kind === 'poster')
  const posterSlugs = new Set(posterAssets.map(asset => asset.slug))
  if (
    posterAssets.length !== EXPECTED_PUBLIC_V1_COUNT
    || posterSlugs.size !== EXPECTED_PUBLIC_V1_COUNT
    || Array.from(externalIds).some(slug => !posterSlugs.has(slug))
  ) {
    throw new Error('every catalog row must have exactly one poster asset')
  }

  const assetsBySlugAndKind = new Map(
    input.assets.map(asset => [`${asset.slug}:${asset.kind}`, asset] as const),
  )
  for (const row of input.rows) {
    const poster = assetsBySlugAndKind.get(`${row.external_id}:poster`)
    if (
      !poster
      || poster.objectKey !== catalogV1PosterObjectKey(row.external_id)
      || row.image_url !== poster.publicUrl
    ) {
      throw new Error(`poster URL does not match deterministic Storage object: ${row.external_id}`)
    }

    const motion = assetsBySlugAndKind.get(`${row.external_id}:motion`)
    if (row.motion_preview_url === null) {
      if (motion) throw new Error(`unexpected motion asset: ${row.external_id}`)
    } else if (
      !motion
      || motion.objectKey !== catalogV1MotionObjectKey(row.external_id)
      || row.motion_preview_url !== motion.publicUrl
    ) {
      throw new Error(`motion URL does not match deterministic Storage object: ${row.external_id}`)
    }
  }

  const objectKeys = new Set<string>()
  for (const asset of input.assets) {
    if (!SHA256.test(asset.expectedSha256)) throw new Error(`invalid asset SHA-256: ${asset.slug}`)
    if (objectKeys.has(asset.objectKey)) throw new Error(`duplicate asset object key: ${asset.objectKey}`)
    objectKeys.add(asset.objectKey)
  }

  const semanticSha256 = catalogV1SemanticSha256(input.rows)
  if (semanticSha256 !== EXPECTED_CATALOG_V1_SEMANTIC_SHA256) {
    throw new Error(
      `catalog semantic SHA-256 does not match the approved V1: ${semanticSha256}`,
    )
  }
}

async function readVerifiedAssets(
  input: ExerciseCatalogV1RemoteInput,
  dependencies: CatalogV1RemoteDependencies,
): Promise<Array<{ asset: CatalogV1AssetSpec; bytes: Uint8Array }>> {
  const values: Array<{ asset: CatalogV1AssetSpec; bytes: Uint8Array }> = []
  for (const asset of input.assets) {
    const bytes = await dependencies.fileSystem.readFile(asset.localPath)
    if (sha256Bytes(bytes) !== asset.expectedSha256) {
      throw new Error(`local asset checksum mismatch: ${asset.slug}/${asset.kind}`)
    }
    if (asset.expectedBytes !== undefined && bytes.byteLength !== asset.expectedBytes) {
      throw new Error(`local asset size mismatch: ${asset.slug}/${asset.kind}`)
    }
    values.push({ asset, bytes })
  }
  return values
}

function summarize(snapshot: CatalogV1RemoteSnapshot): {
  total: number
  publicV1: number
  publicOther: number
} {
  let publicV1 = 0
  let publicOther = 0
  for (const row of snapshot.catalogRows) {
    if (!row.is_public) continue
    if (row.source === EXERCISE_CATALOG_V1_SOURCE) publicV1 += 1
    else publicOther += 1
  }
  return { total: snapshot.catalogRows.length, publicV1, publicOther }
}

function logAudit(
  label: string,
  snapshot: CatalogV1RemoteSnapshot,
  log: (message: string) => void,
): void {
  const catalog = summarize(snapshot)
  const refs = snapshot.referenceCounts
  log(`${label}: total=${catalog.total} public-v1=${catalog.publicV1} public-other=${catalog.publicOther} refs=${refs.exercise_logs}/${refs.workout_exercises}/${refs.trainer_template_exercises}`)
}

function timestampDirectoryName(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-')
}

async function writeBackup(
  snapshot: CatalogV1RemoteSnapshot,
  manifestSha256: string,
  dependencies: CatalogV1RemoteDependencies,
): Promise<string> {
  const artifactsRoot = path.resolve(
    dependencies.cwd,
    '.artifacts',
    'exercises',
    'remote-cutover',
  )
  const directory = path.resolve(artifactsRoot, timestampDirectoryName(dependencies.now()))
  const relative = path.relative(artifactsRoot, directory)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('backup directory escaped the remote-cutover artifacts root')
  }

  await dependencies.fileSystem.mkdir(directory)
  const writeJson = (name: string, value: unknown) => dependencies.fileSystem.writeFile(
    path.join(directory, name),
    `${JSON.stringify(value, null, 2)}\n`,
  )
  await writeJson('catalog-rows.json', snapshot.catalogRows)
  await writeJson('bucket-inventory.json', snapshot.storageObjects)
  await writeJson('reference-counts.json', snapshot.referenceCounts)
  await dependencies.fileSystem.writeFile(
    path.join(directory, 'manifest.sha256'),
    `${manifestSha256}\n`,
  )
  return directory
}

function assertReferenceCountsUnchanged(
  before: ExerciseReferenceCounts,
  after: ExerciseReferenceCounts,
): void {
  for (const table of [
    'exercise_logs',
    'workout_exercises',
    'trainer_template_exercises',
  ] as const) {
    if (before[table] !== after[table]) {
      throw new Error(`reference count changed for ${table}: ${before[table]} -> ${after[table]}`)
    }
  }
}

function assertPublicCatalog(snapshot: CatalogV1RemoteSnapshot): void {
  const catalog = summarize(snapshot)
  if (catalog.publicV1 !== EXPECTED_PUBLIC_V1_COUNT) {
    throw new Error(`public V1 exercise count must be ${EXPECTED_PUBLIC_V1_COUNT}; got ${catalog.publicV1}`)
  }
  if (catalog.publicOther !== 0) {
    throw new Error(`public non-V1 exercise count must be 0; got ${catalog.publicOther}`)
  }
}

function serializedField(value: unknown): string | undefined {
  return JSON.stringify(value)
}

function assertExactPublicCatalog(
  snapshot: CatalogV1RemoteSnapshot,
  expectedRows: readonly CatalogV1ExerciseRow[],
): void {
  assertPublicCatalog(snapshot)
  const remoteRows = snapshot.catalogRows.filter(
    row => row.is_public && row.source === EXERCISE_CATALOG_V1_SOURCE,
  )
  const remoteByExternalId = new Map(remoteRows.map(row => [row.external_id, row]))

  for (const expected of expectedRows) {
    const remote = remoteByExternalId.get(expected.external_id)
    if (!remote) {
      throw new Error(`remote catalog is missing approved row: ${expected.external_id}`)
    }
    for (const field of PERSISTED_CATALOG_FIELDS) {
      if (serializedField(remote[field]) !== serializedField(expected[field])) {
        throw new Error(`remote catalog row mismatch for ${expected.external_id}: ${field}`)
      }
    }
    remoteByExternalId.delete(expected.external_id)
  }

  if (remoteByExternalId.size > 0) {
    throw new Error(`remote catalog contains an unexpected V1 row: ${remoteByExternalId.keys().next().value}`)
  }
}

function assertCutoverResult(
  result: CatalogV1CutoverResult,
  before: CatalogV1RemoteSnapshot,
  expectedRows: readonly CatalogV1ExerciseRow[],
  semanticSha256: string,
): void {
  const countFields = [
    'input_count',
    'inserted_count',
    'updated_count',
    'hidden_count',
    'deleted_count',
    'public_v1_count',
    'public_legacy_count',
    'exercise_logs_remapped_count',
    'workout_exercises_remapped_count',
    'trainer_template_exercises_remapped_count',
  ] as const
  for (const field of countFields) {
    const value = result[field]
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`cutover result ${field} must be a non-negative integer`)
    }
  }
  if (
    result.source !== EXERCISE_CATALOG_V1_SOURCE
    || result.input_count !== EXPECTED_PUBLIC_V1_COUNT
    || result.public_v1_count !== EXPECTED_PUBLIC_V1_COUNT
    || result.public_legacy_count !== 0
  ) {
    throw new Error('cutover RPC returned invalid public catalog counts')
  }
  if (result.catalog_semantic_sha256 !== semanticSha256) {
    throw new Error('cutover result catalog_semantic_sha256 must match the approved V1')
  }
  if (result.inserted_count + result.updated_count !== result.input_count) {
    throw new Error('cutover inserted and updated counts must equal the input count')
  }

  const expectedExternalIds = new Set(expectedRows.map(row => row.external_id))
  const expectedUpdated = before.catalogRows.filter(
    row => row.source === EXERCISE_CATALOG_V1_SOURCE
      && row.external_id !== null
      && expectedExternalIds.has(row.external_id as CatalogV1ExerciseRow['external_id']),
  ).length
  if (
    result.updated_count !== expectedUpdated
    || result.inserted_count !== expectedRows.length - expectedUpdated
  ) {
    throw new Error('cutover inserted and updated counts do not match the pre-cutover identities')
  }

  const publicOtherBefore = summarize(before).publicOther
  if (result.hidden_count + result.deleted_count !== publicOtherBefore) {
    throw new Error('cutover hidden and deleted counts do not match the pre-cutover public catalog')
  }

  for (const [field, table] of [
    ['exercise_logs_remapped_count', 'exercise_logs'],
    ['workout_exercises_remapped_count', 'workout_exercises'],
    ['trainer_template_exercises_remapped_count', 'trainer_template_exercises'],
  ] as const) {
    if (result[field] > before.referenceCounts[table]) {
      throw new Error(`cutover result ${field} exceeds the pre-cutover reference count`)
    }
  }
}

function assertCutoverSnapshotInvariant(
  before: CatalogV1RemoteSnapshot,
  after: CatalogV1RemoteSnapshot,
  result: CatalogV1CutoverResult,
): void {
  const expectedAfterTotal = before.catalogRows.length + result.inserted_count - result.deleted_count
  if (after.catalogRows.length !== expectedAfterTotal) {
    throw new Error(
      `post-cutover catalog total is inconsistent: expected ${expectedAfterTotal}, got ${after.catalogRows.length}`,
    )
  }
}

function assertAssetInspection(
  asset: CatalogV1AssetSpec,
  expectedSize: number,
  inspection: RemoteAssetInspection,
): void {
  if (inspection.size !== expectedSize) {
    throw new Error(`remote asset size mismatch: ${asset.slug}/${asset.kind}`)
  }
  if (inspection.sha256 !== asset.expectedSha256) {
    throw new Error(`remote asset checksum metadata mismatch: ${asset.slug}/${asset.kind}`)
  }
}

async function safeRemote<T>(
  label: string,
  dependencies: CatalogV1RemoteDependencies,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${label}: ${sanitizeRemoteDiagnostic(message, dependencies.secrets)}`)
  }
}

async function verifyRemoteAssets(
  assets: readonly CatalogV1AssetSpec[],
  sizes: ReadonlyMap<string, number>,
  dependencies: CatalogV1RemoteDependencies,
): Promise<void> {
  for (const asset of assets) {
    const expectedSize = sizes.get(asset.objectKey) ?? asset.expectedBytes
    if (expectedSize === undefined) {
      throw new Error(`expected asset size is unavailable: ${asset.slug}/${asset.kind}`)
    }
    const inspection = await safeRemote(
      `inspect ${asset.slug}/${asset.kind}`,
      dependencies,
      () => dependencies.remote.inspectAsset(asset),
    )
    assertAssetInspection(asset, expectedSize, inspection)
    await safeRemote(
      `probe ${asset.slug}/${asset.kind}`,
      dependencies,
      () => dependencies.remote.probePublicUrl(asset),
    )
  }
}

export async function runExerciseCatalogV1Remote(
  command: ExerciseCatalogV1RemoteCommand,
  input: ExerciseCatalogV1RemoteInput,
  dependencies: CatalogV1RemoteDependencies,
): Promise<ExerciseCatalogV1RemoteResult> {
  assertCatalogInput(input)
  const catalogSemanticSha256 = catalogV1SemanticSha256(input.rows)
  const before = await safeRemote('remote audit', dependencies, () => dependencies.remote.readSnapshot())
  logAudit('audit', before, dependencies.log)

  if (command.mode === 'audit') return { mode: 'audit', catalogSemanticSha256, before }

  if (command.mode === 'backup') {
    const backupDirectory = await writeBackup(before, input.manifestSha256, dependencies)
    dependencies.log(`backup: ${backupDirectory}`)
    return { mode: 'backup', catalogSemanticSha256, before, backupDirectory }
  }

  if (command.mode === 'verify') {
    assertExactPublicCatalog(before, input.rows)
    const verified = await readVerifiedAssets(input, dependencies)
    const sizes = new Map(verified.map(item => [item.asset.objectKey, item.bytes.byteLength]))
    await verifyRemoteAssets(input.assets, sizes, dependencies)
    dependencies.log('verify: catalog and assets passed')
    return { mode: 'verify', catalogSemanticSha256, before }
  }

  const verified = await readVerifiedAssets(input, dependencies)
  if (!command.execute) {
    dependencies.log(`deploy dry-run: ${input.rows.length} rows and ${input.assets.length} assets validated; no writes`)
    return { mode: 'deploy-dry-run', catalogSemanticSha256, before }
  }

  const backupDirectory = await writeBackup(before, input.manifestSha256, dependencies)
  dependencies.log(`backup: ${backupDirectory}`)

  const assetSizes = new Map<string, number>()
  for (const { asset, bytes } of verified) {
    const uploaded = await safeRemote(
      `upload ${asset.slug}/${asset.kind}`,
      dependencies,
      () => dependencies.remote.uploadAsset(asset, bytes),
    )
    assertAssetInspection(asset, bytes.byteLength, uploaded)
    const inspection = await safeRemote(
      `inspect ${asset.slug}/${asset.kind}`,
      dependencies,
      () => dependencies.remote.inspectAsset(asset),
    )
    assertAssetInspection(asset, bytes.byteLength, inspection)
    assetSizes.set(asset.objectKey, bytes.byteLength)
  }

  const cutover = await safeRemote(
    'catalog cutover RPC',
    dependencies,
    () => dependencies.remote.replaceCatalog(input.rows),
  )
  assertCutoverResult(cutover, before, input.rows, catalogSemanticSha256)

  const after = await safeRemote('post-cutover audit', dependencies, () => dependencies.remote.readSnapshot())
  assertReferenceCountsUnchanged(before.referenceCounts, after.referenceCounts)
  assertExactPublicCatalog(after, input.rows)
  assertCutoverSnapshotInvariant(before, after, cutover)
  await verifyRemoteAssets(input.assets, assetSizes, dependencies)
  logAudit('verify', after, dependencies.log)
  dependencies.log(`deploy: inserted=${cutover.inserted_count} updated=${cutover.updated_count} hidden=${cutover.hidden_count} deleted=${cutover.deleted_count}`)
  if (
    cutover.exercise_logs_remapped_count !== undefined
    || cutover.workout_exercises_remapped_count !== undefined
    || cutover.trainer_template_exercises_remapped_count !== undefined
  ) {
    dependencies.log(
      `remapped: exercise_logs=${cutover.exercise_logs_remapped_count ?? 0} workout_exercises=${cutover.workout_exercises_remapped_count ?? 0} trainer_template_exercises=${cutover.trainer_template_exercises_remapped_count ?? 0}`,
    )
  }

  return { mode: 'deploy', catalogSemanticSha256, before, after, backupDirectory, cutover }
}

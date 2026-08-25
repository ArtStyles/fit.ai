import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  validateCatalogV1Manifest,
  type CatalogV1ExerciseEntry,
  type CatalogV1ExerciseSlug,
  type CatalogV1Manifest,
} from '../src/lib/exercises/visualCatalogV1'

const SOURCE_BUCKET = 'exercise-visual-sources'
const SHA256 = /^[a-f0-9]{64}$/

type ArchiveBucket = {
  upload(
    path: string,
    body: Uint8Array,
    options: { contentType: 'image/png'; upsert: false },
  ): Promise<{ error: { message: string; statusCode?: string } | null }>
  download(path: string): Promise<{ data: Blob | null; error: { message: string } | null }>
}

export type ArchiveSourceInput = {
  slug: CatalogV1ExerciseSlug
  expectedSha256: string
  sourcePath: string
  bucket: ArchiveBucket
}

type ArchiveApprovedSourcesInput = {
  entries: CatalogV1ExerciseEntry[]
  artifactsRoot: string
  upload: boolean
  createBucket?: () => ArchiveBucket | Promise<ArchiveBucket>
  log?: (message: string) => void
}

export function buildSourceObjectKey(slug: CatalogV1ExerciseSlug, sha256: string): string {
  if (!SHA256.test(sha256)) throw new Error(`invalid source digest: ${slug}`)
  return `v1/${slug}/${sha256}.png`
}

export async function sha256File(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex')
}

async function assertLocalDigest(
  slug: CatalogV1ExerciseSlug,
  sourcePath: string,
  expectedSha256: string,
): Promise<void> {
  if (!SHA256.test(expectedSha256) || await sha256File(sourcePath) !== expectedSha256) {
    throw new Error(`source digest mismatch: ${slug}`)
  }
}

function isConflict(error: { message: string; statusCode?: string }): boolean {
  const status = (error as { status?: number }).status
  return error.statusCode === '409' || status === 409
}

export async function archiveSource(
  input: ArchiveSourceInput,
): Promise<'uploaded' | 'verified-existing'> {
  await assertLocalDigest(input.slug, input.sourcePath, input.expectedSha256)
  const objectKey = buildSourceObjectKey(input.slug, input.expectedSha256)
  const bytes = await readFile(input.sourcePath)
  const { error } = await input.bucket.upload(objectKey, bytes, {
    contentType: 'image/png',
    upsert: false,
  })

  if (!error) return 'uploaded'
  if (!isConflict(error)) throw new Error(`source upload failed: ${input.slug}: ${error.message}`)

  const existing = await input.bucket.download(objectKey)
  if (existing.error) throw new Error(`existing source download failed: ${input.slug}: ${existing.error.message}`)
  if (!existing.data) throw new Error(`existing source download was empty: ${input.slug}`)
  const existingDigest = createHash('sha256')
    .update(new Uint8Array(await existing.data.arrayBuffer()))
    .digest('hex')
  if (existingDigest !== input.expectedSha256) {
    throw new Error(`existing source digest mismatch: ${input.slug}`)
  }
  return 'verified-existing'
}

export async function archiveApprovedSources(input: ArchiveApprovedSourcesInput): Promise<string[]> {
  const log = input.log ?? console.log
  const plans: Array<{
    slug: CatalogV1ExerciseSlug
    expectedSha256: string
    sourcePath: string
    objectKey: string
  }> = []

  for (const entry of input.entries) {
    if (entry.status === 'draft') continue
    const expectedSha256 = entry.assets.sourceSha256
    if (!expectedSha256) throw new Error(`missing source digest: ${entry.slug}`)
    const objectKey = buildSourceObjectKey(entry.slug, expectedSha256)
    if (entry.assets.sourceObjectKey !== objectKey) {
      throw new Error(`source object key mismatch: ${entry.slug}`)
    }
    const sourcePath = path.resolve(input.artifactsRoot, entry.slug, 'source.png')
    await assertLocalDigest(entry.slug, sourcePath, expectedSha256)
    plans.push({ slug: entry.slug, expectedSha256, sourcePath, objectKey })
  }

  if (!input.upload) {
    for (const plan of plans) log(`[dry-run] ${plan.objectKey}`)
    return plans.map(plan => plan.objectKey)
  }
  if (!input.createBucket) throw new Error('remote bucket factory is required with --upload')

  const bucket = await input.createBucket()
  for (const plan of plans) {
    const result = await archiveSource({
      slug: plan.slug,
      expectedSha256: plan.expectedSha256,
      sourcePath: plan.sourcePath,
      bucket,
    })
    log(`[${result}] ${plan.objectKey}`)
  }
  return plans.map(plan => plan.objectKey)
}

async function createServiceRoleBucket(): Promise<ArchiveBucket> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required with --upload')
  }

  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return client.storage.from(SOURCE_BUCKET) as unknown as ArchiveBucket
}

export async function runArchiveCli(): Promise<string[]> {
  const root = process.cwd()
  const manifestPath = path.resolve(root, 'public', 'exercises', 'catalog', 'v1', 'manifest.json')
  const manifestValue: unknown = JSON.parse(await readFile(manifestPath, 'utf8'))
  const manifestErrors = validateCatalogV1Manifest(manifestValue)
  if (manifestErrors.length > 0) {
    throw new Error(`invalid catalog V1 manifest:\n${manifestErrors.join('\n')}`)
  }

  const upload = process.argv.includes('--upload')
  return archiveApprovedSources({
    entries: (manifestValue as CatalogV1Manifest).exercises,
    artifactsRoot: path.resolve(root, '.artifacts', 'exercises', 'catalog-v1'),
    upload,
    createBucket: upload ? createServiceRoleBucket : undefined,
  })
}

const executedPath = process.argv[1]
if (executedPath && import.meta.url === pathToFileURL(executedPath).href) {
  void runArchiveCli().catch(error => {
    console.error(`Source archive failed: ${(error as Error).message}`)
    process.exitCode = 1
  })
}

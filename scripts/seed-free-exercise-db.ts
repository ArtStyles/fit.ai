/**
 * Reemplaza el catálogo de ejercicios con free-exercise-db.
 *
 * Prerequisitos:
 *   1. Ejecutar supabase/migrations/014_exercise_source_columns.sql.
 *   2. SUPABASE_SERVICE_ROLE_KEY en .env.local (bypassa RLS).
 *
 * Correr (BORRA los datos de entrenamiento de prueba):
 *   pnpm seed:exercises          # exige el flag --reset
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  DATASET_URL,
  imageUrlFromPath,
  toExerciseInsert,
  type FreeExercise,
} from '../src/lib/exercises/freeExerciseDb'
import { storageObjectKey } from '../src/lib/exercises/imageStorage'
import type { Database } from '../src/types/database'

const IMAGE_BUCKET = 'exercise-images'
const INSERT_BATCH = 200
const MAX_RETRIES = 3

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SeedSupabase = SupabaseClient<any, any, any>
type ExerciseInsert = Database['public']['Tables']['exercises']['Insert']

// Orden de borrado respetando las FKs (hijos primero). exercises queda libre de
// referencias RESTRICT tras vaciar exercise_logs y workout_exercises.
const RESET_ORDER = [
  'exercise_logs',
  'workout_exercises',
  'progress_logs',
  'workouts',
  'workout_plans',
  'exercises',
] as const

const ALL_ZERO_UUID = '00000000-0000-0000-0000-000000000000'

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let attempt = 0
  while (attempt < MAX_RETRIES) {
    try {
      return await fn()
    } catch (err) {
      attempt++
      if (attempt >= MAX_RETRIES) throw err
      const backoff = 1000 * 2 ** attempt
      console.warn(`  ↩  ${label} failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${backoff}ms…`)
      await sleep(backoff)
    }
  }
  throw new Error(`${label} failed after ${MAX_RETRIES} attempts`)
}

async function resetTrainingData(supabase: SeedSupabase): Promise<void> {
  for (const table of RESET_ORDER) {
    const { error } = await supabase.from(table).delete().neq('id', ALL_ZERO_UUID)
    if (error) throw new Error(`reset ${table}: ${error.message}`)
    console.log(`  cleared ${table}`)
  }
}

async function listExistingImageKeys(supabase: SeedSupabase): Promise<Set<string>> {
  const keys = new Set<string>()
  const PAGE = 1000
  let offset = 0
  let hasMore = true
  while (hasMore) {
    const { data, error } = await supabase.storage.from(IMAGE_BUCKET).list('', { limit: PAGE, offset })
    if (error) throw new Error(`storage.list: ${error.message}`)
    const batch = data ?? []
    for (const obj of batch) keys.add(obj.name)
    hasMore = batch.length === PAGE
    offset += PAGE
  }
  return keys
}

async function rehostImage(
  supabase: SeedSupabase,
  externalId: string,
  sourceUrl: string,
  existingKeys: Set<string>,
): Promise<string> {
  const key = storageObjectKey(externalId, sourceUrl)
  if (!existingKeys.has(key)) {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`download ${res.status}`)
    const bytes = Buffer.from(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') ?? 'image/jpeg'
    const { error } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(key, bytes, { contentType, upsert: false })
    if (error) {
      const errStatus = error as { status?: number; statusCode?: string }
      const alreadyExists =
        errStatus.status === 409 ||
        errStatus.statusCode === '409' ||
        error.message.toLowerCase().includes('already exists')
      if (!alreadyExists) throw new Error(`upload: ${error.message}`)
    }
    existingKeys.add(key)
  }
  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(key).data.publicUrl
}

async function main() {
  if (!process.argv.includes('--reset')) {
    console.error('Refusing to run without --reset (this WIPES training data). Pass --reset.')
    process.exit(1)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  const supabase = createClient(supabaseUrl, serviceKey)

  console.log('🌱  free-exercise-db → Supabase catalog reseed')
  console.log('─'.repeat(50))

  console.log('Downloading dataset…')
  const res = await withRetry(() => fetch(DATASET_URL, { signal: AbortSignal.timeout(60_000) }), 'dataset')
  if (!res.ok) throw new Error(`dataset download ${res.status}`)
  const dataset = (await res.json()) as FreeExercise[]
  if (!Array.isArray(dataset) || dataset.length === 0) {
    throw new Error('dataset is empty or not an array')
  }
  console.log(`  exercises in dataset: ${dataset.length}`)

  console.log('Resetting training data (DESTRUCTIVE)…')
  await resetTrainingData(supabase)

  console.log('Listing existing images in storage…')
  const existingKeys = await listExistingImageKeys(supabase)
  console.log(`  already in bucket: ${existingKeys.size}`)

  let inserted = 0
  let withImage = 0
  const errors: string[] = []
  let batch: ExerciseInsert[] = []

  async function flush() {
    if (batch.length === 0) return
    const { error } = await supabase.from('exercises').insert(batch)
    if (error) {
      errors.push(`insert batch: ${error.message}`)
      console.error(`  ✗  insert error: ${error.message}`)
    } else {
      inserted += batch.length
    }
    batch = []
  }

  for (const ex of dataset) {
    const record: ExerciseInsert = { ...toExerciseInsert(ex) }

    const imagePath = ex.images?.[0]
    if (imagePath) {
      const url = imageUrlFromPath(imagePath)
      try {
        record.image_url = await withRetry(
          () => rehostImage(supabase, ex.id, url, existingKeys),
          `image ${ex.id}`,
        )
        withImage++
      } catch (err) {
        errors.push(`image ${ex.id}: ${(err as Error).message}`)
        record.image_url = null
      }
    }

    batch.push(record)
    if (batch.length >= INSERT_BATCH) await flush()
  }
  await flush()

  console.log('─'.repeat(50))
  console.log(`✅  Done`)
  console.log(`   Inserted   : ${inserted}/${dataset.length}`)
  console.log(`   With image : ${withImage}`)
  console.log('   Next step  : pnpm translate:exercises:es')
  if (errors.length) {
    console.log(`   Errors     : ${errors.length}`)
    errors.slice(0, 20).forEach(e => console.log(`     • ${e}`))
    if (errors.length > 20) console.log(`     … and ${errors.length - 20} more`)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

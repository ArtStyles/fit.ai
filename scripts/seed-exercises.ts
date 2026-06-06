/**
 * Syncs exercises from wger.de into Supabase.
 *
 * Prerequisites:
 *   1. Run supabase/migrations/002_wger_columns.sql in Supabase dashboard.
 *   2. Set SUPABASE_SERVICE_ROLE_KEY in .env.local (bypasses RLS).
 *
 * Run:
 *   pnpm seed:exercises
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  fetchExercises,
  fetchMuscles,
  fetchEquipment,
  WGER_LANGUAGE,
  type WgerMuscle,
  type WgerEquipment,
} from '../src/lib/wger/client'
import { storageObjectKey } from '../src/lib/wger/imageStorage'
import type { Database } from '../src/types/database'

const IMAGE_BUCKET = 'exercise-images'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SeedSupabase = SupabaseClient<any, any, any>

/** Lista todas las claves ya presentes en el bucket (para no re-subir en cada corrida). */
async function listExistingImageKeys(supabase: SeedSupabase): Promise<Set<string>> {
  const keys = new Set<string>()
  const PAGE = 1000
  let offset = 0
  while (true) {
    const { data, error } = await supabase.storage.from(IMAGE_BUCKET).list('', { limit: PAGE, offset })
    if (error) throw new Error(`storage.list: ${error.message}`)
    if (!data || data.length === 0) break
    for (const obj of data) keys.add(obj.name)
    if (data.length < PAGE) break
    offset += PAGE
  }
  return keys
}

/** Descarga la imagen de wger (si no está ya) y devuelve la URL pública de Supabase Storage. */
async function rehostImage(
  supabase: SeedSupabase,
  wgerId: number,
  sourceUrl: string,
  existingKeys: Set<string>,
): Promise<string> {
  const key = storageObjectKey(wgerId, sourceUrl)

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
      if (!alreadyExists) {
        throw new Error(`upload: ${error.message}`)
      }
    }
    existingKeys.add(key)
  }

  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(key).data.publicUrl
}

// Local alias for readability; used to type-check toUpsert records
type ExerciseInsert = Database['public']['Tables']['exercises']['Insert']

// ─── Config ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100
const DELAY_BETWEEN_PAGES_MS = 600   // ~1.5 req/s, well under wger's limit
const MIN_NAME_LENGTH = 3
const MIN_DESCRIPTION_LENGTH = 20
const MAX_RETRIES = 3

// wger category names → our exercise_type
const CATEGORY_TYPE_MAP: Record<string, Database['public']['Tables']['exercises']['Row']['exercise_type']> = {
  'Cardio': 'cardio',
  'Stretching': 'flexibility',
  // everything else maps to 'strength' via the fallback below
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function muscleNames(muscles: WgerMuscle[]): string[] {
  return muscles
    .map(m => (m.name_en ?? m.name).trim())
    .filter(Boolean)
}

function equipmentNames(equipment: WgerEquipment[]): string[] {
  return equipment.map(e => e.name.trim()).filter(Boolean)
}

function deriveExerciseType(
  categoryName: string,
): Database['public']['Tables']['exercises']['Row']['exercise_type'] {
  return CATEGORY_TYPE_MAP[categoryName] ?? 'strength'
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Validate env
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  // Untyped client for the upsert call — supabase-js v2.45 generic resolution
  // doesn't play well with our hand-crafted Database type in a Node script.
  // Type safety is enforced via ExerciseInsert on the records array itself.
  const supabase = createClient(supabaseUrl, serviceKey)

  console.log('🌱  wger → Supabase exercise sync')
  console.log('─'.repeat(50))

  // 1. Pre-fetch reference data (muscles, equipment)
  console.log('Fetching wger reference data…')
  const [_muscles, _equipment] = await Promise.all([
    withRetry(fetchMuscles, 'fetchMuscles'),
    withRetry(fetchEquipment, 'fetchEquipment'),
  ])
  console.log(`  muscles: ${_muscles.length}, equipment: ${_equipment.length}`)

  // 2. First page → get total count
  console.log('Fetching first page…')
  const firstPage = await withRetry(
    () => fetchExercises('en', PAGE_SIZE, 0),
    'fetchExercises page 0',
  )
  console.log(`  Total exercises in wger: ${firstPage.count}`)
  console.log('─'.repeat(50))

  let processed = 0
  let upserted = 0
  let skipped = 0
  const errors: string[] = []

  console.log('Listing existing images in storage…')
  const existingImageKeys = await listExistingImageKeys(supabase)
  console.log(`  already in bucket: ${existingImageKeys.size}`)

  let page = firstPage
  let offset = 0

  while (page.results.length > 0) {
    const toUpsert: ExerciseInsert[] = []

    for (const ex of page.results) {
      processed++

      // Find English translation
      const enTranslation = ex.translations.find(t => t.language === WGER_LANGUAGE.en)
      if (!enTranslation) { skipped++; continue }

      const name = enTranslation.name.trim()
      if (name.length < MIN_NAME_LENGTH) { skipped++; continue }

      const description = stripHtml(enTranslation.description)
      if (description.length < MIN_DESCRIPTION_LENGTH) { skipped++; continue }

      // Main image (prefer is_main=true, fall back to first image)
      const mainImage =
        ex.images.find(img => img.is_main) ?? ex.images[0] ?? null
      let imageUrl: string | null = null
      if (mainImage?.image) {
        const sourceImage = mainImage.image
        try {
          imageUrl = await withRetry(
            () => rehostImage(supabase, ex.id, sourceImage, existingImageKeys),
            `image ${ex.id}`,
          )
        } catch (err) {
          errors.push(`image ${ex.id}: ${(err as Error).message}`)
          imageUrl = null
        }
      }

      // Muscle groups (primary + secondary combined for is_compound check)
      const primaryMuscles = muscleNames(ex.muscles)
      const secondaryMuscles = muscleNames(ex.muscles_secondary)
      const allMuscles = Array.from(new Set([...primaryMuscles, ...secondaryMuscles]))

      toUpsert.push({
        wger_id: ex.id,
        name,
        description,
        muscle_groups: allMuscles,
        equipment: equipmentNames(ex.equipment),
        exercise_type: deriveExerciseType(ex.category.name),
        is_compound: allMuscles.length > 1,
        image_url: imageUrl,
        is_public: true,
        // difficulty: wger doesn't provide this → left null
        // instructions: same content as description in wger → left null
      })
    }

    // Batch upsert for this page
    if (toUpsert.length > 0) {
      const { error } = await supabase
        .from('exercises')
        .upsert(toUpsert, { onConflict: 'wger_id', ignoreDuplicates: false })

      if (error) {
        errors.push(`offset ${offset}: ${error.message}`)
        console.error(`  ✗  Upsert error at offset ${offset}:`, error.message)
      } else {
        upserted += toUpsert.length
      }
    }

    const total = firstPage.count
    const pct = Math.round((processed / total) * 100)
    console.log(
      `  [${pct.toString().padStart(3)}%] ${processed}/${total} processed` +
      `  +${toUpsert.length} upserted  skip ${page.results.length - toUpsert.length}`,
    )

    if (!page.next) break

    offset += PAGE_SIZE
    await sleep(DELAY_BETWEEN_PAGES_MS)
    page = await withRetry(
      () => fetchExercises('en', PAGE_SIZE, offset),
      `fetchExercises offset=${offset}`,
    )
  }

  console.log('─'.repeat(50))
  console.log(`✅  Done`)
  console.log(`   Processed : ${processed}`)
  console.log(`   Upserted  : ${upserted}`)
  console.log(`   Skipped   : ${skipped}`)
  if (errors.length) {
    console.log(`   Errors    : ${errors.length}`)
    errors.forEach(e => console.log(`     • ${e}`))
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})

# Migración del catálogo a free-exercise-db Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el catálogo de ejercicios (sourced de wger, ~26% con imagen) por free-exercise-db (~800 ejercicios de dominio público, casi todos con imagen), reseteando los datos de prueba y reutilizando el pipeline de imágenes existente.

**Architecture:** Una migración añade `source`/`external_id` a `exercises`. Funciones puras mapean el formato de free-exercise-db a nuestras columnas (testeadas con vitest). Un nuevo script de seed descarga el dataset (un solo JSON), resetea las tablas de entrenamiento en orden de FK, inserta los ejercicios y re-aloja la primera imagen de cada uno en el bucket `exercise-images`. Se actualiza el vocabulario de equipo del generador IA y se retira el código de wger. La UI no cambia.

**Tech Stack:** Next.js 14, Supabase (Postgres + Storage), TypeScript, tsx (scripts), vitest (entorno node). Gestor: **pnpm** (Windows PowerShell).

**Spec:** `docs/superpowers/specs/2026-06-06-catalogo-free-exercise-db-design.md`

**Dataset:** `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json` (array de objetos `{ id, name, force, level, mechanic, equipment, primaryMuscles[], secondaryMuscles[], instructions[], category, images[] }`). Imágenes: `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/` + `images[i]` (p. ej. `"3_4_Sit-Up/0.jpg"`).

---

## Requisito previo (manual, en Supabase)

La migración `supabase/migrations/014_exercise_source_columns.sql` (Task 1) debe ejecutarse en el SQL Editor antes de correr el seed. El reset + seed (`pnpm seed:exercises`) lo corre el dueño con `SUPABASE_SERVICE_ROLE_KEY` en `.env.local` (Task 7).

---

## File Structure

**Crear:**
- `supabase/migrations/014_exercise_source_columns.sql` — `source`/`external_id` + índice único parcial.
- `src/lib/exercises/imageStorage.ts` — helpers de Storage genéricos (`extensionFromUrl`, `storageObjectKey(id: string, url)`).
- `src/lib/exercises/__tests__/imageStorage.test.ts` — tests.
- `src/lib/exercises/freeExerciseDb.ts` — tipo del registro + mapeadores puros + constantes de URL.
- `src/lib/exercises/__tests__/freeExerciseDb.test.ts` — tests de los mapeadores.
- `scripts/seed-free-exercise-db.ts` — seed nuevo (reset + fetch + insert + re-host de imágenes).

**Modificar:**
- `src/types/database.ts` — `source`/`external_id` en `exercises` Row/Insert/Update.
- `src/lib/ai/filter.ts` — vocabulario de equipo de free-exercise-db.
- `package.json` — `seed:exercises` apunta al nuevo script con `--reset`.

**Eliminar (retiro de wger):**
- `scripts/seed-exercises.ts`
- `src/lib/wger/client.ts`
- `src/lib/wger/imageStorage.ts`
- `src/lib/wger/__tests__/imageStorage.test.ts`

---

## Task 1: Migración de esquema + tipos

**Files:**
- Create: `supabase/migrations/014_exercise_source_columns.sql`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Crear la migración**

Crear `supabase/migrations/014_exercise_source_columns.sql`:

```sql
-- 014_exercise_source_columns.sql
-- Origen del catálogo: permite dedup por (source, external_id) para datasets como
-- free-exercise-db cuyos ids son strings (wger_id es entero y queda sin uso nuevo).

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS source      TEXT,
  ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_source_external
  ON exercises (source, external_id)
  WHERE source IS NOT NULL AND external_id IS NOT NULL;
```

- [ ] **Step 2: Añadir los campos al tipo `exercises` en `src/types/database.ts`**

En el `Row` (busca el bloque que empieza con `wger_id: number | null`), FIND:

```ts
          is_public: boolean
          created_at: string
        }
        Insert: {
```

REPLACE WITH:

```ts
          is_public: boolean
          source: string | null
          external_id: string | null
          created_at: string
        }
        Insert: {
```

Luego en el `Insert`, FIND:

```ts
          video_url?: string | null
          image_url?: string | null
          is_public?: boolean
        }
        Update: {
```

REPLACE WITH:

```ts
          video_url?: string | null
          image_url?: string | null
          is_public?: boolean
          source?: string | null
          external_id?: string | null
        }
        Update: {
```

Luego en el `Update`, FIND:

```ts
          video_url?: string | null
          image_url?: string | null
          is_public?: boolean
        }
        Relationships: []
```

REPLACE WITH:

```ts
          video_url?: string | null
          image_url?: string | null
          is_public?: boolean
          source?: string | null
          external_id?: string | null
        }
        Relationships: []
```

- [ ] **Step 3: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "supabase/migrations/014_exercise_source_columns.sql" "src/types/database.ts"
git commit -m "feat(exercises): add source/external_id columns for catalog provenance"
```

> ⚠️ Ejecutar `014_exercise_source_columns.sql` en el SQL Editor de Supabase.

---

## Task 2: Helpers de Storage genéricos (TDD)

**Files:**
- Create: `src/lib/exercises/imageStorage.ts`
- Test: `src/lib/exercises/__tests__/imageStorage.test.ts`

> Es la versión genérica del helper que vivía en `src/lib/wger/` (clave por `id` string en vez de `wger_id` numérico). El archivo de wger se elimina en la Task 6 (mientras tanto el seed de wger sigue compilando con el suyo).

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/exercises/__tests__/imageStorage.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extensionFromUrl, storageObjectKey } from '../imageStorage'

describe('extensionFromUrl', () => {
  it('extracts a lowercase extension from the path', () => {
    expect(extensionFromUrl('https://raw.githubusercontent.com/x/exercises/A/0.jpg')).toBe('jpg')
    expect(extensionFromUrl('https://x/y.PNG?token=abc')).toBe('png')
  })

  it('defaults to jpg when there is no extension', () => {
    expect(extensionFromUrl('https://x/y/noext')).toBe('jpg')
    expect(extensionFromUrl('not a url')).toBe('jpg')
  })
})

describe('storageObjectKey', () => {
  it('builds {id}.{ext} from a string id', () => {
    expect(storageObjectKey('3_4_Sit-Up', 'https://x/exercises/3_4_Sit-Up/0.jpg')).toBe('3_4_Sit-Up.jpg')
    expect(storageObjectKey('Foo', 'https://x/y/a')).toBe('Foo.jpg')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `pnpm test -- src/lib/exercises/__tests__/imageStorage`
Expected: FAIL (no se resuelve `../imageStorage`).

- [ ] **Step 3: Implementar**

Crear `src/lib/exercises/imageStorage.ts`:

```ts
/** Extensión (sin punto) derivada de la URL de una imagen; 'jpg' por defecto. */
export function extensionFromUrl(url: string): string {
  let pathname = url
  try {
    pathname = new URL(url).pathname
  } catch {
    pathname = url.split('?')[0]
  }
  const match = pathname.match(/\.([a-zA-Z0-9]+)$/)
  return match ? match[1].toLowerCase() : 'jpg'
}

/** Clave del objeto en Storage para la imagen de un ejercicio, p. ej. "3_4_Sit-Up.jpg". */
export function storageObjectKey(id: string, sourceUrl: string): string {
  return `${id}.${extensionFromUrl(sourceUrl)}`
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `pnpm test -- src/lib/exercises/__tests__/imageStorage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/lib/exercises/imageStorage.ts" "src/lib/exercises/__tests__/imageStorage.test.ts"
git commit -m "feat(exercises): generic image storage helpers keyed by string id"
```

---

## Task 3: Mapeadores puros de free-exercise-db (TDD)

**Files:**
- Create: `src/lib/exercises/freeExerciseDb.ts`
- Test: `src/lib/exercises/__tests__/freeExerciseDb.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/exercises/__tests__/freeExerciseDb.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  mapDifficulty,
  mapExerciseType,
  mapEquipment,
  isCompound,
  joinInstructions,
  muscleGroups,
  imageUrlFromPath,
  toExerciseInsert,
  type FreeExercise,
} from '../freeExerciseDb'

describe('mapDifficulty', () => {
  it('maps levels, sending expert to advanced', () => {
    expect(mapDifficulty('beginner')).toBe('beginner')
    expect(mapDifficulty('intermediate')).toBe('intermediate')
    expect(mapDifficulty('expert')).toBe('advanced')
    expect(mapDifficulty('whatever')).toBeNull()
  })
})

describe('mapExerciseType', () => {
  it('maps categories to our types', () => {
    expect(mapExerciseType('strength')).toBe('strength')
    expect(mapExerciseType('powerlifting')).toBe('strength')
    expect(mapExerciseType('strongman')).toBe('strength')
    expect(mapExerciseType('olympic weightlifting')).toBe('strength')
    expect(mapExerciseType('stretching')).toBe('flexibility')
    expect(mapExerciseType('cardio')).toBe('cardio')
    expect(mapExerciseType('plyometrics')).toBe('hiit')
  })
})

describe('mapEquipment', () => {
  it('wraps a real equipment string into an array', () => {
    expect(mapEquipment('dumbbell')).toEqual(['dumbbell'])
  })
  it('treats body only / empty / null as no equipment', () => {
    expect(mapEquipment('body only')).toEqual([])
    expect(mapEquipment('')).toEqual([])
    expect(mapEquipment(null)).toEqual([])
  })
})

describe('isCompound', () => {
  it('is true only for compound mechanic', () => {
    expect(isCompound('compound')).toBe(true)
    expect(isCompound('isolation')).toBe(false)
    expect(isCompound(null)).toBe(false)
  })
})

describe('joinInstructions', () => {
  it('joins non-empty trimmed steps with newlines', () => {
    expect(joinInstructions(['Step 1', 'Step 2'])).toBe('Step 1\nStep 2')
    expect(joinInstructions(['  ', ' x '])).toBe('x')
    expect(joinInstructions([])).toBeNull()
  })
})

describe('muscleGroups', () => {
  it('merges primary + secondary, deduped and trimmed', () => {
    expect(muscleGroups(['biceps'], ['forearms', 'biceps'])).toEqual(['biceps', 'forearms'])
    expect(muscleGroups([], [])).toEqual([])
  })
})

describe('imageUrlFromPath', () => {
  it('builds the full raw GitHub URL', () => {
    expect(imageUrlFromPath('3_4_Sit-Up/0.jpg')).toBe(
      'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/3_4_Sit-Up/0.jpg',
    )
  })
})

describe('toExerciseInsert', () => {
  it('maps a full record to our insert shape (without image_url)', () => {
    const ex: FreeExercise = {
      id: '3_4_Sit-Up',
      name: '3/4 Sit-Up',
      force: 'pull',
      level: 'beginner',
      mechanic: 'compound',
      equipment: 'body only',
      primaryMuscles: ['abdominals'],
      secondaryMuscles: [],
      instructions: ['Lie down.', 'Sit up.'],
      category: 'strength',
      images: ['3_4_Sit-Up/0.jpg', '3_4_Sit-Up/1.jpg'],
    }
    expect(toExerciseInsert(ex)).toEqual({
      name: '3/4 Sit-Up',
      description: null,
      muscle_groups: ['abdominals'],
      equipment: [],
      difficulty: 'beginner',
      exercise_type: 'strength',
      is_compound: true,
      instructions: 'Lie down.\nSit up.',
      is_public: true,
      source: 'free-exercise-db',
      external_id: '3_4_Sit-Up',
    })
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `pnpm test -- freeExerciseDb`
Expected: FAIL (no se resuelve `../freeExerciseDb`).

- [ ] **Step 3: Implementar**

Crear `src/lib/exercises/freeExerciseDb.ts`:

```ts
/**
 * free-exercise-db (yuhonas/free-exercise-db) — tipo del registro del dataset
 * y mapeadores puros a nuestras columnas de `exercises`.
 */

export const DATASET_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'

const IMAGE_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'

export interface FreeExercise {
  id: string
  name: string
  force: string | null
  level: string
  mechanic: string | null
  equipment: string | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
  instructions: string[]
  category: string
  images: string[]
}

type Difficulty = 'beginner' | 'intermediate' | 'advanced'
type ExerciseType = 'strength' | 'cardio' | 'flexibility' | 'balance' | 'hiit'

export interface ExerciseInsertData {
  name: string
  description: null
  muscle_groups: string[]
  equipment: string[]
  difficulty: Difficulty | null
  exercise_type: ExerciseType
  is_compound: boolean
  instructions: string | null
  is_public: true
  source: 'free-exercise-db'
  external_id: string
}

/** level → difficulty (expert pasa a advanced; desconocido → null). */
export function mapDifficulty(level: string): Difficulty | null {
  if (level === 'beginner' || level === 'intermediate') return level
  if (level === 'expert') return 'advanced'
  return null
}

/** category → exercise_type. */
export function mapExerciseType(category: string): ExerciseType {
  switch (category) {
    case 'cardio': return 'cardio'
    case 'stretching': return 'flexibility'
    case 'plyometrics': return 'hiit'
    // strength, powerlifting, strongman, olympic weightlifting, y cualquier otro
    default: return 'strength'
  }
}

/** equipment (string único) → array; 'body only'/vacío/null → []. */
export function mapEquipment(equipment: string | null): string[] {
  if (!equipment) return []
  const trimmed = equipment.trim()
  if (trimmed === '' || trimmed === 'body only') return []
  return [trimmed]
}

/** mechanic === 'compound'. */
export function isCompound(mechanic: string | null): boolean {
  return mechanic === 'compound'
}

/** Une los pasos no vacíos con saltos de línea; '' → null. */
export function joinInstructions(instructions: string[]): string | null {
  const text = instructions.map(s => s.trim()).filter(Boolean).join('\n')
  return text.length > 0 ? text : null
}

/** primary + secondary, deduplicado y recortado. */
export function muscleGroups(primary: string[], secondary: string[]): string[] {
  return Array.from(new Set([...primary, ...secondary].map(m => m.trim()).filter(Boolean)))
}

/** Ruta relativa del dataset → URL absoluta del CDN raw de GitHub. */
export function imageUrlFromPath(path: string): string {
  return `${IMAGE_BASE}${path}`
}

/** Registro del dataset → objeto de inserción (sin image_url; se añade tras re-alojar). */
export function toExerciseInsert(ex: FreeExercise): ExerciseInsertData {
  return {
    name: ex.name.trim(),
    description: null,
    muscle_groups: muscleGroups(ex.primaryMuscles, ex.secondaryMuscles),
    equipment: mapEquipment(ex.equipment),
    difficulty: mapDifficulty(ex.level),
    exercise_type: mapExerciseType(ex.category),
    is_compound: isCompound(ex.mechanic),
    instructions: joinInstructions(ex.instructions),
    is_public: true,
    source: 'free-exercise-db',
    external_id: ex.id,
  }
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `pnpm test -- freeExerciseDb`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/lib/exercises/freeExerciseDb.ts" "src/lib/exercises/__tests__/freeExerciseDb.test.ts"
git commit -m "feat(exercises): pure mappers for free-exercise-db dataset"
```

---

## Task 4: Nuevo seed (reset + fetch + insert + re-host)

**Files:**
- Create: `scripts/seed-free-exercise-db.ts`

> Sin test automatizado (script de red/IO). Se verifica con `pnpm type-check` y la prueba manual de la Task 7.

- [ ] **Step 1: Crear el script**

Crear `scripts/seed-free-exercise-db.ts`:

```ts
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
  if (errors.length) {
    console.log(`   Errors     : ${errors.length}`)
    errors.slice(0, 20).forEach(e => console.log(`     • ${e}`))
    if (errors.length > 20) console.log(`     … and ${errors.length - 20} more`)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS. (`toExerciseInsert(...)` es asignable a `Insert` gracias a `source`/`external_id` añadidos en la Task 1; `image_url` es opcional.)

- [ ] **Step 3: Commit**

```bash
git add "scripts/seed-free-exercise-db.ts"
git commit -m "feat(exercises): seed catalog from free-exercise-db with image re-hosting"
```

---

## Task 5: Vocabulario de equipo del generador IA

**Files:**
- Modify: `src/lib/ai/filter.ts`

- [ ] **Step 1: Ampliar `BODYWEIGHT_TERMS`**

FIND:

```ts
const BODYWEIGHT_TERMS = new Set([
  'body weight', 'bodyweight', 'no equipment', 'none', '',
  'gym mat', 'exercise mat', 'mat',
  'swiss ball', 'stability ball',
  'foam roller',
])
```

REPLACE WITH:

```ts
const BODYWEIGHT_TERMS = new Set([
  'body weight', 'bodyweight', 'no equipment', 'none', '',
  'body only',
  'gym mat', 'exercise mat', 'mat',
  'swiss ball', 'stability ball', 'exercise ball',
  'foam roller', 'foam roll',
])
```

- [ ] **Step 2: Ampliar `EQUIPMENT_MAP`**

FIND:

```ts
const EQUIPMENT_MAP: Record<string, string[]> = {
  dumbbells:       ['dumbbell', 'dumbbells'],
  barbell:         ['barbell', 'bar', 'ez-bar', 'sz-bar', 'ez bar'],
  bench:           ['bench', 'weight bench', 'incline bench'],
  kettlebell:      ['kettlebell', 'kettlebells'],
  resistance_bands:['band', 'bands', 'resistance band', 'elastic band'],
  cable_machine:   ['cable', 'cables', 'pulley'],
  pull_up_bar:     ['pull-up bar', 'pullup bar', 'pull up bar', 'chin-up bar'],
  trx:             ['trx', 'suspension', 'gymnastic rings'],
}
```

REPLACE WITH:

```ts
const EQUIPMENT_MAP: Record<string, string[]> = {
  dumbbells:       ['dumbbell', 'dumbbells'],
  barbell:         ['barbell', 'bar', 'ez-bar', 'sz-bar', 'ez bar', 'e-z curl bar'],
  bench:           ['bench', 'weight bench', 'incline bench'],
  kettlebell:      ['kettlebell', 'kettlebells'],
  resistance_bands:['band', 'bands', 'resistance band', 'elastic band'],
  cable_machine:   ['cable', 'cables', 'pulley', 'machine'],
  pull_up_bar:     ['pull-up bar', 'pullup bar', 'pull up bar', 'chin-up bar'],
  trx:             ['trx', 'suspension', 'gymnastic rings'],
}
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `pnpm type-check`
Expected: PASS.
Run: `pnpm lint`
Expected: sin errores nuevos en `filter.ts`.

- [ ] **Step 4: Commit**

```bash
git add "src/lib/ai/filter.ts"
git commit -m "feat(ai): align exercise equipment vocabulary with free-exercise-db"
```

---

## Task 6: Retiro de wger

**Files:**
- Delete: `scripts/seed-exercises.ts`
- Delete: `src/lib/wger/client.ts`
- Delete: `src/lib/wger/imageStorage.ts`
- Delete: `src/lib/wger/__tests__/imageStorage.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Confirmar que nada más importa wger**

Run: `pnpm exec grep -rn "lib/wger" src scripts` (o búsqueda equivalente)
Expected: sin resultados una vez eliminado `scripts/seed-exercises.ts`. (Antes de borrar, el único importador es `scripts/seed-exercises.ts`.)

- [ ] **Step 2: Eliminar los archivos de wger**

```bash
git rm "scripts/seed-exercises.ts" "src/lib/wger/client.ts" "src/lib/wger/imageStorage.ts" "src/lib/wger/__tests__/imageStorage.test.ts"
```

- [ ] **Step 3: Apuntar el script `seed:exercises` al nuevo seed**

En `package.json`, FIND:

```json
    "seed:exercises": "tsx --env-file=.env.local scripts/seed-exercises.ts",
```

REPLACE WITH:

```json
    "seed:exercises": "tsx --env-file=.env.local scripts/seed-free-exercise-db.ts --reset",
```

- [ ] **Step 4: Verificar tipos, tests y lint**

Run: `pnpm type-check`
Expected: PASS (sin referencias colgantes a `lib/wger`).
Run: `pnpm test`
Expected: PASS — incluidos `imageStorage` (nuevo) y `freeExerciseDb`; ya no existe el test de wger.
Run: `pnpm lint`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(exercises): retire wger seed and client; point seed:exercises to free-exercise-db"
```

---

## Task 7: Verificación final

**Files:** ninguno (verificación)

- [ ] **Step 1: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 2: Tests**

Run: `pnpm test`
Expected: PASS — todos los existentes + `imageStorage` (exercises) + `freeExerciseDb`.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: sin errores NUEVOS (los hallazgos pre-existentes en `android/app/build/...`, `src/app/page.tsx`, `src/lib/ai/mock-adjustmentGenerator.ts` no son de este cambio).

- [ ] **Step 4: Prueba manual (la corre el dueño)**

> Requiere: migración `014` aplicada en Supabase + `.env.local` con `SUPABASE_SERVICE_ROLE_KEY`.

1. `pnpm seed:exercises` → debe imprimir el conteo del dataset, el reset, y "Inserted ≈ dataset.length" con "With image" alto.
2. Abrir `/exercises` (acceso dev/admin) → la mayoría de tarjetas muestran imagen real.
3. Abrir la ficha de un ejercicio → imagen hero.
4. Generar un plan (onboarding/IA) → confirma que devuelve ejercicios (el filtro de equipo funciona con el vocabulario nuevo) y que en la sesión se ven las miniaturas.

- [ ] **Step 5: Decidir integración**

Usar la skill `superpowers:finishing-a-development-branch` (merge / PR).

---

## Self-Review

- **Cobertura del spec:**
  - Esquema `source`/`external_id` + índice único → Task 1.
  - Reset en orden de FK (`exercise_logs → workout_exercises → progress_logs → workouts → workout_plans → exercises`) → Task 4 (`RESET_ORDER`).
  - Nuevo seed (fetch dataset, insertar, re-host `images[0]`) → Task 4 (+ mapeadores Task 3, helpers Storage Task 2).
  - Mapeos (`level→difficulty`, `category→exercise_type`, `equipment`, `is_compound`, `instructions`) como funciones puras testeadas → Task 3.
  - Vocabulario de equipo IA → Task 5.
  - UI sin cambios → confirmado (no hay tareas de UI; reutiliza lo existente).
  - Retiro de wger + `package.json` → Task 6.
  - Pruebas unitarias + manual → Tasks 2, 3, 7.
- **Placeholder scan:** sin TBD/TODO; cada step tiene código o comando concreto.
- **Type consistency:** `FreeExercise`/`ExerciseInsertData`/`toExerciseInsert` definidos en Task 3, consumidos en Task 4. `storageObjectKey(id: string, url)` definido en Task 2, usado en Task 4. `source`/`external_id` añadidos al tipo `Insert` en Task 1, usados por `toExerciseInsert` (Task 3) y el seed (Task 4). `RESET_ORDER` usa nombres de tabla reales verificados en `001_initial_schema.sql` (`workout_plans`, no `plans`).
- **Riesgo anotado:** quedan ~10 objetos huérfanos en el bucket de la corrida wger previa (claves numéricas); son inocuos (~pocos MB) y no colisionan con las claves por `external_id`. Limpieza opcional, fuera de alcance.

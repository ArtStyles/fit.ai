# Imágenes de ejercicios (Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar la imagen estática de cada ejercicio (re-alojada en Supabase Storage) en el catálogo, la ficha de detalle y la vista de sesión, con un placeholder de mancuerna para los que no tienen imagen.

**Architecture:** Un componente cliente reutilizable `ExerciseImage` (con su helper puro `resolveExerciseImage`) centraliza el render imagen/placeholder/fallback y se usa en las tres vistas. El seed (`scripts/seed-exercises.ts`) se extiende para descargar las imágenes de wger y subirlas a un bucket público de Supabase Storage, guardando la URL propia en `exercises.image_url`. La sesión y el catálogo ya transportan `image_url`; la ficha requiere una migración SQL que añada `image_url` al RPC `get_exercise_detail_payload`.

**Tech Stack:** Next.js 14 (App Router), React 18, `next/image`, Supabase (Postgres + Storage), lucide-react, vitest (entorno node). Gestor: **pnpm** (Windows PowerShell).

**Spec:** `docs/superpowers/specs/2026-06-06-imagenes-ejercicios-design.md`

---

## Requisito previo (manual, en Supabase) — necesario para Fase A y la ficha

La migración `supabase/migrations/013_exercise_images.sql` (creada en la Task 1) debe ejecutarse en el **SQL Editor de Supabase** antes de re-ejecutar el seed y antes de probar la ficha. Crea el bucket `exercise-images` y actualiza el RPC. No bloquea escribir el código, pero sí la prueba manual.

---

## File Structure

**Crear:**
- `supabase/migrations/013_exercise_images.sql` — bucket público `exercise-images` + `CREATE OR REPLACE` del RPC con `image_url`.
- `src/lib/wger/imageStorage.ts` — helpers puros: `extensionFromUrl`, `storageObjectKey`.
- `src/lib/wger/__tests__/imageStorage.test.ts` — tests de los helpers.
- `src/components/exercises/resolveExerciseImage.ts` — helper puro imagen-vs-placeholder.
- `src/components/exercises/__tests__/resolveExerciseImage.test.ts` — tests.
- `src/components/exercises/ExerciseImage.tsx` — componente cliente (next/image + placeholder mancuerna).

**Modificar:**
- `next.config.mjs` — añadir host de Supabase Storage a `remotePatterns`.
- `scripts/seed-exercises.ts` — re-hosting de imágenes durante el seed.
- `src/types/database.ts` — añadir `image_url` al tipo `Returns.exercise` del RPC.
- `src/app/(app)/exercises/[exerciseId]/page.tsx` — `image_url` en tipo + SELECT fallback + render hero.
- `src/app/(app)/exercises/ExerciseGrid.tsx` — miniatura en tarjeta + hero en modal.
- `src/components/session/ExerciseCard.tsx` — miniatura en la cabecera del ejercicio.
- `src/components/session/SessionExercisePicker.tsx` — miniatura en cada opción.

**Fuera de alcance (anotado):** el selector de edición de plan `src/components/plan/ExercisePicker.tsx` (flujo de armado de plan, no de entrenamiento) no se toca; su tipo `PlanExerciseOption` y su consulta no traen `image_url`. Se puede añadir como extensión pequeña después.

---

# Fase A — Storage + re-hosting en el seed

## Task 1: Migración SQL (bucket + RPC con image_url)

**Files:**
- Create: `supabase/migrations/013_exercise_images.sql`
- Modify: `src/types/database.ts` (tipo del RPC)

- [ ] **Step 1: Crear la migración**

Crear `supabase/migrations/013_exercise_images.sql` con exactamente:

```sql
-- 013_exercise_images.sql
-- Bucket público para imágenes de ejercicios + image_url en el payload de la ficha.

-- 1. Bucket público
insert into storage.buckets (id, name, public)
values ('exercise-images', 'exercise-images', true)
on conflict (id) do nothing;

-- 2. Añadir image_url al payload de detalle de ejercicio
create or replace function public.get_exercise_detail_payload(
  p_exercise_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with target_exercise as (
  select
    e.id,
    e.name,
    e.description,
    e.muscle_groups,
    e.equipment,
    e.difficulty,
    e.exercise_type,
    e.is_compound,
    e.instructions,
    e.video_url,
    e.image_url
  from exercises e
  where e.id = p_exercise_id
    and e.is_public = true
  limit 1
),
exercise_rows as (
  select
    el.id,
    el.progress_log_id,
    el.sets_completed,
    el.reps_completed,
    el.weights_kg,
    el.rpe_values,
    el.notes,
    jsonb_build_object(
      'id', pl.id,
      'workout_id', pl.workout_id,
      'completed_at', pl.completed_at,
      'duration_minutes', pl.duration_minutes,
      'mood_rating', pl.mood_rating
    ) as progress_log,
    pl.completed_at as progress_completed_at
  from exercise_logs el
  join progress_logs pl on pl.id = el.progress_log_id
  where el.exercise_id = p_exercise_id
    and pl.user_id = auth.uid()
  order by pl.completed_at desc
),
workout_rows as (
  select distinct
    w.id,
    w.name,
    w.focus
  from exercise_logs el
  join progress_logs pl on pl.id = el.progress_log_id
  join workouts w
    on w.id = pl.workout_id
   and w.user_id = auth.uid()
  where el.exercise_id = p_exercise_id
    and pl.user_id = auth.uid()
    and pl.workout_id is not null
)
select jsonb_build_object(
  'exercise', (
    select to_jsonb(te)
    from target_exercise te
  ),
  'logs', coalesce((
    select jsonb_agg((to_jsonb(er) - 'progress_completed_at') order by er.progress_completed_at desc)
    from exercise_rows er
  ), '[]'::jsonb),
  'workouts', coalesce((
    select jsonb_agg(to_jsonb(wr) order by wr.name)
    from workout_rows wr
  ), '[]'::jsonb)
);
$$;

grant execute on function public.get_exercise_detail_payload(uuid)
  to authenticated;
```

- [ ] **Step 2: Añadir `image_url` al tipo del RPC en `src/types/database.ts`**

Buscar (dentro de `get_exercise_detail_payload` → `Returns` → `exercise`):

```ts
            instructions: string | null
            video_url: string | null
          } | null
          logs: {
```

Reemplazar por:

```ts
            instructions: string | null
            video_url: string | null
            image_url: string | null
          } | null
          logs: {
```

- [ ] **Step 3: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS (sin errores).

- [ ] **Step 4: Commit**

```bash
git add "supabase/migrations/013_exercise_images.sql" "src/types/database.ts"
git commit -m "feat(exercises): migration for image bucket and image_url in detail RPC"
```

> ⚠️ Ejecutar `013_exercise_images.sql` en el SQL Editor de Supabase. No es código de la app; sin esto el bucket no existe y la ficha no recibirá `image_url` por el RPC.

---

## Task 2: Helpers puros de almacenamiento (TDD)

**Files:**
- Create: `src/lib/wger/imageStorage.ts`
- Test: `src/lib/wger/__tests__/imageStorage.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/wger/__tests__/imageStorage.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extensionFromUrl, storageObjectKey } from '../imageStorage'

describe('extensionFromUrl', () => {
  it('extracts a lowercase extension from the path', () => {
    expect(extensionFromUrl('https://wger.de/media/exercise-images/91/Bench-press.png')).toBe('png')
    expect(extensionFromUrl('https://wger.de/media/x/y.JPG?token=abc')).toBe('jpg')
  })

  it('defaults to jpg when there is no extension', () => {
    expect(extensionFromUrl('https://wger.de/media/x/noextension')).toBe('jpg')
    expect(extensionFromUrl('not a url')).toBe('jpg')
  })
})

describe('storageObjectKey', () => {
  it('builds {wgerId}.{ext}', () => {
    expect(storageObjectKey(123, 'https://wger.de/media/x/a.png')).toBe('123.png')
    expect(storageObjectKey(7, 'https://wger.de/media/x/a')).toBe('7.jpg')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `pnpm test -- imageStorage`
Expected: FAIL (no se resuelve `../imageStorage`).

- [ ] **Step 3: Implementar**

Crear `src/lib/wger/imageStorage.ts`:

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

/** Clave del objeto en Storage para la imagen de un ejercicio, p. ej. "123.png". */
export function storageObjectKey(wgerId: number, sourceUrl: string): string {
  return `${wgerId}.${extensionFromUrl(sourceUrl)}`
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `pnpm test -- imageStorage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/lib/wger/imageStorage.ts" "src/lib/wger/__tests__/imageStorage.test.ts"
git commit -m "feat(exercises): pure helpers for exercise image storage keys"
```

---

## Task 3: Re-hosting de imágenes en el seed

**Files:**
- Modify: `scripts/seed-exercises.ts`

- [ ] **Step 1: Importar los helpers**

Buscar:

```ts
import {
  fetchExercises,
  fetchMuscles,
  fetchEquipment,
  WGER_LANGUAGE,
  type WgerMuscle,
  type WgerEquipment,
} from '../src/lib/wger/client'
import type { Database } from '../src/types/database'
```

Reemplazar por:

```ts
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

type SeedSupabase = ReturnType<typeof createClient>

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
    const res = await fetch(sourceUrl)
    if (!res.ok) throw new Error(`download ${res.status}`)
    const bytes = Buffer.from(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') ?? 'image/jpeg'

    const { error } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(key, bytes, { contentType, upsert: false })

    if (error && !error.message.toLowerCase().includes('already exists')) {
      throw new Error(`upload: ${error.message}`)
    }
    existingKeys.add(key)
  }

  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(key).data.publicUrl
}
```

- [ ] **Step 2: Cargar las claves existentes antes del bucle**

Buscar:

```ts
  let processed = 0
  let upserted = 0
  let skipped = 0
  const errors: string[] = []
```

Reemplazar por:

```ts
  let processed = 0
  let upserted = 0
  let skipped = 0
  const errors: string[] = []

  console.log('Listing existing images in storage…')
  const existingImageKeys = await listExistingImageKeys(supabase)
  console.log(`  already in bucket: ${existingImageKeys.size}`)
```

- [ ] **Step 3: Re-alojar la imagen en lugar de usar la URL de wger**

Buscar:

```ts
      // Main image (prefer is_main=true, fall back to first image)
      const mainImage =
        ex.images.find(img => img.is_main) ?? ex.images[0] ?? null
      const imageUrl = mainImage?.image ?? null
```

Reemplazar por:

```ts
      // Main image (prefer is_main=true, fall back to first image)
      const mainImage =
        ex.images.find(img => img.is_main) ?? ex.images[0] ?? null
      let imageUrl: string | null = null
      if (mainImage?.image) {
        try {
          imageUrl = await rehostImage(supabase, ex.id, mainImage.image, existingImageKeys)
        } catch (err) {
          errors.push(`image ${ex.id}: ${(err as Error).message}`)
          imageUrl = null
        }
      }
```

- [ ] **Step 4: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "scripts/seed-exercises.ts"
git commit -m "feat(exercises): re-host wger images to Supabase Storage during seed"
```

> Migración de datos (manual, una vez aplicada la migración 013): `pnpm seed:exercises` con `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`. Re-ejecutable: las imágenes ya subidas se omiten.

---

# Fase B — Componente compartido + catálogo + ficha

## Task 4: Helper `resolveExerciseImage` + componente `ExerciseImage` + config

**Files:**
- Create: `src/components/exercises/resolveExerciseImage.ts`
- Test: `src/components/exercises/__tests__/resolveExerciseImage.test.ts`
- Create: `src/components/exercises/ExerciseImage.tsx`
- Modify: `next.config.mjs`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/exercises/__tests__/resolveExerciseImage.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveExerciseImage } from '../resolveExerciseImage'

describe('resolveExerciseImage', () => {
  it('returns the image when src is a non-empty string', () => {
    expect(resolveExerciseImage('https://x/y.png')).toEqual({ kind: 'image', src: 'https://x/y.png' })
  })

  it('trims surrounding whitespace', () => {
    expect(resolveExerciseImage('  https://x/y.png  ')).toEqual({ kind: 'image', src: 'https://x/y.png' })
  })

  it('returns placeholder for null, undefined or blank', () => {
    expect(resolveExerciseImage(null)).toEqual({ kind: 'placeholder' })
    expect(resolveExerciseImage(undefined)).toEqual({ kind: 'placeholder' })
    expect(resolveExerciseImage('')).toEqual({ kind: 'placeholder' })
    expect(resolveExerciseImage('   ')).toEqual({ kind: 'placeholder' })
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `pnpm test -- resolveExerciseImage`
Expected: FAIL (no se resuelve `../resolveExerciseImage`).

- [ ] **Step 3: Implementar el helper**

Crear `src/components/exercises/resolveExerciseImage.ts`:

```ts
export type ResolvedExerciseImage =
  | { kind: 'image'; src: string }
  | { kind: 'placeholder' }

/** Decide si renderizar la imagen real o el placeholder. */
export function resolveExerciseImage(src: string | null | undefined): ResolvedExerciseImage {
  if (typeof src === 'string' && src.trim().length > 0) {
    return { kind: 'image', src: src.trim() }
  }
  return { kind: 'placeholder' }
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `pnpm test -- resolveExerciseImage`
Expected: PASS.

- [ ] **Step 5: Crear el componente `ExerciseImage`**

Crear `src/components/exercises/ExerciseImage.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Dumbbell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveExerciseImage } from './resolveExerciseImage'

type Variant = 'thumb' | 'hero'

const VARIANT_CFG: Record<Variant, { aspect: string; icon: string; sizes: string }> = {
  thumb: { aspect: 'aspect-square', icon: 'h-1/3 w-1/3', sizes: '200px' },
  hero: { aspect: 'aspect-[16/10]', icon: 'h-12 w-12', sizes: '(max-width: 640px) 100vw, 512px' },
}

export function ExerciseImage({
  src,
  alt,
  variant = 'thumb',
  className,
}: {
  src: string | null | undefined
  alt: string
  variant?: Variant
  className?: string
}) {
  const [errored, setErrored] = useState(false)
  const resolved = resolveExerciseImage(src)
  const cfg = VARIANT_CFG[variant]
  const showImage = resolved.kind === 'image' && !errored

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-800/60 to-zinc-900',
        cfg.aspect,
        className,
      )}
    >
      {showImage ? (
        <Image
          src={resolved.src}
          alt={alt}
          fill
          sizes={cfg.sizes}
          className="object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
          <Dumbbell className={cfg.icon} aria-hidden="true" />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Permitir el host de Supabase Storage en `next.config.mjs`**

Buscar:

```js
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "wger.de",
        pathname: "/media/**",
      },
    ],
  },
```

Reemplazar por:

```js
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "wger.de",
        pathname: "/media/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
```

- [ ] **Step 7: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "src/components/exercises/resolveExerciseImage.ts" "src/components/exercises/__tests__/resolveExerciseImage.test.ts" "src/components/exercises/ExerciseImage.tsx" "next.config.mjs"
git commit -m "feat(exercises): add ExerciseImage component with dumbbell placeholder"
```

---

## Task 5: Imagen en el catálogo (tarjeta + modal)

**Files:**
- Modify: `src/app/(app)/exercises/ExerciseGrid.tsx`

- [ ] **Step 1: Importar `ExerciseImage`**

Buscar:

```tsx
import { TYPE_CFG, DIFF_CFG } from './config'
import type { Exercise } from '@/types/exercise'
```

Reemplazar por:

```tsx
import { TYPE_CFG, DIFF_CFG } from './config'
import { ExerciseImage } from '@/components/exercises/ExerciseImage'
import type { Exercise } from '@/types/exercise'
```

- [ ] **Step 2: Miniatura en la tarjeta**

Buscar:

```tsx
      {/* Icon + compound */}
      <div className="flex items-start justify-between gap-2">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0 ${cfg?.iconBg ?? 'bg-zinc-800'}`}>
          {cfg?.emoji ?? '💪'}
        </div>
        {ex.is_compound && (
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-600 mt-1 shrink-0">
            Compound
          </span>
        )}
      </div>
```

Reemplazar por:

```tsx
      {/* Thumbnail + compound */}
      <div className="relative">
        <ExerciseImage src={ex.image_url} alt={ex.name} variant="thumb" className="w-full" />
        {ex.is_compound && (
          <span className="absolute top-1.5 right-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-200">
            Compound
          </span>
        )}
      </div>
```

- [ ] **Step 3: Imagen hero en el modal**

Buscar:

```tsx
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header (sticky) ───────────────────────────────────────────── */}
```

Reemplazar por:

```tsx
        onClick={e => e.stopPropagation()}
      >
        {/* ── Hero image ────────────────────────────────────────────────── */}
        <ExerciseImage src={ex.image_url} alt={ex.name} variant="hero" className="w-full rounded-none border-0" />

        {/* ── Header (sticky) ───────────────────────────────────────────── */}
```

- [ ] **Step 4: Verificar tipos y lint**

Run: `pnpm type-check`
Expected: PASS.
Run: `pnpm lint`
Expected: sin errores nuevos en `ExerciseGrid.tsx`. (Nota: `TYPE_CFG`/`cfg` y `DIFF_CFG`/`diff` siguen usándose en los pills y el header del modal, así que sus imports/variables se conservan.)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/exercises/ExerciseGrid.tsx"
git commit -m "feat(exercises): show exercise image in catalog card and modal"
```

---

## Task 6: Imagen en la ficha de detalle

**Files:**
- Modify: `src/app/(app)/exercises/[exerciseId]/page.tsx`

- [ ] **Step 1: Importar `ExerciseImage`**

Buscar:

```tsx
import { Badge } from '@/components/ui/badge'
import { PendingLink } from '@/components/navigation/PendingLink'
```

Reemplazar por:

```tsx
import { Badge } from '@/components/ui/badge'
import { ExerciseImage } from '@/components/exercises/ExerciseImage'
import { PendingLink } from '@/components/navigation/PendingLink'
```

- [ ] **Step 2: Añadir `image_url` al tipo `ExerciseRow`**

Buscar:

```tsx
type ExerciseRow = {
  id: string
  name: string
  description: string | null
  muscle_groups: string[] | null
  equipment: string[] | null
  difficulty: string | null
  exercise_type: string | null
  is_compound: boolean | null
  instructions: string | null
  video_url: string | null
}
```

Reemplazar por:

```tsx
type ExerciseRow = {
  id: string
  name: string
  description: string | null
  muscle_groups: string[] | null
  equipment: string[] | null
  difficulty: string | null
  exercise_type: string | null
  is_compound: boolean | null
  instructions: string | null
  video_url: string | null
  image_url: string | null
}
```

- [ ] **Step 3: Añadir `image_url` al SELECT de fallback**

Buscar:

```tsx
    .from('exercises')
    .select('id, name, description, muscle_groups, equipment, difficulty, exercise_type, is_compound, instructions, video_url')
    .eq('id', exerciseId)
```

Reemplazar por:

```tsx
    .from('exercises')
    .select('id, name, description, muscle_groups, equipment, difficulty, exercise_type, is_compound, instructions, video_url, image_url')
    .eq('id', exerciseId)
```

- [ ] **Step 4: Renderizar la imagen hero bajo el header**

Buscar (cierre del `<header>` seguido de la sección de stats):

```tsx
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300">
              <Dumbbell className="h-5 w-5" />
            </div>
          </div>
        </header>

        <section className="animate-in fade-in slide-in-from-bottom-3 mt-8 grid grid-cols-2 gap-2 duration-500">
```

Reemplazar por:

```tsx
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300">
              <Dumbbell className="h-5 w-5" />
            </div>
          </div>
        </header>

        <ExerciseImage
          src={exercise.image_url}
          alt={exercise.name}
          variant="hero"
          className="animate-in fade-in slide-in-from-bottom-3 mt-6 w-full duration-500"
        />

        <section className="animate-in fade-in slide-in-from-bottom-3 mt-8 grid grid-cols-2 gap-2 duration-500">
```

- [ ] **Step 5: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS. (`exercise.image_url` está disponible por el tipo del RPC actualizado en la Task 1 y el SELECT de fallback.)

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/exercises/[exerciseId]/page.tsx"
git commit -m "feat(exercises): show exercise image on detail page"
```

---

# Fase C — Render en la vista de sesión

## Task 7: Miniatura en la tarjeta de ejercicio de la sesión

**Files:**
- Modify: `src/components/session/ExerciseCard.tsx`

- [ ] **Step 1: Importar `ExerciseImage`**

Buscar:

```tsx
import { cn }    from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
```

Reemplazar por:

```tsx
import { cn }    from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ExerciseImage } from '@/components/exercises/ExerciseImage'
```

- [ ] **Step 2: Desestructurar `imageUrl`**

Buscar:

```tsx
    status,
    expanded,
    sets,
    name,
    muscleGroups,
```

Reemplazar por:

```tsx
    status,
    expanded,
    sets,
    name,
    imageUrl,
    muscleGroups,
```

- [ ] **Step 3: Renderizar la miniatura en la cabecera**

Buscar:

```tsx
        {/* Indicador de estado lateral */}
        <div className={cn(
          'shrink-0 w-1 h-8 rounded-full',
          isActive    && 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]',
          isCompleted && 'bg-green-500',
          isSkipped   && 'bg-muted-foreground/20',
          !isActive && !isCompleted && !isSkipped && 'bg-border/40',
        )} />

        {/* Info principal */}
```

Reemplazar por:

```tsx
        {/* Indicador de estado lateral */}
        <div className={cn(
          'shrink-0 w-1 h-8 rounded-full',
          isActive    && 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]',
          isCompleted && 'bg-green-500',
          isSkipped   && 'bg-muted-foreground/20',
          !isActive && !isCompleted && !isSkipped && 'bg-border/40',
        )} />

        {/* Miniatura del ejercicio */}
        <ExerciseImage
          src={imageUrl}
          alt={name}
          variant="thumb"
          className={cn('h-10 w-10 shrink-0', isSkipped && 'opacity-50')}
        />

        {/* Info principal */}
```

- [ ] **Step 4: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS. (`imageUrl` ya existe en el tipo `ExerciseSession`.)

- [ ] **Step 5: Commit**

```bash
git add "src/components/session/ExerciseCard.tsx"
git commit -m "feat(session): show exercise thumbnail in session card"
```

---

## Task 8: Miniatura en el selector de ejercicios de la sesión

**Files:**
- Modify: `src/components/session/SessionExercisePicker.tsx`

- [ ] **Step 1: Importar `ExerciseImage`**

Buscar:

```tsx
import { useMemo, useState } from 'react'
import type { SessionExerciseDraft } from '@/store/sessionStore'
```

Reemplazar por:

```tsx
import { useMemo, useState } from 'react'
import { ExerciseImage } from '@/components/exercises/ExerciseImage'
import type { SessionExerciseDraft } from '@/store/sessionStore'
```

- [ ] **Step 2: Renderizar la miniatura en cada opción**

Buscar:

```tsx
            <button
              key={option.exerciseId}
              type="button"
              onClick={() => {
                onSelect(option)
                setQuery('')
              }}
              className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2 text-left text-xs text-foreground transition-colors hover:border-indigo-500/40 hover:bg-indigo-500/10"
            >
              <span className="font-semibold">{option.name}</span>
              {meta && (
                <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                  {meta}
                </span>
              )}
            </button>
```

Reemplazar por:

```tsx
            <button
              key={option.exerciseId}
              type="button"
              onClick={() => {
                onSelect(option)
                setQuery('')
              }}
              className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/10 px-3 py-2 text-left text-xs text-foreground transition-colors hover:border-indigo-500/40 hover:bg-indigo-500/10"
            >
              <ExerciseImage
                src={option.imageUrl}
                alt={option.name}
                variant="thumb"
                className="h-9 w-9 shrink-0"
              />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{option.name}</span>
                {meta && (
                  <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                    {meta}
                  </span>
                )}
              </span>
            </button>
```

- [ ] **Step 3: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS. (`option.imageUrl` ya existe en `SessionExerciseDraft`.)

- [ ] **Step 4: Commit**

```bash
git add "src/components/session/SessionExercisePicker.tsx"
git commit -m "feat(session): show exercise thumbnail in session exercise picker"
```

---

## Task 9: Verificación final

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Type-check**

Run: `pnpm type-check`
Expected: PASS sin errores.

- [ ] **Step 2: Tests**

Run: `pnpm test`
Expected: PASS — todos los existentes + `imageStorage` + `resolveExerciseImage`.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: sin errores NUEVOS en los archivos tocados (los hallazgos pre-existentes en `android/app/build/...`, `src/app/page.tsx` y `src/lib/ai/mock-adjustmentGenerator.ts` no son de este cambio).

- [ ] **Step 4: Prueba manual**

> Requiere: migración `013` aplicada en Supabase y `pnpm seed:exercises` ejecutado para poblar las URLs propias.

Run: `pnpm dev`. Verificar:
1. **Catálogo `/exercises`** (con acceso dev/admin): las tarjetas muestran miniatura; el modal muestra imagen hero. Ejercicios sin imagen → placeholder de mancuerna.
2. **Ficha `/exercises/[id]`**: imagen hero bajo el título; sin imagen → placeholder.
3. **Sesión** (`/session/[workoutId]`): miniatura junto a cada ejercicio; al abrir "Cambiar ejercicio solo por hoy", las opciones del selector muestran miniatura.
4. **URL rota**: si una imagen no carga, aparece el placeholder (sin hueco roto).

- [ ] **Step 5: Decidir integración**

Usar la skill `superpowers:finishing-a-development-branch` (merge / PR / etc.).

---

## Self-Review

- **Cobertura del spec:**
  - Bucket Supabase Storage + re-hosting en seed → Task 1 (bucket) + Task 2 (helpers) + Task 3 (seed).
  - Idempotencia → Task 3 (`listExistingImageKeys` evita re-subir; se omiten claves ya presentes).
  - Componente `ExerciseImage` con placeholder de **mancuerna** → Task 4.
  - Helper puro imagen-vs-placeholder testeado → Task 4 (`resolveExerciseImage`).
  - `next/image` remotePatterns para Supabase → Task 4.
  - Catálogo (tarjeta + modal) → Task 5.
  - Ficha (tipo + SELECT + RPC + render) → Task 1 (RPC/tipo) + Task 6 (tipo local, SELECT, render).
  - Sesión (tarjeta + selector) → Task 7 + Task 8 (datos ya cableados; solo render).
  - Fallback/nulls → placeholder en todas las vistas vía `ExerciseImage`.
  - Pruebas unitarias (helpers) + manual → Task 2, Task 4, Task 9.
- **Placeholder scan:** sin TBD/TODO; cada step tiene código o comando concreto.
- **Type consistency:** `extensionFromUrl`/`storageObjectKey` definidos en Task 2 y usados en Task 3. `resolveExerciseImage`/`ResolvedExerciseImage` en Task 4, consumidos por `ExerciseImage`. Prop `variant: 'thumb' | 'hero'` consistente en todas las vistas (Tasks 5-8). `image_url` (snake_case, fila DB / Exercise) vs `imageUrl` (camelCase, store de sesión) usados correctamente según el origen en cada vista.
- **Decisión fuera de spec:** el selector de edición de plan `ExercisePicker` queda fuera (flujo de armado, no de entrenamiento; su tipo/consulta no traen `image_url`). Anotado arriba.

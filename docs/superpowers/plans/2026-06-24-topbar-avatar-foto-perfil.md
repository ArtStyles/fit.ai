# Rediseño de topbar + foto de avatar + sección Perfil — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar el topbar del dashboard (sin raya, sin logo, sin menú; avatar grande a la izquierda), permitir subir una foto de avatar, y mover el acceso a perfil/medidas/logout a Ajustes (barra inferior).

**Architecture:** El avatar pasa a ser un componente cliente reutilizable (`AvatarUploader`) que recorta/reescala la imagen con Canvas y la envía por `FormData` a una Server Action. La Server Action sube al bucket público `avatars` con el cliente service-role (réplica del patrón de `013_exercise_images.sql`) y guarda la URL en `profiles.avatar_url`. La identidad (foto + nombre) vive en una nueva sección `/settings/perfil`; los datos físicos se mueven a `/settings/datos`.

**Tech Stack:** Next.js 14 (App Router, Server Actions), React 18, Supabase (SSR + service-role + Storage), Radix Avatar/Toast, Tailwind, lucide-react, Vitest.

**Spec:** [`docs/superpowers/specs/2026-06-24-topbar-avatar-foto-perfil-design.md`](../specs/2026-06-24-topbar-avatar-foto-perfil-design.md)

---

## File Structure

**Nuevos**
- `supabase/migrations/018_avatars_bucket.sql` — bucket público `avatars`.
- `src/lib/images/avatar.ts` — helpers puros (validación, recorte, ruta) + `resizeImageToSquare` (canvas).
- `src/lib/images/__tests__/avatar.test.ts` — tests de los helpers puros.
- `src/app/actions/avatar.ts` — Server Actions `updateAvatar`, `removeAvatar`.
- `src/components/profile/AvatarUploader.tsx` — avatar editable (topbar + Ajustes).
- `src/app/(app)/settings/perfil/page.tsx` — nueva sección "Perfil" (foto + nombre), creada tras mover la anterior.

**Movidos**
- `src/app/(app)/settings/perfil/` → `src/app/(app)/settings/datos/` (se le quita el campo nombre).

**Modificados**
- `src/components/dashboard/DashboardHeader.tsx` — rediseño, usa `AvatarUploader`.
- `src/app/actions/settings.ts` — `updatePersonalData` (quita nombre, rutas a `/settings/datos`) + nueva `updateProfileName`.
- `src/app/(app)/settings/page.tsx` — `SECTIONS` (añade Perfil + Medidas, renombra href de Datos personales).
- `src/components/dashboard/CheckInBanner.tsx` — href `/settings/perfil` → `/settings/datos`.

**Sin cambios necesarios:** `next.config.mjs` ya permite `*.supabase.co/storage/v1/object/public/**`, y `AvatarImage` es un `<img>` de Radix (no `next/image`).

---

## Task 1: Migración del bucket `avatars`

**Files:**
- Create: `supabase/migrations/018_avatars_bucket.sql`

> ⚠️ **Acción manual requerida:** esta migración debe ejecutarse en el **SQL Editor de Supabase**. No es código de la app; sin ella, las Tasks 3+ no podrán subir la foto de extremo a extremo. Las Tasks intermedias compilan igual.

- [ ] **Step 1: Crear la migración**

`supabase/migrations/018_avatars_bucket.sql`:

```sql
-- 018_avatars_bucket.sql
-- Bucket público para fotos de avatar de usuario.
-- Lectura pública (como exercise-images). Las escrituras se hacen solo desde la
-- Server Action updateAvatar con service-role, que controla la ruta {userId}/avatar.webp.

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/018_avatars_bucket.sql
git commit -m "feat(storage): migración del bucket público avatars" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Helpers de imagen (TDD) + reescalado con canvas

**Files:**
- Create: `src/lib/images/avatar.ts`
- Test: `src/lib/images/__tests__/avatar.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`src/lib/images/__tests__/avatar.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  validateAvatarFile,
  computeSquareCrop,
  avatarStoragePath,
  MAX_AVATAR_BYTES,
} from '../avatar'

describe('validateAvatarFile', () => {
  it('acepta una imagen dentro del límite', () => {
    expect(validateAvatarFile('image/webp', 1024)).toEqual({ ok: true })
    expect(validateAvatarFile('image/jpeg', MAX_AVATAR_BYTES)).toEqual({ ok: true })
  })
  it('rechaza tipos que no son imagen', () => {
    expect(validateAvatarFile('application/pdf', 1024).ok).toBe(false)
  })
  it('rechaza archivos vacíos o demasiado grandes', () => {
    expect(validateAvatarFile('image/png', 0).ok).toBe(false)
    expect(validateAvatarFile('image/png', MAX_AVATAR_BYTES + 1).ok).toBe(false)
  })
})

describe('computeSquareCrop', () => {
  it('no recorta cuando ya es cuadrada', () => {
    expect(computeSquareCrop(500, 500)).toEqual({ sx: 0, sy: 0, size: 500 })
  })
  it('recorta los lados en imágenes apaisadas', () => {
    expect(computeSquareCrop(800, 600)).toEqual({ sx: 100, sy: 0, size: 600 })
  })
  it('recorta arriba/abajo en imágenes verticales', () => {
    expect(computeSquareCrop(600, 800)).toEqual({ sx: 0, sy: 100, size: 600 })
  })
})

describe('avatarStoragePath', () => {
  it('construye {userId}/avatar.webp', () => {
    expect(avatarStoragePath('abc-123')).toBe('abc-123/avatar.webp')
  })
})
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `pnpm exec vitest run src/lib/images/__tests__/avatar.test.ts`
Expected: FAIL — no se puede resolver `../avatar` (módulo inexistente).

- [ ] **Step 3: Implementar los helpers**

`src/lib/images/avatar.ts`:

```ts
// Helpers para la foto de avatar.
// Puros y testeables: validateAvatarFile, computeSquareCrop, avatarStoragePath.
// resizeImageToSquare usa <canvas> y solo se ejecuta en el cliente (no se testea).

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024 // 5 MB

export type AvatarValidation = { ok: true } | { ok: false; error: string }

export function validateAvatarFile(
  type: string,
  size: number,
  maxBytes = MAX_AVATAR_BYTES,
): AvatarValidation {
  if (!type.startsWith('image/')) return { ok: false, error: 'El archivo debe ser una imagen.' }
  if (size <= 0) return { ok: false, error: 'El archivo está vacío.' }
  if (size > maxBytes) return { ok: false, error: 'La imagen supera el tamaño máximo (5 MB).' }
  return { ok: true }
}

// Rectángulo cuadrado centrado para recortar una imagen de width×height.
export function computeSquareCrop(
  width: number,
  height: number,
): { sx: number; sy: number; size: number } {
  const size = Math.min(width, height)
  const sx = Math.floor((width - size) / 2)
  const sy = Math.floor((height - size) / 2)
  return { sx, sy, size }
}

// Ruta estable en el bucket; el upsert sobreescribe y evita huérfanos.
export function avatarStoragePath(userId: string): string {
  return `${userId}/avatar.webp`
}

// Carga la imagen, recorta al cuadrado centrado y reescala a size×size.
// Exporta webp; si el WebView no lo soporta, cae a jpeg. Solo cliente.
export async function resizeImageToSquare(
  file: File,
  size = 512,
  quality = 0.85,
): Promise<{ blob: Blob; contentType: string }> {
  const bitmap = await createImageBitmap(file)
  const { sx, sy, size: cropSize } = computeSquareCrop(bitmap.width, bitmap.height)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo crear el contexto de canvas.')
  ctx.drawImage(bitmap, sx, sy, cropSize, cropSize, 0, 0, size, size)
  bitmap.close?.()

  const toBlob = (mime: string) =>
    new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime, quality))

  let contentType = 'image/webp'
  let blob = await toBlob(contentType)
  if (!blob) {
    contentType = 'image/jpeg'
    blob = await toBlob(contentType)
  }
  if (!blob) throw new Error('No se pudo procesar la imagen.')
  return { blob, contentType }
}
```

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `pnpm exec vitest run src/lib/images/__tests__/avatar.test.ts`
Expected: PASS — 9 tests en verde.

- [ ] **Step 5: Commit**

```bash
git add src/lib/images/avatar.ts src/lib/images/__tests__/avatar.test.ts
git commit -m "feat(images): helpers de avatar (validación, recorte cuadrado, reescalado canvas)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Server Actions del avatar

**Files:**
- Create: `src/app/actions/avatar.ts`

- [ ] **Step 1: Escribir las Server Actions**

`src/app/actions/avatar.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { validateAvatarFile, avatarStoragePath } from '@/lib/images/avatar'

const BUCKET = 'avatars'

export type AvatarActionResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

export async function updateAvatar(formData: FormData): Promise<AvatarActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'No se recibió ninguna imagen.' }

  const check = validateAvatarFile(file.type, file.size)
  if (!check.ok) return check

  const service = createServiceClient()
  const path = avatarStoragePath(user.id)

  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true, cacheControl: '3600' })
  if (uploadError) return { ok: false, error: 'No se pudo subir la imagen.' }

  const publicUrl = service.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  const urlWithVersion = `${publicUrl}?v=${Date.now()}`

  const { error: updateError } = await (service.from('profiles') as any)
    .update({ avatar_url: urlWithVersion })
    .eq('id', user.id)
  if (updateError) return { ok: false, error: 'No se pudo guardar el avatar.' }

  revalidatePath('/dashboard')
  revalidatePath('/settings/perfil')
  return { ok: true, url: urlWithVersion }
}

export async function removeAvatar(): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const service = createServiceClient()
  await service.storage.from(BUCKET).remove([avatarStoragePath(user.id)])

  const { error } = await (service.from('profiles') as any)
    .update({ avatar_url: null })
    .eq('id', user.id)
  if (error) return { ok: false }

  revalidatePath('/dashboard')
  revalidatePath('/settings/perfil')
  return { ok: true }
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS (sin errores). El cast `(service.from('profiles') as any)` replica el patrón de `src/app/actions/settings.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/avatar.ts
git commit -m "feat(avatar): server actions updateAvatar y removeAvatar" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Componente `AvatarUploader`

**Files:**
- Create: `src/components/profile/AvatarUploader.tsx`

- [ ] **Step 1: Escribir el componente**

`src/components/profile/AvatarUploader.tsx`:

```tsx
'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { updateAvatar, removeAvatar } from '@/app/actions/avatar'
import { resizeImageToSquare } from '@/lib/images/avatar'
import { useToast } from '@/components/feedback/ToastProvider'
import { cn } from '@/lib/utils'

type Props = {
  avatarUrl: string | null
  initials: string
  size?: 'header' | 'lg'
  showRemove?: boolean
}

const SIZES = {
  header: { box: 'h-16 w-16', text: 'text-lg',  badge: 'h-5 w-5', icon: 'h-3 w-3'   },
  lg:     { box: 'h-24 w-24', text: 'text-2xl', badge: 'h-7 w-7', icon: 'h-3.5 w-3.5' },
}

export function AvatarUploader({ avatarUrl, initials, size = 'header', showRemove = false }: Props) {
  const router = useRouter()
  const { showToast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const s = SIZES[size]

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite re-seleccionar el mismo archivo
    if (!file) return

    let processed: { blob: Blob; contentType: string }
    try {
      processed = await resizeImageToSquare(file)
    } catch {
      showToast({ title: 'No se pudo procesar la imagen', variant: 'error' })
      return
    }

    const localUrl = URL.createObjectURL(processed.blob)
    setPreview(localUrl)

    const fd = new FormData()
    fd.append('file', processed.blob, 'avatar.webp')

    startTransition(async () => {
      const res = await updateAvatar(fd)
      URL.revokeObjectURL(localUrl)
      if (res.ok) {
        showToast({ title: 'Foto actualizada', variant: 'success' })
        router.refresh()
      } else {
        setPreview(null)
        showToast({ title: 'No se pudo guardar la foto', description: res.error, variant: 'error' })
      }
    })
  }

  function handleRemove() {
    startTransition(async () => {
      const res = await removeAvatar()
      if (res.ok) {
        setPreview(null)
        showToast({ title: 'Foto eliminada', variant: 'success' })
        router.refresh()
      } else {
        showToast({ title: 'No se pudo eliminar la foto', variant: 'error' })
      }
    })
  }

  const shown = preview ?? avatarUrl

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="relative rounded-full ring-offset-background transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label="Cambiar foto de perfil"
      >
        <Avatar className={s.box}>
          {shown && <AvatarImage src={shown} alt="Foto de perfil" />}
          <AvatarFallback className={cn('bg-gradient-to-br from-violet-500 to-violet-700 font-semibold text-white', s.text)}>
            {initials}
          </AvatarFallback>
        </Avatar>

        <span className={cn(
          'absolute bottom-0 right-0 flex items-center justify-center rounded-full border-2 border-background bg-violet-500 text-white',
          s.badge,
        )}>
          {pending ? <Loader2 className={cn('animate-spin', s.icon)} /> : <Camera className={s.icon} />}
        </span>
      </button>

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      {showRemove && avatarUrl && !pending && (
        <button
          type="button"
          onClick={handleRemove}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-red-300"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Quitar foto
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/profile/AvatarUploader.tsx
git commit -m "feat(profile): componente AvatarUploader con recorte y subida" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Rediseño del topbar (`DashboardHeader`)

**Files:**
- Modify (reescritura completa): `src/components/dashboard/DashboardHeader.tsx`

- [ ] **Step 1: Reescribir el componente**

Reemplazar **todo** el contenido de `src/components/dashboard/DashboardHeader.tsx` por:

```tsx
'use client'

import { Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DevModeBanner } from '@/components/DevModeBanner'
import { AvatarUploader } from '@/components/profile/AvatarUploader'

interface Props {
  greeting:      string
  firstName:     string
  avatarUrl:     string | null
  momentumScore: number
}

// ─── Momentum chip ────────────────────────────────────────────────────────────

function getMomentumStyle(score: number) {
  if (score >= 91) return { label: 'Imparable',    classes: 'border-orange-500/30 bg-orange-500/10 text-orange-400' }
  if (score >= 76) return { label: 'Al máximo',    classes: 'border-violet-500/30 bg-violet-500/10 text-violet-400' }
  if (score >= 51) return { label: 'En forma',     classes: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400' }
  if (score >= 26) return { label: 'Construyendo', classes: 'border-blue-500/30 bg-blue-500/10 text-blue-400'      }
  return                  { label: 'Arrancando',   classes: 'border-border/40 bg-muted/20 text-muted-foreground'    }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DashboardHeader({ greeting, firstName, avatarUrl, momentumScore }: Props) {
  const initials = firstName.slice(0, 2).toUpperCase()
  const momentum = getMomentumStyle(momentumScore)

  return (
    <header className="mx-auto flex max-w-lg items-center gap-4 px-4 pb-2 pt-6">
      <AvatarUploader avatarUrl={avatarUrl} initials={initials} size="header" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-normal text-muted-foreground">{greeting},</p>
        <p className="truncate text-xl font-semibold leading-tight text-foreground">{firstName}</p>

        <div className="mt-1.5 flex items-center gap-1.5">
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
            momentum.classes,
          )}>
            <Zap className="h-2.5 w-2.5" />
            {momentumScore}
            <span className="font-semibold normal-case tracking-normal opacity-70">· {momentum.label}</span>
          </span>
        </div>
      </div>

      <DevModeBanner />
    </header>
  )
}
```

Notas: se elimina la raya (`border-b`), el `sticky`/`backdrop-blur`, el logo (mancuerna) y todo el `DropdownMenu` (con `signOut`, `PendingLink`, `Ruler`, `Settings`, `LogOut`, `Dumbbell`). El header ahora comparte el ancho `mx-auto max-w-lg px-4` con el `<main>` del dashboard.

- [ ] **Step 2: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS — `AvatarUploader` resuelve y no quedan referencias a imports eliminados (el `build` completo se valida en la Task 8).

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/DashboardHeader.tsx
git commit -m "feat(dashboard): rediseño del topbar sin raya, logo ni menú; avatar editable a la izquierda" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Renombrar "Datos personales" a `/settings/datos` y mover el nombre

**Files:**
- Move: `src/app/(app)/settings/perfil/` → `src/app/(app)/settings/datos/`
- Modify: `src/app/(app)/settings/datos/page.tsx` (quitar campo nombre)
- Modify: `src/app/actions/settings.ts` (`updatePersonalData`)
- Modify: `src/app/(app)/settings/page.tsx` (`SECTIONS`: href datos + entrada Medidas)
- Modify: `src/components/dashboard/CheckInBanner.tsx` (href)

- [ ] **Step 1: Mover la carpeta**

```bash
git mv "src/app/(app)/settings/perfil" "src/app/(app)/settings/datos"
```

- [ ] **Step 2: Quitar el campo nombre de `datos/page.tsx`**

En `src/app/(app)/settings/datos/page.tsx`, cambiar el `select` y el tipo para soltar `full_name`:

Reemplazar:
```ts
type PersonalProfile = {
  full_name: string | null
  height_cm: number | null
  weight_kg: number | null
  date_of_birth: string | null
  gender: string | null
}
```
por:
```ts
type PersonalProfile = {
  height_cm: number | null
  weight_kg: number | null
  date_of_birth: string | null
  gender: string | null
}
```

Reemplazar:
```ts
    .select('full_name, height_cm, weight_kg, date_of_birth, gender')
```
por:
```ts
    .select('height_cm, weight_kg, date_of_birth, gender')
```

Eliminar el bloque del input de nombre completo:
```tsx
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Nombre</span>
              <input
                name="fullName"
                defaultValue={profile?.full_name ?? ''}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
              />
            </label>

```
(el bloque queda eliminado; el primer campo pasa a ser la cuadrícula Altura/Peso).

- [ ] **Step 3: Actualizar `updatePersonalData` en `settings.ts`**

En `src/app/actions/settings.ts`, dentro de `updatePersonalData`:

Eliminar la línea:
```ts
      full_name: nullableText(formData, 'fullName'),
```

Reemplazar las tres rutas `/settings/perfil` por `/settings/datos`:
```ts
  if (error) redirect('/settings/datos?error=save_failed')

  revalidatePath('/settings/datos')
  revalidatePath('/dashboard')
  redirect('/settings/datos?notice=settings_saved')
```
(actualizar también el comentario de la cabecera de la función: `/settings/perfil` → `/settings/datos`).

- [ ] **Step 4: Actualizar `SECTIONS` (href datos + Medidas)**

En `src/app/(app)/settings/page.tsx`, añadir `Ruler` a los imports de `lucide-react` y actualizar `SECTIONS`:

```tsx
import { BellRing, ChevronRight, Dumbbell, Ruler, UserCog, UserRound } from 'lucide-react'
```

```tsx
const SECTIONS = [
  { href: '/settings/datos',          label: 'Datos personales', icon: UserRound },
  { href: '/settings/entrenamiento',  label: 'Entrenamiento',    icon: Dumbbell  },
  { href: '/medidas',                 label: 'Medidas',          icon: Ruler     },
  { href: '/settings/notificaciones', label: 'Notificaciones',   icon: BellRing  },
  { href: '/settings/cuenta',         label: 'Cuenta',           icon: UserCog   },
]
```
(La entrada "Perfil" se añade en la Task 7, cuando su página exista.)

- [ ] **Step 5: Actualizar el href de `CheckInBanner`**

En `src/components/dashboard/CheckInBanner.tsx`, reemplazar:
```tsx
              href="/settings/perfil"
```
por:
```tsx
              href="/settings/datos"
```

- [ ] **Step 6: Verificar tipos y que no quedan referencias colgadas**

Run: `pnpm type-check`
Expected: PASS.
Run: `git grep -n "/settings/perfil" -- src`
Expected: las únicas coincidencias son los `revalidatePath('/settings/perfil')` de `src/app/actions/avatar.ts` — referencia *hacia adelante* a la página Perfil que se crea en la Task 7. Ninguna referencia de datos físicos (settings.ts `updatePersonalData`, `page.tsx`, `CheckInBanner`) debe apuntar ya a `/settings/perfil`.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/settings/datos" "src/app/(app)/settings/page.tsx" src/app/actions/settings.ts src/components/dashboard/CheckInBanner.tsx
git commit -m "refactor(settings): mover datos físicos a /settings/datos y añadir Medidas al menú" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Nueva sección "Perfil" (foto + nombre)

**Files:**
- Create: `src/app/(app)/settings/perfil/page.tsx`
- Modify: `src/app/actions/settings.ts` (añadir `updateProfileName`)
- Modify: `src/app/(app)/settings/page.tsx` (añadir entrada "Perfil")

- [ ] **Step 1: Añadir la Server Action `updateProfileName`**

Al final de `src/app/actions/settings.ts`, añadir:

```ts
// Perfil (/settings/perfil): solo el nombre (la foto va por su propia acción).
export async function updateProfileName(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?error=auth_required')

  const { error } = await (supabase
    .from('profiles') as any)
    .update({ full_name: nullableText(formData, 'fullName') })
    .eq('id', user.id)

  if (error) redirect('/settings/perfil?error=save_failed')

  revalidatePath('/settings/perfil')
  revalidatePath('/dashboard')
  redirect('/settings/perfil?notice=settings_saved')
}
```

- [ ] **Step 2: Crear la página "Perfil"**

`src/app/(app)/settings/perfil/page.tsx`:

```tsx
import { Save, UserRound } from 'lucide-react'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { AvatarUploader } from '@/components/profile/AvatarUploader'
import { SubmitButton } from '@/components/feedback/SubmitButton'
import { requireAppUserContext } from '@/lib/auth/server'
import { updateProfileName } from '@/app/actions/settings'

export const metadata = { title: 'Perfil · FitAI' }

export default async function ProfilePage() {
  const { user, profile } = await requireAppUserContext()

  const firstName = profile?.full_name?.split(' ')[0] ?? user.email?.split('@')[0] ?? '?'
  const initials = firstName.slice(0, 2).toUpperCase()

  return (
    <SettingsScreen
      title="Perfil"
      backHref="/settings"
      backLabel="Ajustes"
      icon={<UserRound className="h-5 w-5" />}
    >
      <section className="flex flex-col items-center rounded-2xl border border-border/60 bg-muted/10 p-6">
        <AvatarUploader
          avatarUrl={profile?.avatar_url ?? null}
          initials={initials}
          size="lg"
          showRemove
        />
      </section>

      <form action={updateProfileName} className="mt-6 space-y-6">
        <section className="rounded-2xl border border-border/60 bg-muted/10 p-5">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Nombre</span>
            <input
              name="fullName"
              defaultValue={profile?.full_name ?? ''}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
            />
          </label>
        </section>

        <SubmitButton
          label="Guardar"
          pendingLabel="Guardando"
          className="h-11 w-full bg-violet-500 text-white hover:bg-violet-600"
        >
          <Save className="mr-2 h-4 w-4" />
          Guardar
        </SubmitButton>
      </form>
    </SettingsScreen>
  )
}
```

- [ ] **Step 3: Añadir "Perfil" al menú `SECTIONS`**

En `src/app/(app)/settings/page.tsx`, añadir como **primera** entrada de `SECTIONS`:

```tsx
  { href: '/settings/perfil',         label: 'Perfil',           icon: UserRound },
```

Resultado (`UserRound` ya está importado):
```tsx
const SECTIONS = [
  { href: '/settings/perfil',         label: 'Perfil',           icon: UserRound },
  { href: '/settings/datos',          label: 'Datos personales', icon: UserRound },
  { href: '/settings/entrenamiento',  label: 'Entrenamiento',    icon: Dumbbell  },
  { href: '/medidas',                 label: 'Medidas',          icon: Ruler     },
  { href: '/settings/notificaciones', label: 'Notificaciones',   icon: BellRing  },
  { href: '/settings/cuenta',         label: 'Cuenta',           icon: UserCog   },
]
```

> Nota: "Perfil" y "Datos personales" usan ambos `UserRound`. Si se quiere diferenciar el icono de "Datos personales", cámbielo aquí (p. ej. `ClipboardList`) — es puramente cosmético y no afecta a la funcionalidad.

- [ ] **Step 4: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS. `/settings/perfil` vuelve a existir (ahora "Perfil"); `/settings/datos` sigue funcionando (el `build` completo se valida en la Task 8).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/settings/perfil/page.tsx" src/app/actions/settings.ts "src/app/(app)/settings/page.tsx"
git commit -m "feat(settings): nueva sección Perfil con foto y nombre" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Verificación final

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Suite completa de checks**

Run: `pnpm test && pnpm type-check && pnpm lint && pnpm build`
Expected: todo PASS.

- [ ] **Step 2: Confirmar ejecución de la migración**

Verificar que `018_avatars_bucket.sql` (Task 1) se ejecutó en el **SQL Editor de Supabase** y que el bucket `avatars` existe (Storage → Buckets). Sin esto, la subida fallará en runtime.

- [ ] **Step 3: Verificación manual (app corriendo: `pnpm dev`)**

- [ ] Dashboard: el topbar no tiene raya divisoria, ni logo, ni menú desplegable; el avatar grande está a la izquierda con badge de cámara, y a su derecha el saludo + nombre + chip de momentum.
- [ ] Tocar el avatar abre el selector de cámara/galería; al elegir una foto se ve el cambio (toast "Foto actualizada") y persiste tras recargar.
- [ ] Barra inferior → Ajustes muestra: Perfil, Datos personales, Entrenamiento, Medidas, Notificaciones, Cuenta.
- [ ] Ajustes → Perfil: sube y quita foto (botón "Quitar foto") y edita el nombre (se refleja en el saludo del dashboard).
- [ ] Ajustes → Datos personales: ya no tiene el campo Nombre; altura/peso/nacimiento/género guardan bien.
- [ ] Ajustes → Cuenta: "Cerrar sesión" sigue funcionando.
- [ ] El banner de check-in (si aparece) enlaza a "Datos personales" en `/settings/datos`.

- [ ] **Step 4: (opcional) Probar en el WebView de Android**

`pnpm build` con export estático → `pnpm cap:sync` → `pnpm cap:android`, y comprobar que el `<input type="file">` abre el selector nativo (cámara/galería). El cambio es web-only; no requiere plugins nativos nuevos.

---

## Notas de despliegue

- **Vercel:** deploy normal (cambio web-only).
- **Supabase:** ejecutar `supabase/migrations/018_avatars_bucket.sql` en el SQL Editor.
- **APK:** no requiere recompilar (no hay plugins nativos nuevos).

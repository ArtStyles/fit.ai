# Perfiles (usernames + perfil IG) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a cada usuario un `@username` único (elegido en onboarding, backfill para existentes, editable en Ajustes) y rediseñar `/u/[username]` al estilo Instagram (cabecera con contadores + cuadrícula de posts), con "Editar perfil" en el perfil propio.

**Architecture:** Reglas de username y tipo de tile como funciones puras con tests. Acciones `checkUsernameAvailable`/`updateUsername` que leen `public_profiles` (legible por autenticados) y escriben la fila propia. Paso de username en el `OnboardingWizard` + campo en Ajustes (componente cliente con disponibilidad en vivo). Migración 023 backfillea los `username` nulos. Perfil rediseñado reutilizando `getProfile`.

**Tech Stack:** Next.js 14.2 (App Router), Supabase (Postgres + RLS), TypeScript, Tailwind, vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-06-26-perfiles-username-ig-design.md`
**Depende de:** Fases 1-2 (en `main`) + descubrimiento (rama base de esta).

---

## Estructura de archivos

- Create: `src/lib/social/username.ts` (+ `__tests__/username.test.ts`) — `normalizeUsername`, `validateUsername`.
- Create: `src/lib/social/profile.ts` (+ `__tests__/profile.test.ts`) — `postTileKind`.
- Create: `src/app/actions/username.ts` — `checkUsernameAvailable`, `updateUsername`.
- Create: `supabase/migrations/023_backfill_usernames.sql`.
- Modify: `src/app/onboarding/OnboardingWizard.tsx` — paso de username (primero).
- Create: `src/components/settings/UsernameField.tsx` — campo editable en Ajustes.
- Modify: `src/app/(app)/settings/perfil/page.tsx` — incrustar `UsernameField` + enlace "Ver mi perfil".
- Create: `src/components/social/ProfilePostGrid.tsx` — cuadrícula 3 columnas.
- Modify: `src/app/(app)/u/[username]/page.tsx` — cabecera IG + grid + "Editar perfil".
- Modify: `src/components/dashboard/DashboardHeader.tsx` (+ su render en `dashboard/page.tsx`) — nombre enlaza al perfil propio.

## Notas de ejecución

- **Gestor: `pnpm`.** Verificación: `pnpm test`, `pnpm type-check`, `pnpm build`.
- Migración `023` se aplica manual en Supabase (como las demás). Acciones se verifican con type-check.
- `getProfile` (en `src/app/actions/feed.ts`) ya devuelve `{ author, posts, followerCount, followingCount, isFollowing, isMe }`.
- `ActionResult` se importa de `@/app/actions/posts`. Estilo de query: `(supabase.from('x') as any)`.

---

## Task 1: Reglas de username (TDD)

**Files:**
- Create: `src/lib/social/username.ts`
- Test: `src/lib/social/__tests__/username.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { normalizeUsername, validateUsername } from '../username'

describe('normalizeUsername', () => {
  it('recorta y pasa a minúsculas', () => {
    expect(normalizeUsername('  ArtStyles ')).toBe('artstyles')
  })
})

describe('validateUsername', () => {
  it('acepta uno válido y devuelve el valor normalizado', () => {
    expect(validateUsername('Art_Styles')).toEqual({ ok: true, value: 'art_styles' })
  })
  it('rechaza menos de 3 caracteres', () => {
    expect(validateUsername('ab').ok).toBe(false)
  })
  it('rechaza más de 20 caracteres', () => {
    expect(validateUsername('a'.repeat(21)).ok).toBe(false)
  })
  it('rechaza si empieza por dígito', () => {
    expect(validateUsername('1abc').ok).toBe(false)
  })
  it('rechaza caracteres ilegales', () => {
    expect(validateUsername('a b').ok).toBe(false)
    expect(validateUsername('a-b').ok).toBe(false)
  })
})
```

- [ ] **Step 2: Correr (falla)**

Run: `pnpm test src/lib/social/__tests__/username.test.ts`
Expected: FAIL — import no resuelto.

- [ ] **Step 3: Implementar**

```ts
// src/lib/social/username.ts
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase()
}

export type UsernameValidation = { ok: true; value: string } | { ok: false; error: string }

export function validateUsername(raw: string): UsernameValidation {
  const value = normalizeUsername(raw)
  if (value.length < 3) return { ok: false, error: 'Mínimo 3 caracteres.' }
  if (value.length > 20) return { ok: false, error: 'Máximo 20 caracteres.' }
  if (!/^[a-z][a-z0-9_]*$/.test(value)) {
    return { ok: false, error: 'Empieza por una letra; solo minúsculas, números y _.' }
  }
  return { ok: true, value }
}
```

- [ ] **Step 4: Correr (pasa)**

Run: `pnpm test src/lib/social/__tests__/username.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/username.ts src/lib/social/__tests__/username.test.ts
git commit -m "feat(social): reglas puras de username (normalize/validate)"
```

---

## Task 2: `postTileKind` (TDD)

**Files:**
- Create: `src/lib/social/profile.ts`
- Test: `src/lib/social/__tests__/profile.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { postTileKind } from '../profile'

const base = { photo_urls: [] as string[], session_snapshot: null as any, routine_snapshot: null as any }

describe('postTileKind', () => {
  it('foto tiene prioridad', () => {
    expect(postTileKind({ ...base, photo_urls: ['u'], session_snapshot: {} as any })).toBe('photo')
  })
  it('sesión cuando no hay foto', () => {
    expect(postTileKind({ ...base, session_snapshot: {} as any })).toBe('session')
  })
  it('rutina cuando no hay foto ni sesión', () => {
    expect(postTileKind({ ...base, routine_snapshot: {} as any })).toBe('routine')
  })
  it('texto por defecto', () => {
    expect(postTileKind(base)).toBe('text')
  })
})
```

- [ ] **Step 2: Correr (falla)**

Run: `pnpm test src/lib/social/__tests__/profile.test.ts`
Expected: FAIL — import no resuelto.

- [ ] **Step 3: Implementar**

```ts
// src/lib/social/profile.ts
import type { FeedPost } from './types'

export type TileKind = 'photo' | 'session' | 'routine' | 'text'

export function postTileKind(
  post: Pick<FeedPost, 'photo_urls' | 'session_snapshot' | 'routine_snapshot'>,
): TileKind {
  if (post.photo_urls && post.photo_urls.length > 0) return 'photo'
  if (post.session_snapshot) return 'session'
  if (post.routine_snapshot) return 'routine'
  return 'text'
}
```

- [ ] **Step 4: Correr (pasa)**

Run: `pnpm test src/lib/social/__tests__/profile.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/profile.ts src/lib/social/__tests__/profile.test.ts
git commit -m "feat(social): postTileKind puro para la cuadrícula del perfil"
```

---

## Task 3: Acciones de username

**Files:**
- Create: `src/app/actions/username.ts`

- [ ] **Step 1: Implementar**

```ts
// src/app/actions/username.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { validateUsername } from '@/lib/social/username'
import type { ActionResult } from './posts'

export async function checkUsernameAvailable(raw: string): Promise<{ available: boolean; error?: string }> {
  const v = validateUsername(raw)
  if (!v.ok) return { available: false, error: v.error }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { available: false, error: 'Sesión no válida.' }

  const { data } = await (supabase.from('public_profiles') as any)
    .select('id').eq('username', v.value).neq('id', user.id).maybeSingle() as { data: { id: string } | null }
  return { available: !data }
}

export async function updateUsername(raw: string): Promise<ActionResult> {
  const v = validateUsername(raw)
  if (!v.ok) return { ok: false, error: v.error }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const { data: taken } = await (supabase.from('public_profiles') as any)
    .select('id').eq('username', v.value).neq('id', user.id).maybeSingle() as { data: { id: string } | null }
  if (taken) return { ok: false, error: 'Ese nombre de usuario ya está en uso.' }

  const { error } = await (supabase.from('profiles') as any)
    .update({ username: v.value }).eq('id', user.id)
  if (error) return { ok: false, error: 'Ese nombre de usuario ya está en uso.' }

  revalidatePath('/settings/perfil')
  return { ok: true }
}
```

- [ ] **Step 2: Verificar**

Run: `pnpm type-check`
Expected: PASS.
Run: `pnpm test`
Expected: PASS (sin regresión).

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/username.ts
git commit -m "feat(social): acciones checkUsernameAvailable/updateUsername"
```

---

## Task 4: Migración de backfill de usernames

**Files:**
- Create: `supabase/migrations/023_backfill_usernames.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- 023_backfill_usernames.sql
-- Asigna username a los perfiles que aún no tienen (username IS NULL).
-- Formato: user_<12 hex del id> — válido (empieza por letra, [a-z0-9_], longitud 17 <= 20)
-- y único (derivado del id). El usuario puede cambiarlo luego en Ajustes.

UPDATE profiles
SET username = 'user_' || substr(replace(id::text, '-', ''), 1, 12)
WHERE username IS NULL;
```

- [ ] **Step 2: Aplicar y verificar**

Aplicar en Supabase → SQL Editor. Verificar:
```sql
SELECT count(*) AS sin_username FROM profiles WHERE username IS NULL;
```
Esperado: `0`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/023_backfill_usernames.sql
git commit -m "feat(social): backfill de usernames para perfiles existentes"
```

---

## Task 5: Paso de username en el onboarding

**Files:**
- Modify: `src/app/onboarding/OnboardingWizard.tsx`

El wizard usa un union `StepKey`, `buildSteps()`, un `stepMap` y `StepShell` (back + heading + CTA). Añadimos `'username'` como **primer** paso. A diferencia de los demás (que guardan en estado local), este valida disponibilidad y guarda en servidor con `updateUsername` antes de avanzar.

- [ ] **Step 1: Imports y tipo de paso**

Añadir `Loader2` al import de `lucide-react` (junto a `ArrowLeft, Check, Dumbbell`), y añadir estos imports nuevos al inicio:
```ts
import { checkUsernameAvailable, updateUsername } from '@/app/actions/username'
import { validateUsername } from '@/lib/social/username'
```
Cambiar el tipo `StepKey` para incluir `'username'`:
```ts
type StepKey =
  | 'username' | 'goal' | 'level' | 'days' | 'duration'
  | 'location' | 'equipment' | 'injuries' | 'physical'
  | 'generating'
```
Y en `buildSteps`, anteponer `'username'`:
```ts
function buildSteps(answers: OnboardingAnswers): StepKey[] {
  const base: StepKey[] = ['username', 'goal', 'level', 'days', 'duration', 'location']
  if (answers.gym_type === 'home_basic' || answers.gym_type === 'full_gym') {
    base.push('equipment')
  }
  return [...base, 'injuries', 'physical', 'generating']
}
```

- [ ] **Step 2: Componente del paso**

Añadir junto a los demás `StepX` (antes de `Step1Goal`):
```tsx
function Step0Username({ onNext, onBack, isFirst }: StepProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const reqId = useRef(0)

  useEffect(() => {
    setAvailable(null)
    const v = validateUsername(value)
    if (!v.ok) { setError(value ? v.error : null); setChecking(false); return }
    setError(null)
    setChecking(true)
    const id = ++reqId.current
    const t = setTimeout(async () => {
      const res = await checkUsernameAvailable(v.value)
      if (id !== reqId.current) return
      setAvailable(res.available)
      if (!res.available) setError(res.error ?? 'Ese nombre de usuario ya está en uso.')
      setChecking(false)
    }, 350)
    return () => clearTimeout(t)
  }, [value])

  const canProceed = available === true && !checking && !saving

  async function handleNext() {
    setSaving(true)
    const res = await updateUsername(value)
    setSaving(false)
    if (res.ok) onNext()
    else setError(res.error)
  }

  return (
    <StepShell
      title="Elige tu nombre de usuario"
      subtitle="Así te encontrarán y verán tu perfil. Podrás cambiarlo más adelante."
      isFirst={isFirst} onNext={handleNext} onBack={onBack}
      canProceed={canProceed}
      ctaLabel={saving ? 'Guardando…' : 'Continuar'}
    >
      <div className="space-y-2">
        <div className="flex items-center rounded-xl border-2 border-border bg-muted/20 px-4">
          <span className="text-muted-foreground">@</span>
          <input
            value={value}
            onChange={e => setValue(e.target.value)}
            autoFocus
            autoCapitalize="none"
            maxLength={20}
            placeholder="tu_usuario"
            className="h-12 flex-1 bg-transparent px-2 text-base text-foreground outline-none placeholder:text-muted-foreground/40"
          />
          {checking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {!checking && available === true && <Check className="h-4 w-4 text-green-500" />}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {!error && available === true && <p className="text-xs text-green-500">Disponible</p>}
      </div>
    </StepShell>
  )
}
```

- [ ] **Step 3: Default + stepMap**

Cambiar el estado inicial del paso:
```ts
const [stepKey, setStepKey] = useState<StepKey>('username')
```
Añadir la entrada en `stepMap`:
```tsx
  const stepMap: Record<StepKey, React.ReactNode> = {
    username:   <Step0Username  {...stepProps} />,
    goal:       <Step1Goal      {...stepProps} />,
    level:      <Step2Level     {...stepProps} />,
    days:       <Step3Days      {...stepProps} />,
    duration:   <Step4Duration  {...stepProps} />,
    location:   <Step5Location  {...stepProps} />,
    equipment:  <Step6Equipment {...stepProps} />,
    injuries:   <Step7Injuries  {...stepProps} />,
    physical:   <Step8Physical  {...stepProps} />,
    generating: <Step9GeneratingAuto onFinish={handleFinish} />,
  }
```

- [ ] **Step 4: Verificar**

Run: `pnpm type-check`
Expected: PASS.
Run: `pnpm build`
Expected: compila.

- [ ] **Step 5: Commit**

```bash
git add src/app/onboarding/OnboardingWizard.tsx
git commit -m "feat(social): paso de username en el onboarding"
```

---

## Task 6: Campo de username en Ajustes + enlace "Ver mi perfil"

**Files:**
- Create: `src/components/settings/UsernameField.tsx`
- Modify: `src/app/(app)/settings/perfil/page.tsx`

- [ ] **Step 1: Componente `UsernameField`**

```tsx
// src/components/settings/UsernameField.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Check } from 'lucide-react'
import { checkUsernameAvailable, updateUsername } from '@/app/actions/username'
import { validateUsername } from '@/lib/social/username'
import { useToast } from '@/components/feedback/ToastProvider'

export function UsernameField({ initialUsername }: { initialUsername: string }) {
  const [value, setValue] = useState(initialUsername)
  const [error, setError] = useState<string | null>(null)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const reqId = useRef(0)
  const { showToast } = useToast()

  useEffect(() => {
    if (value === initialUsername) { setAvailable(null); setError(null); setChecking(false); return }
    setAvailable(null)
    const v = validateUsername(value)
    if (!v.ok) { setError(v.error); setChecking(false); return }
    setError(null)
    setChecking(true)
    const id = ++reqId.current
    const t = setTimeout(async () => {
      const res = await checkUsernameAvailable(v.value)
      if (id !== reqId.current) return
      setAvailable(res.available)
      if (!res.available) setError(res.error ?? 'Ese nombre de usuario ya está en uso.')
      setChecking(false)
    }, 350)
    return () => clearTimeout(t)
  }, [value, initialUsername])

  const changed = value !== initialUsername
  const canSave = changed && available === true && !checking && !saving

  async function save() {
    setSaving(true)
    const res = await updateUsername(value)
    setSaving(false)
    if (res.ok) { showToast({ title: 'Nombre de usuario actualizado.', variant: 'success' }); setAvailable(null) }
    else { setError(res.error); showToast({ title: res.error, variant: 'error' }) }
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-muted/10 p-5">
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Nombre de usuario</span>
        <div className="flex items-center rounded-md border border-input bg-background px-3">
          <span className="text-muted-foreground">@</span>
          <input
            value={value}
            onChange={e => setValue(e.target.value)}
            autoCapitalize="none"
            maxLength={20}
            className="h-10 flex-1 bg-transparent px-2 text-sm text-foreground outline-none"
          />
          {checking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {!checking && changed && available === true && <Check className="h-4 w-4 text-green-500" />}
        </div>
      </label>
      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
      <button
        type="button"
        onClick={save}
        disabled={!canSave}
        className="mt-3 h-10 rounded-md bg-violet-500 px-4 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50"
      >
        {saving ? 'Guardando…' : 'Guardar usuario'}
      </button>
    </section>
  )
}
```

- [ ] **Step 2: Incrustar en la página de perfil**

En `src/app/(app)/settings/perfil/page.tsx`: importar el componente y un `Link`, y renderizar `UsernameField` (con `initialUsername`) y un enlace "Ver mi perfil" (si hay username). Añadir los imports:
```tsx
import Link from 'next/link'
import { UsernameField } from '@/components/settings/UsernameField'
```
Insertar, justo después del `<section>` del `AvatarUploader` y antes del `<form action={updateProfileName}>`:
```tsx
      <div className="mt-6">
        <UsernameField initialUsername={profile?.username ?? ''} />
      </div>
      {profile?.username && (
        <Link
          href={`/u/${profile.username}`}
          className="mt-3 flex h-10 items-center justify-center rounded-md border border-border/60 text-sm font-medium text-foreground"
        >
          Ver mi perfil
        </Link>
      )}
```

- [ ] **Step 3: Verificar**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/UsernameField.tsx "src/app/(app)/settings/perfil/page.tsx"
git commit -m "feat(social): editar username en Ajustes + enlace Ver mi perfil"
```

---

## Task 7: `ProfilePostGrid` + rediseño IG del perfil

**Files:**
- Create: `src/components/social/ProfilePostGrid.tsx`
- Modify: `src/app/(app)/u/[username]/page.tsx`

- [ ] **Step 1: `ProfilePostGrid`**

```tsx
// src/components/social/ProfilePostGrid.tsx
import Link from 'next/link'
import { Dumbbell, ClipboardList, AlignLeft } from 'lucide-react'
import type { FeedPost } from '@/lib/social/types'
import { postTileKind } from '@/lib/social/profile'

export function ProfilePostGrid({ posts }: { posts: FeedPost[] }) {
  if (posts.length === 0) {
    return <p className="px-4 py-16 text-center text-sm text-muted-foreground">Sin publicaciones todavía.</p>
  }
  return (
    <div className="grid grid-cols-3 gap-0.5">
      {posts.map(post => {
        const kind = postTileKind(post)
        return (
          <Link key={post.id} href={`/post/${post.id}`} className="relative aspect-square overflow-hidden bg-muted/20">
            {kind === 'photo' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.photo_urls[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-muted-foreground">
                {kind === 'session' && <Dumbbell className="h-6 w-6" />}
                {kind === 'routine' && <ClipboardList className="h-6 w-6" />}
                {kind === 'text' && <AlignLeft className="h-6 w-6" />}
                <span className="text-[10px]">
                  {kind === 'session' ? 'Sesión' : kind === 'routine' ? 'Rutina' : 'Texto'}
                </span>
              </div>
            )}
          </Link>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Reescribir la página de perfil**

```tsx
// src/app/(app)/u/[username]/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getProfile } from '@/app/actions/feed'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { FollowButton } from '@/components/social/FollowButton'
import { ProfilePostGrid } from '@/components/social/ProfilePostGrid'

export default async function PublicProfilePage({ params }: { params: { username: string } }) {
  const { username } = params
  const { author, posts, followerCount, followingCount, isFollowing, isMe } = await getProfile(username)
  if (!author) notFound()

  const name = author.full_name || author.username || 'Usuario'

  return (
    <div className="mx-auto max-w-lg pb-24">
      <header className="border-b border-border/40 px-4 py-6">
        <div className="flex items-center gap-5">
          <Avatar className="h-20 w-20">
            {author.avatar_url && <AvatarImage src={author.avatar_url} alt={name} />}
            <AvatarFallback className="text-2xl">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex flex-1 justify-around text-center">
            <div><div className="text-lg font-bold">{posts.length}</div><div className="text-xs text-muted-foreground">publicaciones</div></div>
            <div><div className="text-lg font-bold">{followerCount}</div><div className="text-xs text-muted-foreground">seguidores</div></div>
            <div><div className="text-lg font-bold">{followingCount}</div><div className="text-xs text-muted-foreground">siguiendo</div></div>
          </div>
        </div>

        <div className="mt-3">
          <p className="text-sm font-semibold">{name}</p>
          {author.username && <p className="text-sm text-muted-foreground">@{author.username}</p>}
        </div>

        <div className="mt-4">
          {isMe ? (
            <Link href="/settings/perfil" className="flex h-10 w-full items-center justify-center rounded-lg border border-border text-sm font-medium">
              Editar perfil
            </Link>
          ) : (
            <FollowButton targetId={author.id} initialFollowing={isFollowing} />
          )}
        </div>
      </header>

      <ProfilePostGrid posts={posts} />
    </div>
  )
}
```

- [ ] **Step 3: Verificar**

Run: `pnpm type-check`
Expected: PASS.
Run: `pnpm build`
Expected: compila; `/u/[username]` dinámica.

- [ ] **Step 4: Commit**

```bash
git add src/components/social/ProfilePostGrid.tsx "src/app/(app)/u/[username]/page.tsx"
git commit -m "feat(social): perfil estilo IG (cabecera + cuadrícula) y Editar perfil"
```

---

## Task 8: Entrada al perfil propio desde el dashboard

**Files:**
- Modify: `src/components/dashboard/DashboardHeader.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx` (pasar `username`)

El avatar del header es un `AvatarUploader` (cambia la foto), así que **no** se reutiliza para navegar. En su lugar, el **nombre** enlaza al perfil propio.

- [ ] **Step 1: Aceptar `username` y enlazar el nombre**

En `src/components/dashboard/DashboardHeader.tsx`: añadir `import Link from 'next/link'`, añadir `username: string | null` a `Props`, y envolver el nombre (`firstName`) en un `Link` cuando haya username:
```tsx
        {username ? (
          <Link href={`/u/${username}`} className="truncate text-xl font-semibold leading-tight text-foreground hover:underline">
            {firstName}
          </Link>
        ) : (
          <p className="truncate text-xl font-semibold leading-tight text-foreground">{firstName}</p>
        )}
```
(Reemplaza el `<p>` actual del nombre; mantén el resto igual.)

- [ ] **Step 2: Pasar `username` desde la página**

En `src/app/(app)/dashboard/page.tsx`, donde se renderiza `<DashboardHeader ... />`, añadir la prop `username={profile?.username ?? null}` (el `profile` ya se carga en esa página vía `requireAppUserContext`/consulta existente — leer el archivo y usar la variable de perfil disponible).

- [ ] **Step 3: Verificar**

Run: `pnpm type-check`
Expected: PASS.
Run: `pnpm build`
Expected: compila.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/DashboardHeader.tsx "src/app/(app)/dashboard/page.tsx"
git commit -m "feat(social): el nombre del dashboard enlaza al perfil propio"
```

---

## Task 9: Verificación final + checklist

**Files:** (sin cambios; verificación)

- [ ] **Step 1: Suite + type-check + build**

Run: `pnpm test && pnpm type-check && pnpm build`
Expected: todos los tests PASS (incl. `username` y `profile`), type-check limpio, build compila.

- [ ] **Step 2: Checklist manual** (con la migración 023 aplicada)

- [ ] En un alta nueva, el **primer paso** del onboarding pide @usuario: rechaza inválidos y los ya tomados, muestra "Disponible", y al continuar queda guardado.
- [ ] Tras aplicar 023, los usuarios existentes tienen username y `/u/<username>` abre su perfil.
- [ ] Editar el username en Ajustes → Perfil funciona (valida + disponibilidad + toast).
- [ ] El enlace "Ver mi perfil" y el nombre del dashboard abren `/u/<tu-username>`.
- [ ] El perfil muestra cabecera IG (contadores) + cuadrícula 3 columnas; tocar un tile abre el post.
- [ ] En tu propio perfil sale "Editar perfil"; en el de otro, "Seguir".
- [ ] Tiles: foto→miniatura; sesión/rutina/texto→icono + etiqueta.

- [ ] **Step 3: Commit (si hubo ajustes)**

```bash
git add -A
git commit -m "test(social): verificación de perfiles (usernames + perfil IG)"
```

---

## Self-Review (cobertura del spec)

- Reglas de username (puras, TDD) → Task 1.
- `postTileKind` (puro, TDD) → Task 2.
- `checkUsernameAvailable`/`updateUsername` → Task 3.
- Backfill migración 023 → Task 4.
- Paso de username en onboarding → Task 5.
- Editar en Ajustes + "Ver mi perfil" → Task 6.
- Cuadrícula + cabecera IG + "Editar perfil" → Task 7.
- Entrada desde dashboard → Task 8.
- Testing → Tasks 1, 2, 9.

**Fuera de alcance (correcto):** cuentas privadas, bios/enlaces, validar username en el form crudo de signup, NOT NULL en username.

# Cuentas Privadas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuentas privadas opcionales: toggle en Ajustes, seguir a una privada = solicitud que el dueño aprueba/rechaza (campana en `/feed` → `/solicitudes`), contenido privado visible solo para seguidores aceptados (RLS), y perfil privado con contadores + banner.

**Architecture:** `profiles.is_private` + `post_count` (trigger) y `follows.status` (accepted/pending) en la migración 024. El RLS de `posts` gana una regla de privacidad que consulta `public_profiles.is_private` (vista owner-security, evita el RLS solo-dueño de `profiles`) y `follows`. Acciones para privacidad/solicitudes; `getProfile`/feeds/búsqueda se vuelven privacy-aware; `FollowButton` se refactoriza a estados.

**Tech Stack:** Next.js 14.2 (App Router), Supabase (Postgres + RLS), TypeScript, Tailwind, vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-06-26-cuentas-privadas-design.md`
**Depende de:** Fases 1-2 + descubrimiento + perfiles (en `main`).

---

## Estructura de archivos

- Create: `supabase/migrations/024_private_accounts.sql`.
- Modify: `src/types/database.ts` — `profiles` (+is_private,+post_count), `follows` (+status), `public_profiles` (+is_private,+post_count).
- Create: `src/lib/social/follow.ts` (+ test) — `FollowState`, `followButtonState`.
- Modify: `src/app/actions/follows.ts` — `followUser` (status), `getFollowRequests`, `acceptFollowRequest`, `rejectFollowRequest`, `getPendingRequestCount`.
- Modify: `src/app/actions/settings.ts` — `setPrivacy`.
- Modify: `src/app/actions/feed.ts` — `getProfile` (privacy-aware), `getFollowingFeed` (accepted).
- Modify: `src/app/actions/users.ts` — `searchUsers`/`getSuggestedUsers` con `isPrivate`+`followState`.
- Modify: `src/lib/social/types.ts` — `SuggestedUser` (isPrivate + followState).
- Modify: `src/components/social/FollowButton.tsx` — estados.
- Modify: `src/components/social/UserRow.tsx` — props del FollowButton.
- Create: `src/components/settings/PrivacyToggle.tsx` + montar en `/settings/perfil`.
- Modify: `src/app/(app)/feed/page.tsx` — campana con badge.
- Create: `src/app/(app)/solicitudes/page.tsx` + `src/components/social/RequestRow.tsx`.
- Create: `src/components/social/PrivateProfileNotice.tsx` + modificar `src/app/(app)/u/[username]/page.tsx`.

## Notas de ejecución

- **Gestor `pnpm`.** Verificación: `pnpm test`, `pnpm type-check`, `pnpm build`.
- Migración `024` manual en Supabase. **Orden interno crítico:** recrear `public_profiles` ANTES de la política de `posts` (que la referencia).
- `ActionResult` de `@/app/actions/posts`. Estilo `(supabase.from('x') as any)`.

---

## Task 1: Migración 024 + tipos

**Files:**
- Create: `supabase/migrations/024_private_accounts.sql`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Escribir la migración** (respeta el orden de bloques)

```sql
-- 024_private_accounts.sql
-- Cuentas privadas: is_private + post_count en profiles, status en follows,
-- RLS de posts por privacidad. Ejecutar en Supabase → SQL Editor.

-- 1) profiles: columnas
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS post_count INTEGER NOT NULL DEFAULT 0;

-- 2) follows: estado
ALTER TABLE follows ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'accepted'
  CHECK (status IN ('accepted','pending'));
CREATE INDEX IF NOT EXISTS idx_follows_following_status ON follows(following_id, status);

-- 3) backfill post_count
UPDATE profiles p SET post_count = (
  SELECT count(*) FROM posts po WHERE po.user_id = p.id AND po.removed_at IS NULL
);

-- 4) trigger post_count (SECURITY DEFINER, como los contadores de likes/comentarios)
CREATE OR REPLACE FUNCTION bump_profile_post_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE profiles SET post_count = post_count + 1 WHERE id = NEW.user_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE profiles SET post_count = GREATEST(post_count - 1, 0) WHERE id = OLD.user_id;
  END IF;
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS trg_posts_profile_count ON posts;
CREATE TRIGGER trg_posts_profile_count
  AFTER INSERT OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION bump_profile_post_count();

-- 5) recrear public_profiles con las columnas nuevas (ANTES de la política de posts)
DROP VIEW IF EXISTS public_profiles;
CREATE VIEW public_profiles AS
  SELECT id, username, full_name, avatar_url, is_private, post_count FROM profiles;
GRANT SELECT ON public_profiles TO authenticated;

-- 6) RLS de posts: añade la regla de privacidad
DROP POLICY IF EXISTS "posts: read visible" ON posts;
CREATE POLICY "posts: read visible" ON posts
  FOR SELECT TO authenticated
  USING (
    removed_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM user_blocks b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = posts.user_id)
         OR (b.blocker_id = posts.user_id AND b.blocked_id = auth.uid())
    )
    AND (
      auth.uid() = posts.user_id
      OR EXISTS (SELECT 1 FROM public_profiles pp WHERE pp.id = posts.user_id AND pp.is_private = FALSE)
      OR EXISTS (
        SELECT 1 FROM follows f
        WHERE f.follower_id = auth.uid() AND f.following_id = posts.user_id AND f.status = 'accepted'
      )
    )
  );

-- 7) follows: el seguido puede aceptar (UPDATE) o rechazar (DELETE)
CREATE POLICY "follows: followed can accept" ON follows
  FOR UPDATE TO authenticated
  USING (auth.uid() = following_id) WITH CHECK (auth.uid() = following_id);
CREATE POLICY "follows: followed can reject" ON follows
  FOR DELETE TO authenticated USING (auth.uid() = following_id);
```

- [ ] **Step 2: Tipos en `database.ts`**

En `profiles.Row` añadir `is_private: boolean` y `post_count: number`; en `profiles.Insert` añadir `is_private?: boolean` y `post_count?: number`. En `follows.Row` añadir `status: 'accepted' | 'pending'`; en `follows.Insert` añadir `status?: 'accepted' | 'pending'`. En `public_profiles.Row` añadir `is_private: boolean` y `post_count: number`.

- [ ] **Step 3: Verificar y aplicar**

Run: `pnpm type-check`
Expected: PASS.
Aplicar el SQL en Supabase → SQL Editor. Verificar:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name='public_profiles' ORDER BY column_name;
SELECT policyname FROM pg_policies WHERE tablename='follows' ORDER BY policyname;
```
Esperado: la vista incluye `is_private, post_count`; follows tiene las políticas accept/reject + las previas.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/024_private_accounts.sql src/types/database.ts
git commit -m "feat(social): migración cuentas privadas (is_private, post_count, follows.status, RLS)"
```

---

## Task 2: `followButtonState` (TDD)

**Files:**
- Create: `src/lib/social/follow.ts`
- Test: `src/lib/social/__tests__/follow.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { followButtonState } from '../follow'

describe('followButtonState', () => {
  it('accepted → following', () => {
    expect(followButtonState({ isPrivate: true, status: 'accepted' })).toBe('following')
    expect(followButtonState({ isPrivate: false, status: 'accepted' })).toBe('following')
  })
  it('pending → requested', () => {
    expect(followButtonState({ isPrivate: true, status: 'pending' })).toBe('requested')
  })
  it('none + privada → request', () => {
    expect(followButtonState({ isPrivate: true, status: 'none' })).toBe('request')
  })
  it('none + pública → follow', () => {
    expect(followButtonState({ isPrivate: false, status: 'none' })).toBe('follow')
  })
})
```

- [ ] **Step 2: Correr (falla)**

Run: `pnpm test src/lib/social/__tests__/follow.test.ts`
Expected: FAIL — import no resuelto.

- [ ] **Step 3: Implementar**

```ts
// src/lib/social/follow.ts
export type FollowState = 'follow' | 'request' | 'requested' | 'following'

export function followButtonState(
  input: { isPrivate: boolean; status: 'none' | 'pending' | 'accepted' },
): FollowState {
  if (input.status === 'accepted') return 'following'
  if (input.status === 'pending') return 'requested'
  return input.isPrivate ? 'request' : 'follow'
}
```

- [ ] **Step 4: Correr (pasa)**

Run: `pnpm test src/lib/social/__tests__/follow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/follow.ts src/lib/social/__tests__/follow.test.ts
git commit -m "feat(social): followButtonState puro"
```

---

## Task 3: Acciones de privacidad y solicitudes

**Files:**
- Modify: `src/app/actions/follows.ts`
- Modify: `src/app/actions/settings.ts`
- Modify: `src/lib/social/types.ts`

- [ ] **Step 1: Tipo `RequestUser`**

En `src/lib/social/types.ts` añadir al final:
```ts
export type RequestUser = PostAuthor & { isPrivate: boolean }
```
(Reusable para la lista de solicitudes; el solicitante es un `PostAuthor`.)

- [ ] **Step 2: Reescribir `follows.ts`**

```ts
// src/app/actions/follows.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from './posts'
import type { PostAuthor, RequestUser } from '@/lib/social/types'

export async function followUser(targetId: string): Promise<ActionResult<{ status: 'pending' | 'accepted' }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }
  if (targetId === user.id) return { ok: false, error: 'No puedes seguirte a ti mismo.' }

  const { data: target } = await (supabase.from('public_profiles') as any)
    .select('is_private').eq('id', targetId).maybeSingle() as { data: { is_private: boolean } | null }
  const status: 'pending' | 'accepted' = target?.is_private ? 'pending' : 'accepted'

  const { error } = await (supabase.from('follows') as any)
    .upsert({ follower_id: user.id, following_id: targetId, status })
  if (error) return { ok: false, error: 'No se pudo seguir.' }

  revalidatePath('/feed')
  return { ok: true, status }
}

export async function unfollowUser(targetId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const { error } = await (supabase.from('follows') as any)
    .delete().eq('follower_id', user.id).eq('following_id', targetId)
  if (error) return { ok: false, error: 'No se pudo actualizar.' }

  revalidatePath('/feed')
  return { ok: true }
}

export async function getPendingRequestCount(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  const { count } = await (supabase.from('follows') as any)
    .select('*', { count: 'exact', head: true })
    .eq('following_id', user.id).eq('status', 'pending') as { count: number | null }
  return count ?? 0
}

export async function getFollowRequests(): Promise<RequestUser[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: rows } = await (supabase.from('follows') as any)
    .select('follower_id').eq('following_id', user.id).eq('status', 'pending')
    .order('created_at', { ascending: false }) as { data: { follower_id: string }[] | null }
  const ids = (rows ?? []).map(r => r.follower_id)
  if (ids.length === 0) return []

  const { data: profiles } = await (supabase.from('public_profiles') as any)
    .select('id, username, full_name, avatar_url, is_private').in('id', ids) as {
      data: (PostAuthor & { is_private: boolean })[] | null
    }
  const byId = new Map((profiles ?? []).map(p => [p.id, p]))
  return ids
    .map(id => byId.get(id))
    .filter((p): p is PostAuthor & { is_private: boolean } => !!p)
    .map(p => ({ id: p.id, username: p.username, full_name: p.full_name, avatar_url: p.avatar_url, isPrivate: p.is_private }))
}

export async function acceptFollowRequest(followerId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }
  const { error } = await (supabase.from('follows') as any)
    .update({ status: 'accepted' })
    .eq('follower_id', followerId).eq('following_id', user.id).eq('status', 'pending')
  if (error) return { ok: false, error: 'No se pudo aceptar.' }
  revalidatePath('/solicitudes'); revalidatePath('/feed')
  return { ok: true }
}

export async function rejectFollowRequest(followerId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }
  const { error } = await (supabase.from('follows') as any)
    .delete().eq('follower_id', followerId).eq('following_id', user.id).eq('status', 'pending')
  if (error) return { ok: false, error: 'No se pudo rechazar.' }
  revalidatePath('/solicitudes')
  return { ok: true }
}
```

- [ ] **Step 3: `setPrivacy` en `settings.ts`**

Leer `src/app/actions/settings.ts` (tiene `updateProfileName`). Añadir:
```ts
import type { ActionResult } from './posts'

export async function setPrivacy(isPrivate: boolean): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }
  const { error } = await (supabase.from('profiles') as any)
    .update({ is_private: isPrivate }).eq('id', user.id)
  if (error) return { ok: false, error: 'No se pudo actualizar la privacidad.' }
  revalidatePath('/settings/perfil')
  return { ok: true }
}
```
(Si `createClient`/`revalidatePath` no están importados en ese archivo, añadirlos.)

- [ ] **Step 4: Verificar**

Run: `pnpm type-check`
Expected: PASS.
Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/follows.ts src/app/actions/settings.ts src/lib/social/types.ts
git commit -m "feat(social): acciones de privacidad y solicitudes de seguimiento"
```

---

## Task 4: `getProfile` y `getFollowingFeed` privacy-aware

**Files:**
- Modify: `src/app/actions/feed.ts`

- [ ] **Step 1: Reescribir `getProfile`**

Reemplazar la función `getProfile` por:
```ts
export async function getProfile(username: string): Promise<{
  author: PostAuthor | null
  posts: FeedPost[]
  postCount: number
  followerCount: number
  followingCount: number
  followState: import('@/lib/social/follow').FollowState
  isPrivate: boolean
  canViewPosts: boolean
  isMe: boolean
}> {
  const empty = {
    author: null, posts: [], postCount: 0, followerCount: 0, followingCount: 0,
    followState: 'follow' as import('@/lib/social/follow').FollowState,
    isPrivate: false, canViewPosts: false, isMe: false,
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return empty

  const { data: author } = await (supabase.from('public_profiles') as any)
    .select('id, username, full_name, avatar_url, is_private, post_count').eq('username', username).maybeSingle() as {
      data: (PostAuthor & { is_private: boolean; post_count: number }) | null
    }
  if (!author) return empty

  const isMe = author.id === user.id
  const isPrivate = author.is_private

  // estado de seguimiento del visitante hacia el autor
  let status: 'none' | 'pending' | 'accepted' = 'none'
  if (!isMe) {
    const { data: rel } = await (supabase.from('follows') as any)
      .select('status').eq('follower_id', user.id).eq('following_id', author.id).maybeSingle() as {
        data: { status: 'pending' | 'accepted' } | null
      }
    if (rel) status = rel.status
  }
  const { followButtonState } = await import('@/lib/social/follow')
  const followState = followButtonState({ isPrivate, status })

  const canViewPosts = !isPrivate || isMe || status === 'accepted'

  let posts: FeedPost[] = []
  if (canViewPosts) {
    const { data: rows } = await (supabase.from('posts') as any)
      .select(POST_COLS).eq('user_id', author.id)
      .order('created_at', { ascending: false }).limit(60) as { data: PostRow[] | null }
    const page = rows ?? []
    const authors = new Map([[author.id, { id: author.id, username: author.username, full_name: author.full_name, avatar_url: author.avatar_url }]])
    const liked = await loadMyLikes(supabase, user.id, page.map(r => r.id))
    posts = page.map(r => toFeedPost(r, authors, liked, user.id))
  }

  const [{ count: followerCount }, { count: followingCount }] = await Promise.all([
    (supabase.from('follows') as any).select('*', { count: 'exact', head: true }).eq('following_id', author.id).eq('status', 'accepted') as Promise<{ count: number | null }>,
    (supabase.from('follows') as any).select('*', { count: 'exact', head: true }).eq('follower_id', author.id).eq('status', 'accepted') as Promise<{ count: number | null }>,
  ])

  const authorPublic: PostAuthor = {
    id: author.id, username: author.username, full_name: author.full_name, avatar_url: author.avatar_url,
  }
  return {
    author: authorPublic, posts,
    postCount: author.post_count,
    followerCount: followerCount ?? 0,
    followingCount: followingCount ?? 0,
    followState, isPrivate, canViewPosts, isMe,
  }
}
```

- [ ] **Step 2: `getFollowingFeed` solo `accepted`**

En `getFollowingFeed`, la consulta de ids seguidos añade el filtro de estado:
```ts
  const { data: followRows } = await (supabase.from('follows') as any)
    .select('following_id').eq('follower_id', user.id).eq('status', 'accepted') as {
      data: { following_id: string }[] | null
    }
```
(El resto de la función queda igual.)

- [ ] **Step 3: Verificar**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/feed.ts
git commit -m "feat(social): getProfile/getFollowingFeed conscientes de privacidad"
```

---

## Task 5: Búsqueda con `isPrivate` + `followState`

**Files:**
- Modify: `src/lib/social/types.ts`
- Modify: `src/app/actions/users.ts`

- [ ] **Step 1: `SuggestedUser`**

En `src/lib/social/types.ts` reemplazar la definición de `SuggestedUser`:
```ts
import type { FollowState } from './follow'
export type SuggestedUser = PostAuthor & { isPrivate: boolean; followState: FollowState }
```

- [ ] **Step 2: Actualizar `users.ts`**

`loadFollowingSet` pasa a devolver el **estado por id**. Reemplazar el helper y los mapeos finales:
```ts
import { followButtonState } from '@/lib/social/follow'

async function loadFollowStatusMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<Map<string, 'pending' | 'accepted'>> {
  const map = new Map<string, 'pending' | 'accepted'>()
  const { data } = await (supabase.from('follows') as any)
    .select('following_id, status').eq('follower_id', userId) as {
      data: { following_id: string; status: 'pending' | 'accepted' }[] | null
    }
  for (const f of data ?? []) map.set(f.following_id, f.status)
  return map
}

function toSuggested(p: PostAuthor & { is_private: boolean }, statusMap: Map<string, 'pending' | 'accepted'>): SuggestedUser {
  const status = statusMap.get(p.id) ?? 'none'
  return {
    id: p.id, username: p.username, full_name: p.full_name, avatar_url: p.avatar_url,
    isPrivate: p.is_private,
    followState: followButtonState({ isPrivate: p.is_private, status }),
  }
}
```
En `searchUsers`: seleccionar también `is_private` y construir con `toSuggested`:
```ts
  const { data: rows } = await (supabase.from('public_profiles') as any)
    .select('id, username, full_name, avatar_url, is_private')
    .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
    .neq('id', user.id)
    .limit(SEARCH_LIMIT) as { data: (PostAuthor & { is_private: boolean })[] | null }
  const profiles = rows ?? []
  if (profiles.length === 0) return []

  const blocked = await loadBlockedIds(supabase, user.id)
  const visible = profiles.filter(p => !blocked.has(p.id))
  if (visible.length === 0) return []

  const statusMap = await loadFollowStatusMap(supabase, user.id)
  return visible.map(p => toSuggested(p, statusMap))
```
En `getSuggestedUsers`: tras obtener `candidateIds`, cargar perfiles con `is_private` y mapear:
```ts
  const { data: rows } = await (supabase.from('public_profiles') as any)
    .select('id, username, full_name, avatar_url, is_private').in('id', candidateIds) as {
      data: (PostAuthor & { is_private: boolean })[] | null
    }
  const byId = new Map((rows ?? []).map(p => [p.id, p]))
  // `statusMap` se calcula UNA sola vez antes (al filtrar candidatos con `!statusMap.has(id)`) y se reutiliza aquí.
  return candidateIds
    .map(id => byId.get(id))
    .filter((p): p is PostAuthor & { is_private: boolean } => !!p)
    .map(p => toSuggested(p, statusMap))
```
(El antiguo `loadFollowingSet` se elimina; mantener `loadBlockedIds`, `dedupePreservingOrder`, etc.)

- [ ] **Step 3: Verificar**

Run: `pnpm type-check`
Expected: PASS.
Run: `pnpm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/social/types.ts src/app/actions/users.ts
git commit -m "feat(social): búsqueda devuelve isPrivate + followState"
```

---

## Task 6: `FollowButton` con estados + callers

**Files:**
- Modify: `src/components/social/FollowButton.tsx`
- Modify: `src/components/social/UserRow.tsx`

- [ ] **Step 1: Reescribir `FollowButton`**

```tsx
// src/components/social/FollowButton.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, UserCheck, Clock, Loader2 } from 'lucide-react'
import { followUser, unfollowUser } from '@/app/actions/follows'
import { useToast } from '@/components/feedback/ToastProvider'
import { cn } from '@/lib/utils'
import type { FollowState } from '@/lib/social/follow'

export function FollowButton({ targetId, isPrivate, initialState }: {
  targetId: string; isPrivate: boolean; initialState: FollowState
}) {
  const [state, setState] = useState<FollowState>(initialState)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const { showToast } = useToast()

  function onClick() {
    const prev = state
    const isFollowAction = prev === 'follow' || prev === 'request'
    // optimista
    setState(prev === 'follow' ? 'following'
      : prev === 'request' ? 'requested'
      : prev === 'requested' ? 'request'
      : isPrivate ? 'request' : 'follow')

    startTransition(async () => {
      const res = isFollowAction ? await followUser(targetId) : await unfollowUser(targetId)
      if (!res.ok) { setState(prev); showToast({ title: res.error, variant: 'error' }); return }
      if (isFollowAction && res.ok) setState(res.status === 'accepted' ? 'following' : 'requested')
      router.refresh()
    })
  }

  const label = state === 'following' ? 'Siguiendo'
    : state === 'requested' ? 'Solicitado'
    : state === 'request' ? 'Solicitar' : 'Seguir'
  const Icon = state === 'following' ? UserCheck : state === 'requested' ? Clock : UserPlus
  const filled = state === 'follow' || state === 'request'

  return (
    <button
      onClick={onClick}
      disabled={pending}
      aria-pressed={state === 'following' || state === 'requested'}
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-medium disabled:opacity-60',
        filled ? 'bg-primary text-primary-foreground' : 'border border-border text-foreground',
      )}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  )
}
```

- [ ] **Step 2: Actualizar `UserRow`**

En `src/components/social/UserRow.tsx`, el `FollowButton` pasa de `initialFollowing` a los nuevos props (el `user` ya es `SuggestedUser` con `isPrivate`/`followState`):
```tsx
      <FollowButton targetId={user.id} isPrivate={user.isPrivate} initialState={user.followState} />
```

- [ ] **Step 3: Verificar**

Run: `pnpm type-check`
Expected: PASS (fallará temporalmente en `u/[username]/page.tsx`, que aún usa el FollowButton viejo — se corrige en Task 7; o ejecutar Task 7 a continuación y verificar al final).

- [ ] **Step 4: Commit**

```bash
git add src/components/social/FollowButton.tsx src/components/social/UserRow.tsx
git commit -m "feat(social): FollowButton con estados seguir/solicitar/solicitado/siguiendo"
```

---

## Task 7: UI de privacidad (toggle, campana, solicitudes, perfil privado)

**Files:**
- Create: `src/components/settings/PrivacyToggle.tsx`
- Modify: `src/app/(app)/settings/perfil/page.tsx`
- Modify: `src/app/(app)/feed/page.tsx`
- Create: `src/app/(app)/solicitudes/page.tsx`
- Create: `src/components/social/RequestRow.tsx`
- Create: `src/components/social/PrivateProfileNotice.tsx`
- Modify: `src/app/(app)/u/[username]/page.tsx`

- [ ] **Step 1: `PrivacyToggle`**

```tsx
// src/components/settings/PrivacyToggle.tsx
'use client'

import { useState, useTransition } from 'react'
import { Lock } from 'lucide-react'
import { setPrivacy } from '@/app/actions/settings'
import { useToast } from '@/components/feedback/ToastProvider'
import { cn } from '@/lib/utils'

export function PrivacyToggle({ initialPrivate }: { initialPrivate: boolean }) {
  const [isPrivate, setIsPrivate] = useState(initialPrivate)
  const [pending, startTransition] = useTransition()
  const { showToast } = useToast()

  function toggle() {
    const next = !isPrivate
    setIsPrivate(next)
    startTransition(async () => {
      const res = await setPrivacy(next)
      if (!res.ok) { setIsPrivate(!next); showToast({ title: res.error, variant: 'error' }) }
    })
  }

  return (
    <section className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/10 p-5">
      <div className="flex items-center gap-3">
        <Lock className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Cuenta privada</p>
          <p className="text-xs text-muted-foreground">Solo tus seguidores aceptados ven tus publicaciones.</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isPrivate}
        aria-label="Cuenta privada"
        onClick={toggle}
        disabled={pending}
        className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60',
          isPrivate ? 'bg-violet-500' : 'bg-muted')}
      >
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
          isPrivate ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </button>
    </section>
  )
}
```

- [ ] **Step 2: Montar el toggle en `/settings/perfil`**

En `src/app/(app)/settings/perfil/page.tsx`: importar `PrivacyToggle` y renderizarlo (con `initialPrivate={profile?.is_private ?? false}`) después del `UsernameField`. Requiere que `requireAppUserContext`/`AppProfile` exponga `is_private`: leer `src/lib/auth/server.ts` y, si falta, añadir `is_private: boolean` al tipo `AppProfile` y `is_private` al `.select(...)` (igual que se hizo con `username`).

```tsx
import { PrivacyToggle } from '@/components/settings/PrivacyToggle'
// …tras <UsernameField .../>:
      <div className="mt-4">
        <PrivacyToggle initialPrivate={profile?.is_private ?? false} />
      </div>
```

- [ ] **Step 3: Campana en `/feed`**

En `src/app/(app)/feed/page.tsx`: importar `getPendingRequestCount`, llamarlo, y añadir un enlace de campana con badge antes de la lupa. Añadir `Bell` al import de `lucide-react`.
```tsx
import { Bell, PlusCircle, Search } from 'lucide-react'
import { getDiscoverFeed, getFollowingFeed } from '@/app/actions/feed'
import { getPendingRequestCount } from '@/app/actions/follows'
// …en el cuerpo:
  const [discover, following, pendingRequests] = await Promise.all([
    getDiscoverFeed(), getFollowingFeed(), getPendingRequestCount(),
  ])
// …en la fila de acciones de la cabecera, antes del enlace de la lupa:
          <Link href="/solicitudes" aria-label="Solicitudes de seguimiento" className="relative flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground">
            <Bell className="h-5 w-5" />
            {pendingRequests > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {pendingRequests}
              </span>
            )}
          </Link>
```

- [ ] **Step 4: `RequestRow`**

```tsx
// src/components/social/RequestRow.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { RequestUser } from '@/lib/social/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { acceptFollowRequest, rejectFollowRequest } from '@/app/actions/follows'
import { useToast } from '@/components/feedback/ToastProvider'

export function RequestRow({ user }: { user: RequestUser }) {
  const [done, setDone] = useState<null | 'accepted' | 'rejected'>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const { showToast } = useToast()
  const name = user.full_name || user.username || 'Usuario'

  function act(kind: 'accepted' | 'rejected') {
    startTransition(async () => {
      const res = kind === 'accepted' ? await acceptFollowRequest(user.id) : await rejectFollowRequest(user.id)
      if (res.ok) { setDone(kind); router.refresh() }
      else showToast({ title: res.error, variant: 'error' })
    })
  }

  if (done) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground">
        {done === 'accepted' ? 'Solicitud aceptada' : 'Solicitud rechazada'}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Link href={user.username ? `/u/${user.username}` : '#'} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar className="h-11 w-11">
          {user.avatar_url && <AvatarImage src={user.avatar_url} alt={name} />}
          <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          {user.username && <p className="truncate text-xs text-muted-foreground">@{user.username}</p>}
        </div>
      </Link>
      <div className="flex gap-2">
        <button onClick={() => act('accepted')} disabled={pending}
          className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60">Aceptar</button>
        <button onClick={() => act('rejected')} disabled={pending}
          className="h-9 rounded-lg border border-border px-3 text-sm font-medium disabled:opacity-60">Rechazar</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Página `/solicitudes`**

```tsx
// src/app/(app)/solicitudes/page.tsx
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getFollowRequests } from '@/app/actions/follows'
import { RequestRow } from '@/components/social/RequestRow'

export default async function SolicitudesPage() {
  const requests = await getFollowRequests()

  return (
    <div className="mx-auto max-w-lg pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/40 bg-background/90 px-4 py-3 backdrop-blur-md">
        <Link href="/feed" aria-label="Volver" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold">Solicitudes</h1>
      </header>
      {requests.length === 0
        ? <p className="px-4 py-16 text-center text-sm text-muted-foreground">No tienes solicitudes pendientes.</p>
        : requests.map(u => <RequestRow key={u.id} user={u} />)}
    </div>
  )
}
```

- [ ] **Step 6: `PrivateProfileNotice`**

```tsx
// src/components/social/PrivateProfileNotice.tsx
import { Lock } from 'lucide-react'

export function PrivateProfileNotice() {
  return (
    <div className="flex flex-col items-center gap-3 border-t border-border/40 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-border">
        <Lock className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold">Esta cuenta es privada</p>
      <p className="max-w-xs text-sm text-muted-foreground">Sigue esta cuenta para ver sus publicaciones.</p>
    </div>
  )
}
```

- [ ] **Step 7: Perfil privacy-aware**

Reescribir `src/app/(app)/u/[username]/page.tsx` para usar los nuevos campos de `getProfile` (candado, `postCount`, `followState`, banner):
```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import { getProfile } from '@/app/actions/feed'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { FollowButton } from '@/components/social/FollowButton'
import { ProfilePostGrid } from '@/components/social/ProfilePostGrid'
import { PrivateProfileNotice } from '@/components/social/PrivateProfileNotice'

export default async function PublicProfilePage({ params }: { params: { username: string } }) {
  const { username } = params
  const { author, posts, postCount, followerCount, followingCount, followState, isPrivate, canViewPosts, isMe } = await getProfile(username)
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
            <div><div className="text-lg font-bold">{postCount}</div><div className="text-xs text-muted-foreground">publicaciones</div></div>
            <div><div className="text-lg font-bold">{followerCount}</div><div className="text-xs text-muted-foreground">seguidores</div></div>
            <div><div className="text-lg font-bold">{followingCount}</div><div className="text-xs text-muted-foreground">siguiendo</div></div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          <p className="text-sm font-semibold">{name}</p>
          {isPrivate && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Cuenta privada" />}
        </div>
        {author.username && <p className="text-sm text-muted-foreground">@{author.username}</p>}

        <div className="mt-4">
          {isMe ? (
            <Link href="/settings/perfil" className="flex h-10 w-full items-center justify-center rounded-lg border border-border text-sm font-medium">
              Editar perfil
            </Link>
          ) : (
            <FollowButton targetId={author.id} isPrivate={isPrivate} initialState={followState} />
          )}
        </div>
      </header>

      {canViewPosts ? <ProfilePostGrid posts={posts} /> : <PrivateProfileNotice />}
    </div>
  )
}
```

- [ ] **Step 8: Verificar**

Run: `pnpm type-check`
Expected: PASS.
Run: `pnpm build`
Expected: compila; `/solicitudes` y `/u/[username]` dinámicas.

- [ ] **Step 9: Commit**

```bash
git add src/components/settings/PrivacyToggle.tsx "src/app/(app)/settings/perfil/page.tsx" "src/app/(app)/feed/page.tsx" "src/app/(app)/solicitudes/page.tsx" src/components/social/RequestRow.tsx src/components/social/PrivateProfileNotice.tsx "src/app/(app)/u/[username]/page.tsx" src/lib/auth/server.ts
git commit -m "feat(social): UI de cuentas privadas (toggle, campana, solicitudes, banner)"
```

---

## Task 8: Verificación final + checklist

**Files:** (sin cambios; verificación)

- [ ] **Step 1: Suite + type-check + build**

Run: `pnpm test && pnpm type-check && pnpm build`
Expected: tests PASS (incl. `follow`), type-check limpio, build compila.

- [ ] **Step 2: Checklist manual de RLS** (migración 024 aplicada, cuentas A/B)

- [ ] B activa "Cuenta privada" en Ajustes → Perfil.
- [ ] A (no seguidor) ve el perfil de B con contadores + banner, sin posts; los posts de B no salen en Descubrir ni en búsqueda para A.
- [ ] A pulsa "Solicitar" → "Solicitado"; B ve el badge en la campana de `/feed` y la solicitud en `/solicitudes`.
- [ ] B acepta → A pasa a "Siguiendo" y ve los posts de B (perfil + pestaña Siguiendo).
- [ ] B rechaza otra solicitud → desaparece; el solicitante vuelve a "Solicitar".
- [ ] A cancela una solicitud tocando "Solicitado".
- [ ] B vuelve a pública y luego a privada → sus seguidores aceptados se conservan.
- [ ] SQL: un no-seguidor no puede `SELECT` posts de una cuenta privada.

- [ ] **Step 3: Commit (si hubo ajustes)**

```bash
git add -A
git commit -m "test(social): verificación de cuentas privadas"
```

---

## Self-Review (cobertura del spec)

- Migración (is_private, post_count+trigger, follows.status, RLS posts, follows accept/reject) + tipos → Task 1.
- `followButtonState` (TDD) → Task 2.
- Acciones privacidad/solicitudes + `setPrivacy` → Task 3.
- `getProfile`/`getFollowingFeed` privacy-aware → Task 4.
- Búsqueda con isPrivate+followState → Task 5.
- `FollowButton` estados + callers → Task 6.
- Toggle, campana, `/solicitudes`, banner privado, candado → Task 7.
- Testing (unit + checklist RLS) → Tasks 2, 8.

**Fuera de alcance (correcto):** notificaciones completas, close-friends, avisar al aceptado, anti-captura.

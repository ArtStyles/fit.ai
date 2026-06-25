# Red Social FitAI — Fase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir grafo social (seguir/dejar de seguir), feed personalizado "Siguiendo" en pestañas dentro de `/feed`, y contadores + botón Seguir en el perfil — reutilizando la infraestructura de Fase 1.

**Architecture:** Tabla `follows` con RLS (lectura pública entre autenticados, escritura propia). `getFollowingFeed` replica el keyset de `getDiscoverFeed` filtrando a los autores seguidos; `getProfile` añade contadores e `isFollowing`. La UI extrae el scroll infinito a un `PostFeed` genérico que `FeedTabs` usa para ambas pestañas. `blockUser` hace auto-unfollow (vía service-role, porque RLS solo deja borrar el follow propio).

**Tech Stack:** Next.js 14.2 (App Router), Supabase (Postgres + RLS), TypeScript, Tailwind, vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-06-25-red-social-fase2-design.md`
**Depende de:** Fase 1 (en `main`).

---

## Estructura de archivos

- Create: `supabase/migrations/022_follows.sql` — tabla `follows` + RLS + índice.
- Modify: `src/types/database.ts` — tipo `follows`.
- Create: `src/app/actions/follows.ts` — `followUser`, `unfollowUser`.
- Modify: `src/app/actions/feed.ts` — añadir `getFollowingFeed` y `getProfile`; eliminar `getUserPosts`.
- Modify: `src/app/actions/moderation.ts` — `blockUser` con auto-unfollow.
- Create: `src/components/social/PostFeed.tsx` — scroll infinito genérico.
- Create: `src/components/social/FollowButton.tsx` — botón Seguir/Siguiendo optimista.
- Create: `src/components/social/FeedTabs.tsx` — pestañas Descubrir/Siguiendo.
- Modify: `src/app/(app)/feed/page.tsx` — fetch de ambos feeds + `FeedTabs`.
- Delete: `src/components/social/DiscoverFeed.tsx` — su rol lo cubren `FeedTabs` + `PostFeed`.
- Modify: `src/app/(app)/u/[username]/page.tsx` — usar `getProfile` + contadores + `FollowButton`.

## Notas de ejecución

- **Gestor: `pnpm`** (npm falla con ERESOLVE). Verificación: `pnpm type-check`, `pnpm test`, `pnpm build`.
- La migración `022` se aplica manualmente en Supabase → SQL Editor (como las de Fase 1). No hay DB en este entorno; las acciones se verifican con `type-check`.
- **No hay lógica pura nueva** que justifique tests vitest (el cursor keyset ya está testeado en Fase 1). El gate automático es `type-check` + `build`; la verificación funcional es el checklist manual de RLS (Task 9). Esto es consistente con cómo Fase 1 verificó actions/UI.
- Queries con el estilo del repo: `(supabase.from('x') as any)`.

---

## Task 1: Migración `follows` + tipos

**Files:**
- Create: `supabase/migrations/022_follows.sql`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Escribir la migración**

```sql
-- 022_follows.sql
-- Red social Fase 2: grafo de seguidores.
-- Ejecutar en: Supabase Dashboard > SQL Editor

CREATE TABLE follows (
  follower_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT no_self_follow CHECK (follower_id <> following_id)
);

-- La PK cubre la dirección "a quién sigo" (follower_id); este índice cubre
-- "quién me sigue" (following_id), usado por el contador de seguidores.
CREATE INDEX idx_follows_following ON follows(following_id);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follows: read" ON follows
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "follows: insert own" ON follows
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "follows: delete own" ON follows
  FOR DELETE TO authenticated USING (auth.uid() = follower_id);
```

- [ ] **Step 2: Añadir el tipo en `database.ts`**

Dentro de `Database['public']['Tables']` (junto a `user_blocks`/`public_profiles`), añadir:

```ts
      follows: {
        Row: { follower_id: string; following_id: string; created_at: string }
        Insert: { follower_id: string; following_id: string; created_at?: string }
        Update: Partial<{ follower_id: string; following_id: string; created_at: string }>
        Relationships: []
      }
```

- [ ] **Step 3: Verificar y aplicar**

Run: `pnpm type-check`
Expected: PASS.
Aplicar el SQL en Supabase → SQL Editor; verificar:
```sql
SELECT policyname FROM pg_policies WHERE tablename='follows' ORDER BY policyname;
```
Esperado: `follows: delete own`, `follows: insert own`, `follows: read`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/022_follows.sql src/types/database.ts
git commit -m "feat(social): migración follows (grafo social) y tipos"
```

---

## Task 2: Server Actions de seguir/dejar de seguir

**Files:**
- Create: `src/app/actions/follows.ts`

- [ ] **Step 1: Implementar**

```ts
// src/app/actions/follows.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from './posts'

export async function followUser(targetId: string): Promise<ActionResult<{ following: boolean }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }
  if (targetId === user.id) return { ok: false, error: 'No puedes seguirte a ti mismo.' }

  const { error } = await (supabase.from('follows') as any)
    .upsert({ follower_id: user.id, following_id: targetId })
  if (error) return { ok: false, error: 'No se pudo seguir.' }

  revalidatePath('/feed')
  return { ok: true, following: true }
}

export async function unfollowUser(targetId: string): Promise<ActionResult<{ following: boolean }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const { error } = await (supabase.from('follows') as any)
    .delete().eq('follower_id', user.id).eq('following_id', targetId)
  if (error) return { ok: false, error: 'No se pudo dejar de seguir.' }

  revalidatePath('/feed')
  return { ok: true, following: false }
}
```

- [ ] **Step 2: Verificar**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/follows.ts
git commit -m "feat(social): server actions followUser/unfollowUser"
```

---

## Task 3: `getFollowingFeed` + `getProfile` (y quitar `getUserPosts`)

**Files:**
- Modify: `src/app/actions/feed.ts`

Reutiliza los helpers existentes en ese archivo: `POST_COLS`, `loadAuthors`, `loadMyLikes`, `toFeedPost`, el tipo interno `PostRow`, `decodeCursor`/`encodeCursor`/`FEED_PAGE_SIZE`, y el tipo `PostAuthor`.

- [ ] **Step 1: Añadir `getFollowingFeed`**

Añadir esta función (p.ej. justo después de `getDiscoverFeed`):

```ts
export async function getFollowingFeed(cursorToken?: string | null): Promise<FeedPage> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { posts: [], nextCursor: null }

  const { data: followRows } = await (supabase.from('follows') as any)
    .select('following_id').eq('follower_id', user.id) as {
      data: { following_id: string }[] | null
    }
  const followingIds = (followRows ?? []).map(f => f.following_id)
  if (followingIds.length === 0) return { posts: [], nextCursor: null }

  const cursor = decodeCursor(cursorToken)
  let query = (supabase.from('posts') as any)
    .select(POST_COLS)
    .in('user_id', followingIds)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(FEED_PAGE_SIZE + 1)

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    )
  }

  const { data: rows } = await query as { data: PostRow[] | null }
  const page = rows ?? []
  const hasMore = page.length > FEED_PAGE_SIZE
  const visible = hasMore ? page.slice(0, FEED_PAGE_SIZE) : page

  const authors = await loadAuthors(supabase, visible.map(r => r.user_id))
  const liked = await loadMyLikes(supabase, user.id, visible.map(r => r.id))
  const posts = visible.map(r => toFeedPost(r, authors, liked, user.id))

  const last = visible[visible.length - 1]
  const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null
  return { posts, nextCursor }
}
```

- [ ] **Step 2: Reemplazar `getUserPosts` por `getProfile`**

Eliminar la función `getUserPosts` y añadir `getProfile` (la página de perfil pasará a usarla en Task 8):

```ts
export async function getProfile(username: string): Promise<{
  author: PostAuthor | null
  posts: FeedPost[]
  followerCount: number
  followingCount: number
  isFollowing: boolean
  isMe: boolean
}> {
  const empty = { author: null, posts: [], followerCount: 0, followingCount: 0, isFollowing: false, isMe: false }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return empty

  const { data: author } = await (supabase.from('public_profiles') as any)
    .select('id, username, full_name, avatar_url').eq('username', username).maybeSingle() as {
      data: PostAuthor | null
    }
  if (!author) return empty

  const { data: rows } = await (supabase.from('posts') as any)
    .select(POST_COLS).eq('user_id', author.id)
    .order('created_at', { ascending: false }).limit(60) as { data: PostRow[] | null }
  const page = rows ?? []
  const authors = new Map([[author.id, author]])
  const liked = await loadMyLikes(supabase, user.id, page.map(r => r.id))
  const posts = page.map(r => toFeedPost(r, authors, liked, user.id))

  const { count: followerCount } = await (supabase.from('follows') as any)
    .select('*', { count: 'exact', head: true }).eq('following_id', author.id) as { count: number | null }
  const { count: followingCount } = await (supabase.from('follows') as any)
    .select('*', { count: 'exact', head: true }).eq('follower_id', author.id) as { count: number | null }

  const isMe = author.id === user.id
  let isFollowing = false
  if (!isMe) {
    const { data: rel } = await (supabase.from('follows') as any)
      .select('following_id').eq('follower_id', user.id).eq('following_id', author.id).maybeSingle() as {
        data: { following_id: string } | null
      }
    isFollowing = !!rel
  }

  return {
    author, posts,
    followerCount: followerCount ?? 0,
    followingCount: followingCount ?? 0,
    isFollowing, isMe,
  }
}
```

- [ ] **Step 3: Verificar**

Run: `pnpm type-check`
Expected: PASS (si algún archivo aún importa `getUserPosts`, fallará — lo arregla Task 8; pero en este punto solo `u/[username]/page.tsx` lo usa, así que **haz Task 8 inmediatamente después o deja este commit junto con Task 8**). Para que el type-check pase YA en este paso, actualiza también el import roto: confirma con `grep -rn "getUserPosts" src` que no quedan referencias salvo la página de perfil; si la página aún lo referencia, este paso de type-check fallará hasta Task 8.

> Nota de secuencia: como quitar `getUserPosts` rompe temporalmente `u/[username]/page.tsx`, **commitea Task 3 sin verificar el build completo** y ejecuta Task 8 a continuación; el `type-check` definitivo se valida al final de Task 8. (Alternativa: hacer Tasks 3 y 8 en un solo commit.)

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/feed.ts
git commit -m "feat(social): getFollowingFeed y getProfile (reemplaza getUserPosts)"
```

---

## Task 4: `blockUser` con auto-unfollow

**Files:**
- Modify: `src/app/actions/moderation.ts`

RLS solo permite borrar el follow propio (`follower_id = auth.uid()`), así que para borrar también el follow del bloqueado hacia mí se usa **service-role**.

- [ ] **Step 1: Modificar `blockUser`**

Añadir el import del service client al inicio del archivo:
```ts
import { createServiceClient } from '@/lib/supabase/service'
```

Reemplazar el cuerpo de `blockUser` (desde el `upsert` del bloqueo hasta el `return`) por:
```ts
  const { error } = await (supabase.from('user_blocks') as any)
    .upsert({ blocker_id: user.id, blocked_id: blockedId })
  if (error) return { ok: false, error: 'No se pudo bloquear.' }

  // Bloquear implica auto-unfollow en ambos sentidos. La dirección bloqueado→yo
  // no se puede borrar con el cliente de usuario (RLS solo permite follower propio),
  // así que se usa service-role.
  const service = createServiceClient()
  await (service.from('follows') as any).delete().eq('follower_id', user.id).eq('following_id', blockedId)
  await (service.from('follows') as any).delete().eq('follower_id', blockedId).eq('following_id', user.id)

  revalidatePath('/feed')
  return { ok: true }
```

- [ ] **Step 2: Verificar**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/moderation.ts
git commit -m "feat(social): bloquear hace auto-unfollow en ambos sentidos"
```

---

## Task 5: Componente `PostFeed` genérico

**Files:**
- Create: `src/components/social/PostFeed.tsx`

Extrae el scroll infinito de `DiscoverFeed` a un componente reutilizable que recibe la función de carga y un mensaje de vacío. (DiscoverFeed se elimina en Task 7.)

- [ ] **Step 1: Implementar**

```tsx
// src/components/social/PostFeed.tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { FeedPost, FeedPage } from '@/lib/social/types'
import { PostCard } from './PostCard'

export function PostFeed({ initialPosts, initialCursor, fetchPage, emptyMessage }: {
  initialPosts: FeedPost[]
  initialCursor: string | null
  fetchPage: (cursor: string) => Promise<FeedPage>
  emptyMessage?: React.ReactNode
}) {
  const [posts, setPosts] = useState(initialPosts)
  const [cursor, setCursor] = useState(initialCursor)
  const [loading, setLoading] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return
    setLoading(true)
    const page = await fetchPage(cursor)
    setPosts(prev => [...prev, ...page.posts])
    setCursor(page.nextCursor)
    setLoading(false)
  }, [cursor, loading, fetchPage])

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const obs = new IntersectionObserver(entries => { if (entries[0].isIntersecting) loadMore() }, { rootMargin: '300px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore])

  if (posts.length === 0) {
    return (
      <>{emptyMessage ?? <p className="px-4 py-16 text-center text-sm text-muted-foreground">Aún no hay publicaciones.</p>}</>
    )
  }

  return (
    <div>
      {posts.map(p => <PostCard key={p.id} post={p} />)}
      <div ref={sentinel} aria-live="polite" className="flex h-12 items-center justify-center">
        {loading && (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="sr-only">Cargando más publicaciones</span>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/social/PostFeed.tsx
git commit -m "feat(social): componente PostFeed genérico (scroll infinito)"
```

---

## Task 6: `FollowButton`

**Files:**
- Create: `src/components/social/FollowButton.tsx`

- [ ] **Step 1: Implementar (optimista, mismo patrón que LikeButton)**

```tsx
// src/components/social/FollowButton.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, UserCheck, Loader2 } from 'lucide-react'
import { followUser, unfollowUser } from '@/app/actions/follows'
import { useToast } from '@/components/feedback/ToastProvider'
import { cn } from '@/lib/utils'

export function FollowButton({ targetId, initialFollowing }: { targetId: string; initialFollowing: boolean }) {
  const [following, setFollowing] = useState(initialFollowing)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const { showToast } = useToast()

  function toggle() {
    const next = !following
    setFollowing(next)
    startTransition(async () => {
      const res = next ? await followUser(targetId) : await unfollowUser(targetId)
      if (!res.ok) {
        setFollowing(!next)
        showToast({ title: res.error, variant: 'error' })
      } else {
        setFollowing(res.following)
        router.refresh()
      }
    })
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      aria-pressed={following}
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-medium disabled:opacity-60',
        following ? 'border border-border text-foreground' : 'bg-primary text-primary-foreground',
      )}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : following ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
      {following ? 'Siguiendo' : 'Seguir'}
    </button>
  )
}
```

- [ ] **Step 2: Verificar**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/social/FollowButton.tsx
git commit -m "feat(social): FollowButton optimista"
```

---

## Task 7: `FeedTabs` + `/feed` con pestañas (y eliminar `DiscoverFeed`)

**Files:**
- Create: `src/components/social/FeedTabs.tsx`
- Modify: `src/app/(app)/feed/page.tsx`
- Delete: `src/components/social/DiscoverFeed.tsx`

- [ ] **Step 1: Implementar `FeedTabs`**

```tsx
// src/components/social/FeedTabs.tsx
'use client'

import { useState } from 'react'
import type { FeedPage } from '@/lib/social/types'
import { getDiscoverFeed, getFollowingFeed } from '@/app/actions/feed'
import { PostFeed } from './PostFeed'
import { cn } from '@/lib/utils'

type Tab = 'descubrir' | 'siguiendo'

export function FeedTabs({ discover, following }: { discover: FeedPage; following: FeedPage }) {
  const [tab, setTab] = useState<Tab>('descubrir')

  return (
    <div>
      <div className="flex border-b border-border/40">
        <button
          onClick={() => setTab('descubrir')}
          className={cn('h-11 flex-1 text-sm font-medium transition-colors',
            tab === 'descubrir' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground')}
        >
          Descubrir
        </button>
        <button
          onClick={() => setTab('siguiendo')}
          className={cn('h-11 flex-1 text-sm font-medium transition-colors',
            tab === 'siguiendo' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground')}
        >
          Siguiendo
        </button>
      </div>

      {tab === 'descubrir' ? (
        <PostFeed key="descubrir" initialPosts={discover.posts} initialCursor={discover.nextCursor} fetchPage={getDiscoverFeed} />
      ) : (
        <PostFeed
          key="siguiendo"
          initialPosts={following.posts}
          initialCursor={following.nextCursor}
          fetchPage={getFollowingFeed}
          emptyMessage={
            <div className="px-4 py-16 text-center text-sm text-muted-foreground">
              <p>Sigue a gente para ver sus rutinas aquí.</p>
              <button onClick={() => setTab('descubrir')} className="mt-3 font-medium text-primary">
                Explorar Descubrir
              </button>
            </div>
          }
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Actualizar la página `/feed`**

```tsx
// src/app/(app)/feed/page.tsx
import Link from 'next/link'
import { PlusCircle } from 'lucide-react'
import { getDiscoverFeed, getFollowingFeed } from '@/app/actions/feed'
import { FeedTabs } from '@/components/social/FeedTabs'

export default async function FeedPage() {
  const [discover, following] = await Promise.all([getDiscoverFeed(), getFollowingFeed()])

  return (
    <div className="mx-auto max-w-lg pb-24">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/40 bg-background/90 px-4 py-3 backdrop-blur-md">
        <h1 className="text-lg font-bold">Comunidad</h1>
        <Link href="/feed/new" aria-label="Nueva publicación" className="inline-flex h-11 items-center gap-1.5 text-sm font-medium text-primary">
          <PlusCircle className="h-5 w-5" /> Publicar
        </Link>
      </header>
      <FeedTabs discover={discover} following={following} />
    </div>
  )
}
```

- [ ] **Step 3: Eliminar `DiscoverFeed.tsx`**

```bash
git rm src/components/social/DiscoverFeed.tsx
```
Confirmar que no quedan referencias: `grep -rn "DiscoverFeed" src` debe salir vacío.

- [ ] **Step 4: Verificar**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/feed/page.tsx" src/components/social/FeedTabs.tsx
git commit -m "feat(social): pestañas Descubrir/Siguiendo en /feed (PostFeed + FeedTabs)"
```

---

## Task 8: Perfil con contadores + `FollowButton`

**Files:**
- Modify: `src/app/(app)/u/[username]/page.tsx`

- [ ] **Step 1: Reescribir la página de perfil**

```tsx
// src/app/(app)/u/[username]/page.tsx
import { notFound } from 'next/navigation'
import { getProfile } from '@/app/actions/feed'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { PostCard } from '@/components/social/PostCard'
import { FollowButton } from '@/components/social/FollowButton'

export default async function PublicProfilePage({ params }: { params: { username: string } }) {
  const { username } = params
  const { author, posts, followerCount, followingCount, isFollowing, isMe } = await getProfile(username)
  if (!author) notFound()

  const name = author.full_name || author.username || 'Usuario'

  return (
    <div className="mx-auto max-w-lg pb-24">
      <header className="flex flex-col items-center gap-3 border-b border-border/40 px-4 py-8">
        <Avatar className="h-20 w-20">
          {author.avatar_url && <AvatarImage src={author.avatar_url} alt={name} />}
          <AvatarFallback className="text-2xl">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="text-center">
          <h1 className="text-xl font-bold">{name}</h1>
          {author.username && <p className="text-sm text-muted-foreground">@{author.username}</p>}
        </div>
        <div className="flex gap-6 text-sm">
          <span><strong>{posts.length}</strong> <span className="text-muted-foreground">publicaciones</span></span>
          <span><strong>{followerCount}</strong> <span className="text-muted-foreground">seguidores</span></span>
          <span><strong>{followingCount}</strong> <span className="text-muted-foreground">siguiendo</span></span>
        </div>
        {!isMe && <FollowButton targetId={author.id} initialFollowing={isFollowing} />}
      </header>
      {posts.length === 0
        ? <p className="px-4 py-16 text-center text-sm text-muted-foreground">Sin publicaciones todavía.</p>
        : posts.map(p => <PostCard key={p.id} post={p} />)}
    </div>
  )
}
```

- [ ] **Step 2: Verificar**

Run: `pnpm type-check`
Expected: PASS (ya no debe quedar ninguna referencia a `getUserPosts`).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/u/[username]/page.tsx"
git commit -m "feat(social): perfil con contadores y botón Seguir"
```

---

## Task 9: Verificación final + checklist RLS

**Files:** (sin cambios; verificación)

- [ ] **Step 1: Suite + type-check + build**

Run: `pnpm test && pnpm type-check && pnpm build`
Expected: 171 tests PASS, type-check sin errores, build compila (rutas `/feed`, `/u/[username]` dinámicas).

- [ ] **Step 2: Checklist manual de RLS** (con la migración 022 aplicada y 2 cuentas A y B)

- [ ] A abre el perfil de B (`/u/<username_B>`) → ve "Seguir"; al pulsarlo cambia a "Siguiendo" y el contador de seguidores de B sube.
- [ ] En `/feed` pestaña "Siguiendo", A ve los posts de B; si A no sigue a nadie, ve el mensaje + CTA.
- [ ] A deja de seguir a B → desaparece de "Siguiendo" y baja el contador.
- [ ] A no puede seguirse a sí mismo (no hay botón en su perfil; la acción lo rechaza).
- [ ] Insert manual de un follow con `follower_id` ajeno es rechazado por RLS.
- [ ] A sigue a B y luego A bloquea a B → el follow desaparece en ambos sentidos (verificar en SQL `SELECT * FROM follows` que no quedan filas A↔B).

- [ ] **Step 3: Commit (si hubo ajustes)**

```bash
git add -A
git commit -m "test(social): verificación Fase 2 (suite + checklist RLS)"
```

---

## Self-Review (cobertura del spec)

- `follows` + RLS + índice → Task 1.
- `followUser`/`unfollowUser` → Task 2.
- `getFollowingFeed` (keyset, reusa helpers) → Task 3.
- `getProfile` (contadores + isFollowing) reemplaza `getUserPosts` → Task 3 + Task 8.
- `blockUser` auto-unfollow (service-role por RLS) → Task 4.
- `PostFeed` genérico → Task 5; `FollowButton` → Task 6; `FeedTabs` + `/feed` pestañas → Task 7; eliminar `DiscoverFeed` → Task 7.
- Perfil con contadores + botón → Task 8.
- Default Descubrir + estado vacío de Siguiendo → Task 7.
- Testing (type-check/build + checklist RLS) → Task 9.

**Fuera de alcance (correctamente excluido):** notificaciones de seguidor, listas de seguidores/seguidos navegables, follow en PostCard, ranking del feed.

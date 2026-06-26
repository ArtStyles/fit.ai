# Descubrimiento de Usuarios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir encontrar gente para seguir: una página `/buscar` (icono de lupa en `/feed`) con búsqueda de usuarios + lista de sugeridos (recientemente activos), reutilizando `FollowButton`.

**Architecture:** Sin tablas nuevas — lee `public_profiles`, `posts` y `follows`. Lógica pura (saneo de query, dedupe) en `src/lib/social/discovery.ts` con tests. Server actions `searchUsers`/`getSuggestedUsers` en `src/app/actions/users.ts`. UI: `UserSearch` (cliente, debounced) + `UserRow` (reusa `FollowButton`) en una página `/buscar`.

**Tech Stack:** Next.js 14.2 (App Router), Supabase (Postgres + RLS), TypeScript, Tailwind, vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-06-26-descubrimiento-usuarios-design.md`
**Depende de:** Red social Fases 1-2 (en `main`).

---

## Estructura de archivos

- Create: `src/lib/social/discovery.ts` — `sanitizeSearch`, `dedupePreservingOrder` (puros).
- Create: `src/lib/social/__tests__/discovery.test.ts` — tests.
- Modify: `src/lib/social/types.ts` — añadir `SuggestedUser`.
- Create: `src/app/actions/users.ts` — `searchUsers`, `getSuggestedUsers` (+ helpers de bloqueo/seguidos).
- Create: `src/components/social/UserRow.tsx` — fila usuario + `FollowButton`.
- Create: `src/components/social/UserSearch.tsx` — búsqueda con debounce + sugeridos.
- Create: `src/app/(app)/buscar/page.tsx` — página de descubrimiento.
- Modify: `src/app/(app)/feed/page.tsx` — icono de lupa → `/buscar`.

## Notas de ejecución

- **Gestor: `pnpm`** (npm falla con ERESOLVE). Verificación: `pnpm test`, `pnpm type-check`, `pnpm build`.
- Sin migración. Las acciones leen `public_profiles`/`posts`/`follows` con el estilo `(supabase.from('x') as any)`.
- `FollowButton` ya existe (`src/components/social/FollowButton.tsx`, props `{ targetId, initialFollowing }`).

---

## Task 1: Lógica pura de descubrimiento (TDD) + tipo

**Files:**
- Create: `src/lib/social/discovery.ts`
- Test: `src/lib/social/__tests__/discovery.test.ts`
- Modify: `src/lib/social/types.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { sanitizeSearch, dedupePreservingOrder } from '../discovery'

describe('sanitizeSearch', () => {
  it('recorta y colapsa espacios', () => {
    expect(sanitizeSearch('  hola   mundo ')).toBe('hola mundo')
  })
  it('elimina caracteres que rompen el filtro PostgREST', () => {
    expect(sanitizeSearch('a, b ( c ) *d%')).toBe('a b c d')
  })
  it('devuelve cadena vacía si no queda contenido útil', () => {
    expect(sanitizeSearch('   ')).toBe('')
    expect(sanitizeSearch(' , ( ) ')).toBe('')
  })
})

describe('dedupePreservingOrder', () => {
  it('quita duplicados conservando el primer orden de aparición', () => {
    expect(dedupePreservingOrder(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c'])
  })
  it('tolera lista vacía', () => {
    expect(dedupePreservingOrder([])).toEqual([])
  })
})
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `pnpm test src/lib/social/__tests__/discovery.test.ts`
Expected: FAIL — "Failed to resolve import '../discovery'".

- [ ] **Step 3: Implementar**

```ts
// src/lib/social/discovery.ts
// Helpers puros para descubrimiento de usuarios.

// Quita caracteres que rompen el filtro .or(...) de PostgREST o permiten inyección en él
// (comas, paréntesis, asteriscos, porcentajes) y normaliza espacios. Devuelve '' si no
// queda contenido útil. El llamador envuelve el resultado con % para el ILIKE.
export function sanitizeSearch(raw: string): string {
  return raw.replace(/[,()*%]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Quita duplicados conservando el primer orden de aparición.
export function dedupePreservingOrder(ids: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}
```

- [ ] **Step 4: Añadir el tipo `SuggestedUser`**

En `src/lib/social/types.ts`, al final del archivo:
```ts
export type SuggestedUser = PostAuthor & { isFollowing: boolean }
```

- [ ] **Step 5: Correr el test (debe pasar) + type-check**

Run: `pnpm test src/lib/social/__tests__/discovery.test.ts`
Expected: PASS.
Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/social/discovery.ts src/lib/social/__tests__/discovery.test.ts src/lib/social/types.ts
git commit -m "feat(social): helpers puros de descubrimiento + tipo SuggestedUser"
```

---

## Task 2: Server Actions `searchUsers` / `getSuggestedUsers`

**Files:**
- Create: `src/app/actions/users.ts`

- [ ] **Step 1: Implementar**

```ts
// src/app/actions/users.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import type { PostAuthor, SuggestedUser } from '@/lib/social/types'
import { sanitizeSearch, dedupePreservingOrder } from '@/lib/social/discovery'

const SEARCH_LIMIT = 20
const SUGGEST_LIMIT = 10
const RECENT_POSTS_SCAN = 50

// ids bloqueados en cualquier dirección respecto a `userId` (userId es UUID de auth, no input).
async function loadBlockedIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<Set<string>> {
  const set = new Set<string>()
  const { data } = await (supabase.from('user_blocks') as any)
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`) as {
      data: { blocker_id: string; blocked_id: string }[] | null
    }
  for (const b of data ?? []) set.add(b.blocker_id === userId ? b.blocked_id : b.blocker_id)
  return set
}

async function loadFollowingSet(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<Set<string>> {
  const set = new Set<string>()
  const { data } = await (supabase.from('follows') as any)
    .select('following_id').eq('follower_id', userId) as {
      data: { following_id: string }[] | null
    }
  for (const f of data ?? []) set.add(f.following_id)
  return set
}

export async function searchUsers(rawQuery: string): Promise<SuggestedUser[]> {
  const q = sanitizeSearch(rawQuery)
  if (!q) return []

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: rows } = await (supabase.from('public_profiles') as any)
    .select('id, username, full_name, avatar_url')
    .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
    .neq('id', user.id)
    .limit(SEARCH_LIMIT) as { data: PostAuthor[] | null }
  const profiles = rows ?? []
  if (profiles.length === 0) return []

  const blocked = await loadBlockedIds(supabase, user.id)
  const visible = profiles.filter(p => !blocked.has(p.id))
  if (visible.length === 0) return []

  const following = await loadFollowingSet(supabase, user.id)
  return visible.map(p => ({ ...p, isFollowing: following.has(p.id) }))
}

export async function getSuggestedUsers(): Promise<SuggestedUser[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: postRows } = await (supabase.from('posts') as any)
    .select('user_id').order('created_at', { ascending: false }).limit(RECENT_POSTS_SCAN) as {
      data: { user_id: string }[] | null
    }
  const recentAuthorIds = dedupePreservingOrder((postRows ?? []).map(p => p.user_id))
  if (recentAuthorIds.length === 0) return []

  const blocked = await loadBlockedIds(supabase, user.id)
  const following = await loadFollowingSet(supabase, user.id)
  const candidateIds = recentAuthorIds
    .filter(id => id !== user.id && !blocked.has(id) && !following.has(id))
    .slice(0, SUGGEST_LIMIT)
  if (candidateIds.length === 0) return []

  const { data: rows } = await (supabase.from('public_profiles') as any)
    .select('id, username, full_name, avatar_url').in('id', candidateIds) as {
      data: PostAuthor[] | null
    }
  const byId = new Map((rows ?? []).map(p => [p.id, p]))
  // .in() no preserva orden: re-ordenar por recencia (orden de candidateIds).
  return candidateIds
    .map(id => byId.get(id))
    .filter((p): p is PostAuthor => !!p)
    .map(p => ({ ...p, isFollowing: false }))
}
```

- [ ] **Step 2: Verificar**

Run: `pnpm type-check`
Expected: PASS.
Run: `pnpm test`
Expected: PASS (sin regresión).

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/users.ts
git commit -m "feat(social): searchUsers y getSuggestedUsers"
```

---

## Task 3: `UserRow` + `UserSearch`

**Files:**
- Create: `src/components/social/UserRow.tsx`
- Create: `src/components/social/UserSearch.tsx`

- [ ] **Step 1: Implementar `UserRow`**

```tsx
// src/components/social/UserRow.tsx
import Link from 'next/link'
import type { SuggestedUser } from '@/lib/social/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { FollowButton } from './FollowButton'

export function UserRow({ user }: { user: SuggestedUser }) {
  const name = user.full_name || user.username || 'Usuario'
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Link
        href={user.username ? `/u/${user.username}` : '#'}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <Avatar className="h-11 w-11">
          {user.avatar_url && <AvatarImage src={user.avatar_url} alt={name} />}
          <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          {user.username && <p className="truncate text-xs text-muted-foreground">@{user.username}</p>}
        </div>
      </Link>
      <FollowButton targetId={user.id} initialFollowing={user.isFollowing} />
    </div>
  )
}
```

- [ ] **Step 2: Implementar `UserSearch` (cliente, debounce + guardia de carrera)**

```tsx
// src/components/social/UserSearch.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import type { SuggestedUser } from '@/lib/social/types'
import { searchUsers } from '@/app/actions/users'
import { UserRow } from './UserRow'

export function UserSearch({ suggested }: { suggested: SuggestedUser[] }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SuggestedUser[]>([])
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (!q) { setResults([]); setLoading(false); return }
    setLoading(true)
    const id = ++reqId.current
    const t = setTimeout(async () => {
      const res = await searchUsers(q)
      // Ignora respuestas obsoletas (la última petición gana).
      if (id === reqId.current) { setResults(res); setLoading(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const showingSearch = query.trim().length > 0

  return (
    <div>
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card/40 px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar usuarios"
            aria-label="Buscar usuarios"
            className="h-11 flex-1 bg-transparent text-sm outline-none"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {showingSearch ? (
        results.length === 0 && !loading
          ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">Sin resultados.</p>
          : results.map(u => <UserRow key={u.id} user={u} />)
      ) : (
        <>
          <p className="px-4 pt-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sugeridos
          </p>
          {suggested.length === 0
            ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">No hay sugerencias por ahora.</p>
            : suggested.map(u => <UserRow key={u.id} user={u} />)}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verificar**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/social/UserRow.tsx src/components/social/UserSearch.tsx
git commit -m "feat(social): UserRow y UserSearch (debounce + sugeridos)"
```

---

## Task 4: Página `/buscar` + icono de lupa en `/feed`

**Files:**
- Create: `src/app/(app)/buscar/page.tsx`
- Modify: `src/app/(app)/feed/page.tsx`

- [ ] **Step 1: Crear la página `/buscar`**

```tsx
// src/app/(app)/buscar/page.tsx
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getSuggestedUsers } from '@/app/actions/users'
import { UserSearch } from '@/components/social/UserSearch'

export default async function BuscarPage() {
  const suggested = await getSuggestedUsers()

  return (
    <div className="mx-auto max-w-lg pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/40 bg-background/90 px-4 py-3 backdrop-blur-md">
        <Link href="/feed" aria-label="Volver" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold">Buscar usuarios</h1>
      </header>
      <UserSearch suggested={suggested} />
    </div>
  )
}
```

- [ ] **Step 2: Añadir el icono de lupa en la cabecera de `/feed`**

En `src/app/(app)/feed/page.tsx`: importar `Search` y agrupar las acciones de la derecha. Reemplazar el bloque `<header>` por:

```tsx
import Link from 'next/link'
import { PlusCircle, Search } from 'lucide-react'
import { getDiscoverFeed, getFollowingFeed } from '@/app/actions/feed'
import { FeedTabs } from '@/components/social/FeedTabs'

export default async function FeedPage() {
  // Cargamos ambos feeds en paralelo (latencia = máx, no suma). getFollowingFeed es
  // barato si no sigues a nadie, y precargarlo hace que cambiar a la pestaña Siguiendo
  // sea instantáneo (sin flash de carga). Decisión deliberada para Fase 2.
  const [discover, following] = await Promise.all([getDiscoverFeed(), getFollowingFeed()])

  return (
    <div className="mx-auto max-w-lg pb-24">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/40 bg-background/90 px-4 py-3 backdrop-blur-md">
        <h1 className="text-lg font-bold">Comunidad</h1>
        <div className="flex items-center gap-1">
          <Link href="/buscar" aria-label="Buscar usuarios" className="flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground">
            <Search className="h-5 w-5" />
          </Link>
          <Link href="/feed/new" aria-label="Nueva publicación" className="inline-flex h-11 items-center gap-1.5 text-sm font-medium text-primary">
            <PlusCircle className="h-5 w-5" /> Publicar
          </Link>
        </div>
      </header>
      <FeedTabs discover={discover} following={following} />
    </div>
  )
}
```

- [ ] **Step 3: Verificar**

Run: `pnpm type-check`
Expected: PASS.
Run: `pnpm build`
Expected: compila; aparece la ruta `/buscar` (dinámica).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/buscar/page.tsx" "src/app/(app)/feed/page.tsx"
git commit -m "feat(social): página /buscar y acceso por lupa desde /feed"
```

---

## Task 5: Verificación final + checklist

**Files:** (sin cambios; verificación)

- [ ] **Step 1: Suite + type-check + build**

Run: `pnpm test && pnpm type-check && pnpm build`
Expected: todos los tests PASS (incluye los nuevos de `discovery`), type-check limpio, build compila con `/buscar`.

- [ ] **Step 2: Checklist manual** (con la app y al menos 2 cuentas)

- [ ] El icono de lupa en `/feed` abre `/buscar`.
- [ ] Buscar por nombre y por `@usuario` devuelve resultados (excluye a uno mismo).
- [ ] Seguir/dejar de seguir desde un resultado funciona (el botón cambia).
- [ ] Con la caja vacía se ven sugeridos = quienes publicaron hace poco (sin incluirme ni a los que ya sigo).
- [ ] Un usuario bloqueado no aparece ni en búsqueda ni en sugeridos.
- [ ] Una query con caracteres raros (`a, b ( c )`) no rompe la búsqueda.

- [ ] **Step 3: Commit (si hubo ajustes)**

```bash
git add -A
git commit -m "test(social): verificación de descubrimiento de usuarios"
```

---

## Self-Review (cobertura del spec)

- `sanitizeSearch` + `dedupePreservingOrder` (puros, TDD) → Task 1.
- `SuggestedUser` → Task 1.
- `searchUsers` (saneo, ILIKE, excluye self/bloqueados, isFollowing) → Task 2.
- `getSuggestedUsers` (recientemente activos, dedupe, excluye self/seguidos/bloqueados) → Task 2.
- `UserRow` (reusa `FollowButton`) → Task 3; `UserSearch` (debounce + race guard + sugeridos) → Task 3.
- `/buscar` → Task 4; lupa en `/feed` → Task 4.
- Testing (unit + build + checklist) → Tasks 1, 5.

**Fuera de alcance (correctamente excluido):** búsqueda de posts/hashtags, recientes de búsqueda, ranking avanzado, paginación, cuentas privadas.

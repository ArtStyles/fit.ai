# Diseño — Red social en FitAI (Fase 2: Grafo social + feed "Siguiendo")

- **Fecha:** 2026-06-25
- **Estado:** Aprobado para planificar
- **Autor:** ArtStyles (con Claude)
- **Depende de:** Fase 1 (`docs/superpowers/specs/2026-06-24-red-social-fase1-design.md`), ya mergeada a `main`.

## 1. Contexto y objetivo

La Fase 1 entregó una red social usable sin grafo social: feed **Descubrir** (global,
cronológico, keyset), perfiles públicos `/u/[username]`, posts/likes/comentarios y
moderación (reportar + bloquear). La Fase 2 añade el **grafo de seguidores** y un feed
personalizado **Siguiendo**, reutilizando casi toda la infraestructura existente
(keyset pagination, helpers de autor/likes, RLS, vista `public_profiles`).

## 2. Decisiones tomadas (brainstorming)

- **Feed con dos pestañas** en `/feed`: **Siguiendo | Descubrir**.
- **Pestaña por defecto: Descubrir** (siempre tiene contenido; al inicio casi nadie sigue a
  nadie). "Siguiendo" vacío → mensaje + CTA a Descubrir.
- **Contadores de seguidores/seguidos: computados al cargar el perfil** (dos `count`), no
  denormalizados (solo se muestran en el perfil, no en bucle de feed).
- **Bloquear hace auto-unfollow**: `blockUser` elimina las filas de `follows` en ambos
  sentidos (estándar IG/Twitter).
- **Botón Seguir solo en el perfil** `/u/[username]` (no en cada `PostCard`), para mantener
  el feed simple.

## 3. Modelo de datos

```sql
CREATE TABLE follows (
  follower_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT no_self_follow CHECK (follower_id <> following_id)
);
-- La PK cubre la dirección "a quién sigo"; este índice cubre "quién me sigue".
CREATE INDEX idx_follows_following ON follows(following_id);
```

### RLS
```sql
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follows: read" ON follows
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "follows: insert own" ON follows
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "follows: delete own" ON follows
  FOR DELETE TO authenticated USING (auth.uid() = follower_id);
```
Lectura pública entre autenticados (para contar seguidores de cualquiera). Escritura/borrado
solo de las propias relaciones (`follower_id = auth.uid()`).

## 4. Server Actions

Nuevas en `src/app/actions/follows.ts`:
- `followUser(targetId)` — inserta `{ follower_id: auth.uid(), following_id: targetId }`.
  Valida `targetId !== auth.uid()`. Devuelve `ActionResult<{ following: true }>`.
- `unfollowUser(targetId)` — borra la fila propia. `ActionResult<{ following: false }>`.

En `src/app/actions/feed.ts`:
- `getFollowingFeed(cursorToken?)` — igual que `getDiscoverFeed` (keyset por
  `(created_at, id)`, mismos helpers `loadAuthors`/`loadMyLikes`), pero limitado a
  `user_id IN (SELECT following_id FROM follows WHERE follower_id = auth.uid())`.
  Si no sigues a nadie → `{ posts: [], nextCursor: null }`. RLS sigue filtrando
  removidos/bloqueados.
- `getProfile(username)` — devuelve `{ author, posts, followerCount, followingCount,
  isFollowing, isMe }`. Reemplaza a `getUserPosts` (la página de perfil pasa a usar
  `getProfile`). `followerCount` = `count(follows where following_id = author.id)`;
  `followingCount` = `count(follows where follower_id = author.id)`; `isFollowing` =
  existe `follows(follower=me, following=author.id)`.

En `src/app/actions/moderation.ts`:
- `blockUser(blockedId)` — además del bloqueo, **borra `follows` en ambos sentidos** entre
  `auth.uid()` y `blockedId`.

## 5. UI

### Refactor: `PostFeed` genérico
Extraer el scroll infinito de `DiscoverFeed.tsx` a un componente genérico
`src/components/social/PostFeed.tsx` (cliente) con props:
`{ initialPosts: FeedPost[]; initialCursor: string | null; fetchPage: (cursor: string) =>
Promise<FeedPage>; emptyMessage?: React.ReactNode }`. Mantiene IntersectionObserver, append,
y el estado vacío configurable. `DiscoverFeed` desaparece (su rol lo cubre `FeedTabs` + `PostFeed`).

### `FeedTabs`
`src/components/social/FeedTabs.tsx` (cliente). Recibe los datos iniciales de ambos feeds
(`discover` y `following`) desde la página. Renderiza una cabecera con dos tabs
(Descubrir activo por defecto) y muestra el `PostFeed` correspondiente:
- Descubrir → `fetchPage = getFollowingFeed`/`getDiscoverFeed` según tab.
- Siguiendo → `emptyMessage` con texto "Sigue a gente para ver sus rutinas aquí." + botón a
  Descubrir.

### Página `/feed`
`src/app/(app)/feed/page.tsx` pasa a server-fetch **ambos** primeros lotes en paralelo
(`getDiscoverFeed()` y `getFollowingFeed()`) y renderiza `FeedTabs` con ambos. Conserva el
header con "Publicar".

### `FollowButton`
`src/components/social/FollowButton.tsx` (cliente, optimista): alterna Seguir / Siguiendo
llamando a `followUser`/`unfollowUser`; revierte en error (mismo patrón que `LikeButton`).

### Perfil `/u/[username]`
Usa `getProfile`. La cabecera muestra contadores (seguidores / seguidos) y, si `!isMe`, el
`FollowButton` con el estado `isFollowing` inicial.

## 6. Testing

- **Unit (vitest):** si se extrae lógica pura (p.ej. un helper que arme el filtro de "ids que
  sigo" o el merge ya existente), test directo. Reusa los tests de cursor de Fase 1. Las
  Server Actions se verifican con `pnpm type-check` (sin DB, como en Fase 1).
- **Checklist manual de RLS** (requiere DB migrada):
  1. Seguir y dejar de seguir a un usuario; el contador del perfil cambia.
  2. El feed "Siguiendo" muestra solo posts de a quién sigo (y nada si no sigo a nadie).
  3. No puedo auto-seguirme (CHECK + validación en la acción).
  4. No puedo insertar un follow con `follower_id` ajeno (RLS).
  5. Bloquear a alguien elimina el follow en ambos sentidos.

## 7. Despliegue

Fase 2 es **solo web/UI + 1 migración** (`022_follows.sql`): se aplica en Supabase y se
despliega en Vercel **sin recompilar APK** (no toca nativo).

## 8. Fuera de alcance (Fase 3 u opcional)

- Notificaciones de "nuevo seguidor" (Fase 3).
- Listas navegables de seguidores/seguidos.
- Botón Seguir dentro del `PostCard` del feed.
- Feed "Siguiendo" con ranking/algoritmo (se mantiene cronológico).
- Sugerencias de "a quién seguir".

## 9. Riesgos / notas

- **`getFollowingFeed` con muchos seguidos:** el `IN (subquery)` es suficiente para la escala
  de Fase 2; si crece mucho, se evaluará materializar timelines (fan-out-on-write) — fuera de
  alcance ahora.
- **Recompute de contadores:** computar al cargar es O(1) consultas por perfil; si se mostrara
  el contador en muchos sitios a la vez, se denormalizaría con triggers como en Fase 1.

# Diseño — Cuentas privadas

- **Fecha:** 2026-06-26
- **Estado:** Aprobado para planificar
- **Autor:** ArtStyles (con Claude)
- **Depende de:** Red social Fases 1-2 + Descubrimiento + Perfiles (todo en `main`).

## 1. Contexto y objetivo

Hoy el modelo es "público entre usuarios registrados": cualquiera ve el contenido de
cualquiera. Este sub-proyecto añade **cuentas privadas opcionales** (activable/desactivable por
el usuario): si tu cuenta es privada, tu contenido (posts) solo lo ven tus **seguidores
aceptados**, y seguirte pasa a ser una **solicitud** que apruebas/rechazas.

Es la pieza más grande y la única que **cambia el RLS de visibilidad de posts** (seguridad), así
que el diseño detalla ese núcleo.

## 2. Decisiones tomadas (brainstorming)

- Toggle privado en Ajustes (`is_private`).
- Seguir a una cuenta privada = **solicitud pendiente**; el dueño aprueba/rechaza. Las cuentas
  públicas siguen con seguir instantáneo.
- Gestión de solicitudes: **icono de campana en `/feed`** con badge → página `/solicitudes`
  (lista con Aceptar/Rechazar). (Germen del centro de notificaciones de Fase 3; por ahora solo
  solicitudes.)
- Perfil privado visto por un **no-seguidor**: **contadores visibles** (publicaciones /
  seguidores / siguiendo) + **banner "cuenta privada"** en lugar de la cuadrícula. Candado junto
  al nombre.
- Al volverte privado, **tus seguidores actuales se conservan** (siguen `accepted`); solo los
  nuevos requieren aprobación.
- Las cuentas privadas **siguen apareciendo en la búsqueda** (para poder solicitarlas).
- Una solicitud enviada es **cancelable** (tocar "Solicitado" la retira).
- El dueño siempre ve su propio perfil completo.

## 3. Datos / migración `024`

```sql
-- profiles: flag de privacidad + contador denormalizado de posts
ALTER TABLE profiles ADD COLUMN is_private BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN post_count INTEGER NOT NULL DEFAULT 0;

-- follows: estado de la relación (accepted = seguir efectivo; pending = solicitud)
ALTER TABLE follows ADD COLUMN status TEXT NOT NULL DEFAULT 'accepted'
  CHECK (status IN ('accepted','pending'));
-- (las filas existentes quedan 'accepted' por el DEFAULT)
CREATE INDEX idx_follows_following_status ON follows(following_id, status);

-- backfill de post_count (posts no removidos)
UPDATE profiles p SET post_count = (
  SELECT count(*) FROM posts po WHERE po.user_id = p.id AND po.removed_at IS NULL
);

-- trigger que mantiene post_count (SECURITY DEFINER, como los contadores de likes/comentarios)
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
CREATE TRIGGER trg_posts_profile_count
  AFTER INSERT OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION bump_profile_post_count();

-- public_profiles pasa a exponer is_private y post_count (no sensibles)
DROP VIEW public_profiles;
CREATE VIEW public_profiles AS
  SELECT id, username, full_name, avatar_url, is_private, post_count FROM profiles;
GRANT SELECT ON public_profiles TO authenticated;
```

Notas:
- `post_count` cuenta posts no-removidos al hacer backfill; el trigger no distingue removidos
  (un post moderado sigue contando hasta borrarse) — aceptable.
- `post_count` es **necesario** porque en un perfil privado que no puedes ver, el RLS oculta las
  filas de `posts`, así que un `count` daría 0; el contador denormalizado permite mostrar el
  número real. De paso reemplaza el `posts.length` (tope 60) en la cabecera.

## 4. Seguridad / RLS (núcleo)

### `posts` — visibilidad
Reemplazar la política `"posts: read visible"` para añadir la regla de privacidad. Un post es
visible si: no está removido, no hay bloqueo, **y** (eres el autor **o** el autor es público
**o** eres seguidor aceptado del autor):

```sql
DROP POLICY "posts: read visible" ON posts;
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
```

**Por qué `public_profiles` y no `profiles`:** el RLS de `profiles` es solo-dueño, así que una
subconsulta a `profiles` desde la política no podría leer el `is_private` de OTRO usuario (lo
trataría como público por error). `public_profiles` es una vista con seguridad de propietario
(bypassa ese RLS) y ya expone `is_private`, así que la comprobación es correcta para cualquier
autor. `follows` tiene lectura pública entre autenticados, así que el `EXISTS` de seguidor
funciona.

Efecto: los posts privados quedan ocultos automáticamente en Descubrir, Siguiendo, perfil y
búsqueda para quien no es seguidor aceptado.

### `follows` — aprobar/rechazar
Las políticas actuales permiten al **seguidor** insertar/borrar su fila. Añadimos que el
**seguido** pueda aceptar (UPDATE) o rechazar (DELETE) las filas dirigidas a él:

```sql
CREATE POLICY "follows: followed can accept" ON follows
  FOR UPDATE TO authenticated
  USING (auth.uid() = following_id) WITH CHECK (auth.uid() = following_id);
CREATE POLICY "follows: followed can reject" ON follows
  FOR DELETE TO authenticated USING (auth.uid() = following_id);
```
(La política existente `"follows: delete own"` con `follower_id = auth.uid()` se mantiene para
que el seguidor pueda cancelar/dejar de seguir.)

## 5. Server Actions

- `setPrivacy(isPrivate: boolean): ActionResult` — `UPDATE profiles SET is_private` (propia).
- `followUser(targetId)` (modificado): consulta `public_profiles.is_private` del objetivo; inserta
  `{ follower_id, following_id, status: isPrivate ? 'pending' : 'accepted' }`. Devuelve
  `ActionResult<{ status: 'pending' | 'accepted' }>`.
- `unfollowUser(targetId)` (sin cambio funcional): borra la fila propia (sirve para dejar de
  seguir y para cancelar una solicitud pendiente).
- `getFollowRequests(): Promise<RequestUser[]>` — solicitudes `pending` con `following_id = me`,
  junto al perfil público del solicitante.
- `acceptFollowRequest(followerId): ActionResult` — `UPDATE follows SET status='accepted'
  WHERE follower_id = followerId AND following_id = me AND status='pending'`.
- `rejectFollowRequest(followerId): ActionResult` — `DELETE ... WHERE follower_id = followerId
  AND following_id = me`.
- `getPendingRequestCount(): number` — para el badge de la campana.
- `getProfile` (modificado): añade `isPrivate`, `postCount`, `canViewPosts`
  (= `!isPrivate || isMe || seguidor aceptado`), y `followState`. Si `!canViewPosts` → `posts: []`.
  `followerCount`/`followingCount` cuentan solo `status='accepted'`.
- `getFollowingFeed` (modificado): solo autores con follow `status='accepted'`.
- `searchUsers`/`getSuggestedUsers` (modificados): cada resultado incluye `isPrivate` y
  `followState` (en vez de `isFollowing`).

## 6. Lógica pura

`src/lib/social/follow.ts`:
```ts
export type FollowState = 'follow' | 'request' | 'requested' | 'following'
export function followButtonState(input: { isPrivate: boolean; status: 'none' | 'pending' | 'accepted' }): FollowState
// accepted→'following'; pending→'requested'; none+private→'request'; none+public→'follow'
```
Test directo (TDD).

## 7. UI

- **`FollowButton` (refactor):** props `{ targetId, isPrivate, initialState: FollowState }`. Mapea
  estado→acción optimista:
  - `follow` → `followUser` → `following`
  - `request` → `followUser` → `requested`
  - `requested` → `unfollowUser` (cancela) → `request`
  - `following` → `unfollowUser` → `follow`/`request` (según `isPrivate`)
  Etiquetas: Seguir / Solicitar / Solicitado / Siguiendo. Revierte en error.
- **Ajustes:** `PrivacyToggle` (cliente) que llama a `setPrivacy`. Ubicar en `/settings/perfil`
  o `/settings`.
- **Campana en `/feed`:** icono con badge (`getPendingRequestCount`) en la cabecera → `/solicitudes`.
- **`/solicitudes`** (`src/app/(app)/solicitudes/page.tsx`): lista de `getFollowRequests` con
  botones Aceptar/Rechazar (`RequestRow` cliente).
- **Perfil `/u/[username]`:** candado junto al nombre si `isPrivate`; usa `postCount` para la
  cabecera; si `isPrivate && !canViewPosts` → muestra contadores + **banner "cuenta privada"**
  (componente `PrivateProfileNotice`) en lugar de `ProfilePostGrid`. El `FollowButton` recibe
  `isPrivate` + `followState`.
- **`UserRow`** (búsqueda): el `FollowButton` recibe `isPrivate` + `followState`.

## 8. Testing

- **Unit (vitest):** `followButtonState` (los 4 casos).
- **Acciones/UI:** `pnpm type-check` + `pnpm build`.
- **Checklist manual de RLS (crítico, con migraciones aplicadas y 2-3 cuentas):**
  1. B pone su cuenta privada en Ajustes.
  2. A (no seguidor) ve el perfil de B con contadores + banner, sin posts; en Descubrir/búsqueda
     no aparecen los posts de B.
  3. A pulsa "Solicitar" → "Solicitado"; B ve la solicitud en la campana de `/feed`.
  4. B acepta → A pasa a "Siguiendo" y ya ve los posts de B (perfil + feed Siguiendo).
  5. B rechaza otra solicitud → desaparece; el solicitante vuelve a "Solicitar".
  6. A cancela una solicitud pendiente (toca "Solicitado").
  7. Al volver B a privada, sus seguidores antiguos siguen viendo su contenido.
  8. Verificar en SQL que un no-seguidor no puede `SELECT` posts de una cuenta privada.

## 9. Despliegue

Web/UI + **una migración** (`024`). Se aplica en Supabase y despliega en Vercel **sin recompilar
APK** (no toca nativo).

## 10. Fuera de alcance

- Centro de notificaciones completo (la campana por ahora solo lista solicitudes de seguimiento).
- "Mejores amigos" / listas de visibilidad por post.
- Bloqueo de capturas de pantalla.
- Notificar al solicitante cuando lo aceptan (eso es Fase 3 — notificaciones).
- Migrar posts ya existentes de cuentas que se vuelven privadas (el RLS los oculta
  automáticamente; no hay datos que mover).

# Diseño — Red social en FitAI (Fase 1: Cimientos sociales)

- **Fecha:** 2026-06-24
- **Estado:** Aprobado para planificar
- **Autor:** ArtStyles (con Claude)

## 1. Contexto y objetivo

FitAI es una app de fitness (Next.js 14 App Router + Supabase + Capacitor) donde hoy
**todo el contenido es privado** (RLS "solo el dueño" en todas las tablas). La propuesta
es añadir una capa de **red social**: publicar fotos y rutinas, con likes y comentarios.

La visión completa es una red social con grafo de seguidores y feed personalizado, pero
eso son **varios subsistemas**. Este spec cubre **solo la Fase 1**, que ya entrega una red
social usable sin necesidad de follows.

## 2. Decisiones tomadas (brainstorming)

- **Alcance:** red social completa, construida **por fases**.
- **Publicación unificada:** un post puede contener foto(s) + texto + una sesión completada
  + una rutina clonable, en cualquier combinación.
- **Privacidad:** todo **público entre usuarios registrados**. Seguir (Fase 2) solo
  personaliza el feed; no restringe el acceso. No hay cuentas privadas.

## 3. Descomposición en fases

| Fase | Contenido | Entregable independiente |
|------|-----------|--------------------------|
| **1 — Cimientos sociales** *(este spec)* | `posts`, `post_likes`, `post_comments`, feed Descubrir global, perfiles públicos, clonar rutina, compartir sesión, moderación base | Red social usable sin follows |
| 2 — Grafo social | `follows`, feed "Siguiendo", contadores y botón seguir | Feed personalizado |
| 3 — Notificaciones | `notifications` (like/comentario/seguidor), centro in-app, push opcional (Capacitor) | Engagement |

Cada fase tendrá su propio ciclo spec → plan → implementación.

## 4. Modelo de datos (Fase 1)

**Decisión de seguridad — snapshots en lugar de referencias:** un post **no referencia**
las tablas privadas (`progress_logs`, `workout_plans`). Guarda una **copia (`jsonb`)** de lo
que se muestra. Así no hay que aflojar el RLS de las tablas privadas, y el contenido
compartido queda congelado aunque el original se edite o se borre.

```sql
CREATE TABLE posts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body             TEXT,                       -- texto / caption (opcional)
  photo_urls       TEXT[]      NOT NULL DEFAULT '{}',  -- 0..n fotos (bucket 'posts')
  session_snapshot JSONB,                      -- stats de sesión compartida (opcional)
  routine_snapshot JSONB,                      -- estructura de rutina clonable (opcional)
  like_count       INTEGER     NOT NULL DEFAULT 0,     -- denormalizado (trigger)
  comment_count    INTEGER     NOT NULL DEFAULT 0,     -- denormalizado (trigger)
  removed_at       TIMESTAMPTZ,                -- moderación: ocultar sin borrar
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- un post debe tener al menos texto, una foto, una sesión o una rutina
  CONSTRAINT posts_has_content CHECK (
    body IS NOT NULL OR array_length(photo_urls,1) IS NOT NULL
    OR session_snapshot IS NOT NULL OR routine_snapshot IS NOT NULL
  )
);
CREATE INDEX idx_posts_created ON posts(created_at DESC, id DESC);  -- keyset feed
CREATE INDEX idx_posts_user    ON posts(user_id);

CREATE TABLE post_likes (
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE post_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_post_comments_post ON post_comments(post_id, created_at);

CREATE TABLE post_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID REFERENCES posts(id) ON DELETE CASCADE,
  comment_id  UUID REFERENCES post_comments(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT report_target CHECK (num_nonnulls(post_id, comment_id) = 1)
);

CREATE TABLE user_blocks (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT no_self_block CHECK (blocker_id <> blocked_id)
);
```

### Forma de los snapshots

`session_snapshot`:
```json
{
  "workout_name": "Push A",
  "completed_at": "2026-06-24T18:30:00Z",
  "duration_minutes": 62,
  "total_volume_kg": 5400,
  "exercises": [
    { "name": "Press de banca", "sets": [{ "reps": 8, "weight_kg": 80 }], "is_pr": true }
  ]
}
```

`routine_snapshot` (conserva `exercise_id` de la librería pública para re-enlazar al clonar):
```json
{
  "name": "Full Body 3 días",
  "goal": "build_muscle",
  "days_per_week": 3,
  "difficulty": "intermediate",
  "workouts": [
    { "name": "Día A", "day_of_week": 1, "exercises": [
      { "exercise_id": "uuid", "name": "Sentadilla", "order_index": 0,
        "sets": 4, "reps": 8, "rest_seconds": 120, "weight_kg": null }
    ]}
  ]
}
```

### Contadores por trigger

Triggers `AFTER INSERT/DELETE` en `post_likes` y `post_comments` mantienen
`posts.like_count` / `posts.comment_count`, evitando consultas N+1 en el feed.

## 5. Seguridad / RLS

Se añaden políticas **nuevas**; las existentes (solo-dueño) no se tocan.

- **`posts`**
  - `SELECT`: usuario autenticado, `removed_at IS NULL` y sin bloqueo en ninguna dirección
    entre autor y lector.
  - `INSERT/UPDATE/DELETE`: solo `auth.uid() = user_id`.
- **`post_likes`**: `SELECT` autenticado; `INSERT/DELETE` solo propio.
- **`post_comments`**: `SELECT` como posts (autenticado + `removed_at IS NULL` + filtro de
  bloqueo); `INSERT/UPDATE/DELETE` solo propio.
- **`post_reports`**: `INSERT` propio (`auth.uid() = reporter_id`); sin `SELECT` desde cliente
  (revisión con service-role).
- **`user_blocks`**: todas las operaciones restringidas a `auth.uid() = blocker_id`.

Predicado de bloqueo reutilizable:
```sql
NOT EXISTS (
  SELECT 1 FROM user_blocks b
  WHERE (b.blocker_id = auth.uid()  AND b.blocked_id = posts.user_id)
     OR (b.blocker_id = posts.user_id AND b.blocked_id = auth.uid())
)
```

### Perfiles públicos sin filtrar datos sensibles

`profiles` contiene peso, altura, fecha de nacimiento y género. **No** se abre `SELECT` sobre
la tabla. Se crea una **vista** que expone solo lo público; los posts y los perfiles públicos
leen de ella. El RLS de `profiles` queda intacto.

```sql
CREATE VIEW public_profiles AS
  SELECT id, username, full_name, avatar_url FROM profiles;
GRANT SELECT ON public_profiles TO authenticated;
```

## 6. Server Actions + feed

Siguiendo el patrón existente (`src/app/actions/`, escritura de imágenes con service-role como
en `updateAvatar`):

- `createPost(input)` — texto + URLs de fotos subidas + snapshots opcionales.
- `createPostFromSession(progressLogId, body?)` — construye `session_snapshot` desde los
  `progress_logs`/`exercise_logs` **propios** del usuario.
- `deletePost(postId)`.
- `toggleLike(postId)`.
- `addComment(postId, body)` · `deleteComment(commentId)`.
- `clonePlanFromPost(postId)` — copia `routine_snapshot` a `workout_plans` + `workouts` +
  `workout_exercises` del usuario actual (re-enlaza `exercise_id` a la librería pública).
- `reportContent({ postId | commentId, reason })`.
- `blockUser(userId)` · `unblockUser(userId)`.

**Feed Descubrir:** `getDiscoverFeed({ cursor })`
- Paginación **keyset** por `(created_at, id)` descendente.
- Excluye `removed_at IS NOT NULL` y relaciones bloqueadas.
- Devuelve por cada post: perfil público del autor (vía `public_profiles`) y si el usuario
  actual ya dio like.

**Almacenamiento de fotos:** nuevo bucket público **`posts`** (migración análoga a
`018_avatars_bucket.sql`), ruta `{userId}/{postId}/{n}.webp`. Escritura por service-role en la
Server Action; lectura pública.

## 7. UI / rutas + moderación

Rutas nuevas dentro del grupo `(app)`:
- `/feed` — Descubrir: lista de `PostCard` con scroll infinito (keyset).
- Compositor de publicación (modal o `/feed/new`): reutiliza recorte/subida de
  `AvatarUploader`; selectores opcionales para adjuntar una sesión o una rutina.
- `/u/[username]` — perfil público: cabecera (avatar, nombre, username) + sus publicaciones.
- `/post/[id]` — detalle del post con comentarios.

Componentes:
- `PostCard` — texto, fotos, tarjeta de sesión, tarjeta de rutina con botón **Clonar**, botón
  like, contador de comentarios, menú `…` con **Reportar** y **Bloquear**.
- `PostComposer`, `CommentList` / `CommentInput`, `LikeButton` (optimista).
- `ReportDialog`, `BlockButton`.
- Entrada nueva en la navegación de la app.

Diseño según convenciones del proyecto (Barlow, dark, aurora, objetivos táctiles 44px,
framer-motion); pase visual fino con `ui-ux-pro-max`.

**Moderación (requisito Play Store):** el contenido generado por usuarios exige un mecanismo
de reporte. La Fase 1 cubre: reportar (post/comentario) + bloquear usuario + ocultar contenido
(service-role pone `removed_at`) + borrar lo propio.

## 8. Testing

- **Unit (vitest):** constructores de snapshot (sesión/rutina), lógica de `clonePlanFromPost`,
  filtrado por bloqueo del feed.
- **RLS:** checklist de verificación —
  1. Un usuario lee posts de otros.
  2. No lee posts de quien lo bloqueó (ni los de quien él bloqueó).
  3. No puede editar/borrar posts ni comentarios ajenos.
  4. `public_profiles` no expone peso/altura/fecha de nacimiento/género.
  - Opcional: automatizar con pgTAP.

## 9. Fuera de alcance (YAGNI en Fase 1)

- Follows, feed "Siguiendo" y feed personalizado/algorítmico → Fase 2.
- Notificaciones in-app y push → Fase 3.
- Cuentas privadas / solicitudes de seguimiento.
- Comentarios anidados (en Fase 1 son planos).
- Hashtags, menciones, búsqueda de usuarios, compartir fuera de la app.
- Panel de administración de moderación (en Fase 1 la revisión es manual con service-role).

## 10. Despliegue

Fase 1 es **solo web/UI + base de datos**: se despliega en Vercel **sin recompilar APK**, salvo
que se decida usar la cámara nativa (Capacitor Camera) para tomar fotos —en cuyo caso sí habría
cambio nativo. Por defecto se usa input de archivo (igual que el avatar), que no requiere
recompilar.

## 11. Riesgos / decisiones abiertas

- **Coste de moderación manual:** aceptable al inicio; reconsiderar si el volumen crece.
- **Tamaño/optimización de imágenes:** reutilizar el pipeline de `sharp`/webp del avatar.
- **Nombre de la sección en la navegación** ("Comunidad", "Feed", "Social"): a decidir en
  implementación.

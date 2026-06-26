# Diseño — Perfiles (usernames + perfil estilo Instagram)

- **Fecha:** 2026-06-26
- **Estado:** Aprobado para planificar
- **Autor:** ArtStyles (con Claude)
- **Depende de:** Red social Fases 1-2 (en `main`) + Descubrimiento de usuarios (rama `feat/social-user-discovery`, sobre la que se apila esta).

## 1. Contexto y objetivo

El perfil vive en `/u/[username]`, pero **`username` nunca se asigna** (registro, onboarding y
ajustes no lo escriben) → hoy **todos los usuarios tienen `username = null`** y ningún perfil es
accesible (los enlaces a autores en el feed van a `#`). Este sub-proyecto:

1. **Cimiento de usernames:** todo usuario tiene un `@username` único — se elige en onboarding,
   se rellena a los existentes con una migración, y se puede editar en Ajustes.
2. **Perfil estilo Instagram:** rediseño de `/u/[username]` con cabecera IG (avatar + contadores)
   y **cuadrícula de 3 columnas** de posts; funciona igual para el perfil propio (con botón
   "Editar perfil") que para el de otra persona (con "Seguir").

Cuentas privadas es el **siguiente** sub-proyecto (no entra aquí).

## 2. Decisiones tomadas (brainstorming)

- Username se **recoge en onboarding** (primer paso), no en el formulario crudo de `auth.signUp`
  (evita el problema de unicidad dentro del trigger `handle_new_user`).
- Usuarios existentes con `username = null` → **backfill por migración**.
- Posts del perfil en **cuadrícula 3 columnas** (estilo IG); los posts sin foto
  (sesión/rutina/texto) se muestran como un tile con icono + etiqueta.
- Perfil propio → botón **"Editar perfil"**; perfil ajeno → **`FollowButton`**.
- Entrada al perfil propio: avatar del `DashboardHeader` + enlace en Ajustes.

## 3. Parte 1 — Cimiento de usernames

### Reglas (funciones puras, testeables) — `src/lib/social/username.ts`
- `normalizeUsername(raw: string): string` — `trim().toLowerCase()`.
- `validateUsername(raw: string): { ok: true; value: string } | { ok: false; error: string }`
  - normaliza, luego exige: 3-20 caracteres, patrón `^[a-z][a-z0-9_]*$` (empieza por letra; solo
    minúsculas, dígitos y `_`). Devuelve el `value` normalizado.
- Unicidad **case-insensitive**: como se guarda siempre normalizado, basta comparar por igualdad.

### Disponibilidad — Server Action `checkUsernameAvailable(raw)`
- Normaliza+valida; si inválido → `{ available: false, error }`.
- Lee `public_profiles` (legible por autenticados) con `.eq('username', value).neq('id', me)`:
  si existe fila → no disponible. (Ignora la propia fila para el caso de edición.)

### Set/Update — Server Action `updateUsername(raw): ActionResult`
- Auth + `validateUsername` + re-chequeo de disponibilidad en servidor.
- `UPDATE profiles SET username = value WHERE id = auth.uid()` (cliente de usuario, RLS propia).
- Maneja violación de UNIQUE (carrera) devolviendo error amigable. La usan onboarding y ajustes.

### Recogida en onboarding — nuevo primer paso
- `OnboardingWizard`: añadir `'username'` como **primer** `StepKey`. Componente de paso con input,
  **chequeo de disponibilidad con debounce** (`checkUsernameAvailable`), mensajes de validación, y
  botón "Continuar" deshabilitado hasta que sea válido y esté libre. Al continuar llama a
  `updateUsername`; solo avanza si `ok`.

### Backfill — migración `023_backfill_usernames.sql`
- Para `profiles` con `username IS NULL`: asignar
  `'user_' || substr(replace(id::text, '-', ''), 1, 12)`.
  - Cumple las reglas (empieza por letra, `[a-z0-9_]`, longitud 17 ≤ 20) y es **único** (derivado
    del id). No es bonito, pero es correcto y el usuario puede cambiarlo en Ajustes.

### Editar en Ajustes → Perfil
- Añadir un campo de username en la pantalla de perfil (`/settings/perfil`) con la misma
  validación + disponibilidad en vivo, guardando con `updateUsername`.

## 4. Parte 2 — Perfil estilo Instagram (`/u/[username]`)

### Cabecera IG
- Avatar (grande) a la izquierda; a la derecha, fila de **contadores** (publicaciones /
  seguidores / siguiendo). Debajo: nombre + `@username`. Botón de acción a lo ancho:
  - `isMe` → **"Editar perfil"** (enlace a `/settings/perfil`).
  - `!isMe` → **`FollowButton`** (con `isFollowing` inicial).

### Cuadrícula de posts — `ProfilePostGrid.tsx`
- 3 columnas de tiles cuadrados (`aspect-ratio: 1`). Tipo de tile por post (función pura
  `postTileKind(post): 'photo' | 'session' | 'routine' | 'text'`):
  - `photo` (si `photo_urls.length > 0`) → miniatura de la primera foto.
  - `session` (si `session_snapshot`) → icono mancuerna + "Sesión".
  - `routine` (si `routine_snapshot`) → icono lista + "Rutina".
  - `text` → icono texto (+ recorte opcional del body).
- Cada tile enlaza a `/post/[id]`. Estado vacío: "Sin publicaciones todavía."

### Entradas al perfil propio
- `DashboardHeader`: el avatar enlaza a `/u/<username>` (oculto/deshabilitado si `username` es
  null por seguridad).
- Ajustes: enlace "Ver mi perfil" → `/u/<username>`.
- (Para esto, el componente que enlaza necesita el `username` del usuario actual; se pasa desde el
  server component que ya carga el perfil, p. ej. el layout/`requireAppUserContext`.)

### Reutiliza
- `getProfile(username)` ya devuelve `{ author, posts, followerCount, followingCount, isFollowing,
  isMe }`. El grid consume `posts`.

## 5. Resumen de archivos (orientativo; el plan lo detalla)

- Create: `src/lib/social/username.ts` (+ tests) — `normalizeUsername`, `validateUsername`.
- Create: `src/app/actions/username.ts` — `checkUsernameAvailable`, `updateUsername`.
- Create: `supabase/migrations/023_backfill_usernames.sql`.
- Modify: `src/app/onboarding/*` — paso de username (componente + integración en el wizard).
- Modify: `src/app/(app)/settings/perfil/*` — campo de username.
- Create: `src/components/social/ProfilePostGrid.tsx` + `postTileKind` puro (en `username.ts` o
  un `discovery.ts`/nuevo `profile.ts`; el plan decide dónde, con su test).
- Modify: `src/app/(app)/u/[username]/page.tsx` — cabecera IG + grid + "Editar perfil".
- Modify: `src/components/dashboard/DashboardHeader.tsx` — avatar enlaza al perfil propio.

## 6. Testing

- **Unit (vitest):** `normalizeUsername`, `validateUsername` (casos válidos/ inválidos: corto,
  largo, mayúsculas→normaliza, empieza por dígito, caracteres ilegales), `postTileKind`
  (foto/sesión/rutina/texto y prioridad foto > sesión > rutina > texto).
- **Acciones/UI:** `pnpm type-check` + `pnpm build`.
- **Checklist manual:**
  1. En onboarding, el primer paso pide username; rechaza inválidos y los ya tomados; al elegir uno
     libre, continúa y queda guardado.
  2. Tras aplicar la migración 023, los usuarios existentes tienen un username y su perfil es
     accesible.
  3. Editar el username en Ajustes funciona (valida + disponibilidad).
  4. `/u/<username>` muestra cabecera IG + cuadrícula; tocar un tile abre el post.
  5. En tu propio perfil sale "Editar perfil"; en el de otro, "Seguir".
  6. El avatar del dashboard abre tu perfil.

## 7. Despliegue

Web/UI + **una migración** (`023`). Se aplica en Supabase y despliega en Vercel **sin recompilar
APK** (no toca nativo).

## 8. Fuera de alcance

- **Cuentas privadas** (siguiente sub-proyecto: toggle + solicitudes + RLS + banner privado).
- Bios, enlaces, o portada en el perfil.
- Validar el username en el formulario crudo de `auth.signUp` (se hace en onboarding).
- Cambiar el username con histórico/redirecciones de la URL antigua.
- `NOT NULL` en `profiles.username` (se mantiene nullable; la app garantiza asignación).

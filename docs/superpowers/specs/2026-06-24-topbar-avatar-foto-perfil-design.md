# Rediseño del topbar del dashboard + foto de avatar + sección Perfil

**Fecha:** 2026-06-24
**Estado:** Aprobado (diseño)

## Contexto y objetivo

El topbar del dashboard ([`DashboardHeader.tsx`](../../../src/components/dashboard/DashboardHeader.tsx))
mezcla hoy: un logo (mancuerna), el saludo + nombre, un chip de momentum, y un avatar
que abre un `DropdownMenu` (Medidas, Ajustes, Cerrar sesión). Una raya (`border-b`) separa
el topbar del contenido y el header es fijo (`sticky`).

Objetivos:

1. Rediseñar el topbar: quitar la raya divisoria y el logo, avatar más grande a la izquierda,
   saludo de bienvenida reubicado para que se vea bien.
2. Eliminar el `DropdownMenu` del avatar. Su contenido se accede solo desde Ajustes
   (barra de navegación inferior).
3. Añadir la posibilidad de poner una foto en el avatar.

## Decisiones tomadas

- **Tocar el avatar** (topbar) abre directamente el selector de foto (cámara/galería). No
  reintroduce ningún menú de ajustes.
- **El logo** (mancuerna) se elimina; el avatar ancla la izquierda.
- **La foto se gestiona** en una **nueva sección "Perfil"** dedicada a la identidad
  (foto + nombre), separada de "Datos personales".
- **Subida de la foto:** recorte cuadrado + reescalado en el cliente (Canvas, ~512px, webp)
  → `FormData` → Server Action → bucket público `avatars` vía `createServiceClient()`
  (upsert en `{userId}/avatar.webp`). Réplica del patrón de `013_exercise_images.sql`
  (bucket público + escrituras service-role) y del patrón de Server Actions del proyecto.
- **Topbar no fijo:** el bloque avatar+saludo pasa a ser el primer contenido de la página
  (hace scroll con el resto), sin raya ni barra.

## A. Topbar del dashboard

Archivo: [`src/components/dashboard/DashboardHeader.tsx`](../../../src/components/dashboard/DashboardHeader.tsx)
(sigue siendo `'use client'`, mismas props: `greeting`, `firstName`, `avatarUrl`, `momentumScore`).

```
╭─────╮   Buenos días,
│ FE  │   Fernando            ← nombre en bold
│   📷│   ⚡ 72 · Al máximo   ← chip de momentum
╰─────╯
```

- **Se elimina:** la raya (`border-b border-border/40`), el `sticky`/`bg`/`backdrop-blur`,
  el bloque del logo (mancuerna), y todo el `DropdownMenu` (con sus imports: `DropdownMenu*`,
  `signOut`, `PendingLink`, `Dumbbell`, `LogOut`, `Ruler`, `Settings`).
- **Layout:** contenedor `mx-auto max-w-lg px-4` con padding superior, alineado con el `<main>`
  del dashboard. `flex items-center gap-4`: a la izquierda el avatar editable (~64px), a la
  derecha el saludo (muted), el nombre (bold) y el chip de momentum debajo.
- **Avatar:** se renderiza con `<AvatarUploader size="header" ... />` (ver sección B). Lleva un
  badge de cámara que indica que es editable; al tocarlo abre el selector de foto.
- **`DevModeBanner`** se conserva, reubicado de forma discreta (p. ej. esquina superior derecha
  del bloque).
- `getMomentumStyle` y el chip se mantienen igual.

## B. Foto de perfil (feature nueva)

### B.1 Migración `supabase/migrations/018_avatars_bucket.sql`

Bucket público `avatars`, mismo patrón que `013`:

```sql
-- 018_avatars_bucket.sql
-- Bucket público para fotos de avatar de usuario.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;
```

Lectura pública (como las imágenes de ejercicios); escrituras solo vía service-role desde la
Server Action, que controla la ruta `{userId}/avatar.webp`. No se requieren políticas RLS sobre
`storage.objects`. **Debe ejecutarse en el SQL Editor de Supabase** (no es código de la app).

> Nota de privacidad: la URL del avatar es pública (igual que las imágenes de ejercicios).
> Aceptable para una foto de perfil que el propio usuario sube.

### B.2 Server Actions: `src/app/actions/avatar.ts`

`'use server'`. Devuelven un resultado (no `redirect`) para que el componente cliente muestre
estado/toast y refresque.

- **`updateAvatar(formData): Promise<{ ok: true; url: string } | { ok: false; error: string }>`**
  1. Auth con `createClient()` (SSR) → `auth.getUser()`; si no hay usuario, `{ ok: false }`.
  2. Lee `file` del `FormData`; valida que es imagen y tamaño ≤ ~5MB (defensa; el cliente ya
     reescala).
  3. Con `createServiceClient()`: `storage.from('avatars').upload('{userId}/avatar.webp', file,
     { contentType: file.type, upsert: true, cacheControl: '3600' })` (el `contentType` viene del
     blob, webp o jpeg según el fallback del cliente).
  4. `getPublicUrl` + `?v=${Date.now()}` (cache-busting al sobreescribir).
  5. `update profiles set avatar_url = <url> where id = userId`.
  6. `revalidatePath('/dashboard')`, `revalidatePath('/settings/perfil')`. Devuelve `{ ok, url }`.
- **`removeAvatar(): Promise<{ ok: boolean }>`**
  1. Auth.
  2. `storage.from('avatars').remove(['{userId}/avatar.webp'])` (ignora "no encontrado").
  3. `update profiles set avatar_url = null`.
  4. Revalida `/dashboard` y `/settings/perfil`.

### B.3 Util de imagen: `src/lib/images/resizeSquare.ts`

`async function resizeImageToSquare(file: File, size = 512, quality = 0.85): Promise<{ blob: Blob; contentType: string }>`
— carga la imagen, recorta al cuadrado centrado y la dibuja en un `<canvas>` de `size×size`,
exporta con `canvas.toBlob(..., 'image/webp', quality)`. Si `toBlob` con `webp` devuelve `null`
(WebView sin soporte), reintenta con `'image/jpeg'`. Devuelve el blob y su `contentType` para que
la Server Action lo use al subir. Mantiene el payload pequeño y entrega un recorte cuadrado para
el avatar circular. Módulo cliente (usa `document`/`canvas`).

### B.4 Componente: `src/components/profile/AvatarUploader.tsx`

`'use client'`. Reutilizable en topbar y en Ajustes → Perfil.

- **Props:** `avatarUrl: string | null`, `initials: string`, `size?: 'header' | 'lg'`
  (≈64px vs ≈96px), `editable?: boolean` (default `true`), `showRemove?: boolean`
  (solo en Ajustes).
- **Estado:** `preview` (object URL optimista), `pending`.
- **Interacción:** `<input type="file" accept="image/*">` oculto; al tocar el avatar →
  `input.click()`. Al elegir archivo → `resizeImageToSquare` → `URL.createObjectURL` (preview) →
  `FormData.append('file', blob, 'avatar.webp')` → `updateAvatar`. En éxito: `router.refresh()`;
  en error: toast y revertir el preview.
- **Visual:** `Avatar` (imagen = `preview ?? avatarUrl`, fallback = iniciales con el degradado
  violeta actual) + badge de cámara (esquina inferior derecha) + overlay de spinner mientras
  `pending`.
- **Variante `lg` (Ajustes):** además botón "Quitar foto" (`removeAvatar`) si `showRemove`.

El `<input type="file" accept="image/*">` funciona en el WebView de Capacitor (abre el selector
nativo cámara/galería); no se necesita plugin nativo.

## C. Reestructura de Ajustes

| Sección | Ruta | Contenido | Cambio |
|---|---|---|---|
| **Perfil** | `/settings/perfil` | Foto (AvatarUploader `lg`) + nombre | **nueva** |
| Datos personales | `/settings/datos` | Altura, peso, nacimiento, género | **renombrada** (se le quita el nombre) |
| Entrenamiento | `/settings/entrenamiento` | — | sin cambios |
| **Medidas** | `/medidas` | (pantalla existente) | **nueva entrada** (enlace) |
| Notificaciones | `/settings/notificaciones` | — | sin cambios |
| Cuenta | `/settings/cuenta` | Cerrar sesión, borrar cuenta | sin cambios |

### C.1 Nueva sección "Perfil": `src/app/(app)/settings/perfil/page.tsx`

Server Component. Carga `full_name` y `avatar_url` del perfil. Renderiza dentro de `SettingsScreen`
(title "Perfil", `backHref="/settings"`): `<AvatarUploader size="lg" editable showRemove />` +
un formulario con el campo nombre (`action={updateProfileName}` + `SubmitButton`).

### C.2 Renombrar "Datos personales": `/settings/perfil` → `/settings/datos`

- Mover carpeta `src/app/(app)/settings/perfil/` → `src/app/(app)/settings/datos/` (con `git mv`)
  **antes** de crear la nueva `perfil/page.tsx`.
- En esa página: **quitar el input `fullName`** (el nombre vive ahora en "Perfil"); el resto
  (altura, peso, nacimiento, género) se mantiene.

### C.3 Acciones (`src/app/actions/settings.ts`)

- `updatePersonalData`: **quitar `full_name`** del `update`; cambiar `redirect`/`revalidatePath`
  de `/settings/perfil` a `/settings/datos`.
- Añadir **`updateProfileName(formData)`**: actualiza solo `full_name`; revalida `/settings/perfil`
  y `/dashboard`; `redirect('/settings/perfil?notice=settings_saved')`.

### C.4 Referencias a `/settings/perfil` a actualizar

- [`src/app/(app)/settings/page.tsx`](../../../src/app/(app)/settings/page.tsx): `SECTIONS` —
  añadir "Perfil" y "Medidas", cambiar el href de "Datos personales" a `/settings/datos`
  (iconos: `UserRound` para Perfil, `Ruler` para Medidas, otro distinto para Datos personales).
- [`src/components/dashboard/CheckInBanner.tsx`](../../../src/components/dashboard/CheckInBanner.tsx):
  `href` → `/settings/datos` (el check-in actualiza peso/datos físicos).

## D. Archivos afectados

**Nuevos**
- `supabase/migrations/018_avatars_bucket.sql`
- `src/app/actions/avatar.ts`
- `src/lib/images/resizeSquare.ts`
- `src/components/profile/AvatarUploader.tsx`
- `src/app/(app)/settings/perfil/page.tsx` (la nueva "Perfil", tras mover la anterior)

**Movidos / renombrados**
- `src/app/(app)/settings/perfil/` → `src/app/(app)/settings/datos/` (quitar input nombre)

**Modificados**
- `src/components/dashboard/DashboardHeader.tsx` (rediseño; usa `AvatarUploader`)
- `src/app/(app)/settings/page.tsx` (`SECTIONS`)
- `src/app/actions/settings.ts` (`updatePersonalData` + `updateProfileName`)
- `src/components/dashboard/CheckInBanner.tsx` (href)

## E. Despliegue

Cambio **web-only**: el `<input type="file">` funciona en el WebView; no hay plugin nativo nuevo.
→ **deploy a Vercel** + **ejecutar `018_avatars_bucket.sql`** en el SQL Editor de Supabase.
No requiere recompilar el APK.

## Fuera de alcance

- UI de recorte interactivo (zoom/encuadre manual): se hace recorte cuadrado centrado automático.
- Plugin nativo de cámara (`@capacitor/camera`): se usa el input file estándar.
- Políticas RLS por-usuario sobre `storage.objects`: bucket público + service-role, como `013`.

## Verificación

- Topbar sin raya, sin logo, sin menú; avatar grande a la izquierda con badge de cámara.
- Tocar el avatar abre el selector; al elegir foto, se ve el cambio en el dashboard.
- Ajustes (desde la barra inferior) muestra Perfil / Datos personales / Entrenamiento / Medidas /
  Notificaciones / Cuenta. Perfil sube/quita foto y edita nombre. Datos personales ya no tiene
  el campo nombre.
- `grep -r "/settings/perfil"` no deja referencias que deban apuntar a `/settings/datos`.
- `pnpm lint` y `pnpm build` pasan.

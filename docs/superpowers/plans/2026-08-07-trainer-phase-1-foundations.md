# Trainer Phase 1 Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ocultar Comunidad de forma reversible, introducir la entrada Entrenadores y crear notificaciones/auditoria generales que no dependan del dominio social.

**Architecture:** Una bandera leida en servidor controla rutas, acciones, navegacion e inicializacion push. Las tablas sociales permanecen intactas. Un nuevo subsistema de notificaciones guarda primero el evento interno y envia push como efecto secundario; una clave de deduplicacion hace seguros los reintentos.

**Tech Stack:** Next.js 14, React 18, TypeScript, Supabase/PostgreSQL, Firebase Admin, Capacitor Push Notifications, Vitest y Playwright.

## Global Constraints

- `COMMUNITY_ENABLED` es falso cuando falta o cuando su valor no es exactamente `true`.
- No borrar ni renombrar tablas, migraciones, acciones o componentes sociales existentes.
- Las rutas y acciones sociales deben denegar en servidor; ocultar botones no es suficiente.
- `/feed` redirige a `/trainers`; `/post/*` y `/feed/new` responden `notFound()` mientras Comunidad esta apagada.
- No registrar tokens ni preferencias sociales con la bandera apagada.
- `/trainers` debe existir desde esta fase con un estado inicial honesto y sin datos ficticios.
- Las notificaciones generales no aceptan titulo, URL o destinatario arbitrarios desde el cliente.
- Los tokens push son privados; solo el propietario los registra/desactiva y solo `service_role` los lee para enviar.
- Conservar `.superpowers/` sin versionar.

---

## File Map

- `src/lib/features/community.ts`: interpreta la bandera y proporciona el error comun de acciones.
- `src/components/navigation/appNavigation.ts`: define navegacion personal y profesional por modo.
- `src/app/(app)/layout.tsx`: decide Comunidad/push en servidor.
- `src/app/(app)/feed/**`, `src/app/(app)/post/**`: guards de paginas sociales.
- `src/app/actions/feed.ts`, `follows.ts`, `posts.ts`, `moderation.ts`: guards de lectura y mutacion social.
- `src/app/(app)/plan/page.tsx`, `src/components/session/CompletionScreen.tsx`, `src/app/(app)/history/[logId]/page.tsx`: ocultan compartir.
- `supabase/migrations/040_trainer_foundations.sql`: notificaciones, tokens, preferencias y auditoria.
- `src/lib/notifications/product.ts`: crea la notificacion interna y envia push best-effort.
- `src/app/actions/notifications.ts`: registro de token, preferencias, lectura y marcado.
- `src/components/native/ProductPushNotificationsInit.tsx`: registro nativo general.
- `src/components/notifications/NotificationCenter.tsx`: bandeja interna.
- `src/app/(app)/notifications/page.tsx`: pagina de notificaciones.
- `src/app/(app)/settings/notificaciones/page.tsx`: preferencias generales; preferencias sociales solo con bandera activa.
- `src/types/database.ts`: tipos manuales hasta regenerarlos desde Supabase.

### Task 1: Definir la bandera y sustituir Comunidad en la navegacion

**Files:**
- Create: `src/lib/features/community.ts`
- Create: `src/lib/features/__tests__/community.test.ts`
- Modify: `src/components/navigation/appNavigation.ts`
- Modify: `src/components/navigation/__tests__/appNavigation.test.ts`
- Modify: `src/components/navigation/AppShell.tsx`
- Modify: `src/components/navigation/DesktopSidebar.tsx`
- Modify: `src/components/navigation/BottomNav.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/trainers/page.tsx`

**Interfaces:**
- Consumes: `process.env.COMMUNITY_ENABLED` solo en componentes de servidor.
- Produces: `isCommunityEnabled()`, `getPersonalNavItems({ communityEnabled })` y una prop `navItems` compartida por ambas navegaciones.

- [ ] **Step 1: Escribir pruebas rojas de bandera y navegacion**

Cubrir estos contratos:

```ts
expect(isCommunityEnabled({})).toBe(false)
expect(isCommunityEnabled({ COMMUNITY_ENABLED: 'false' })).toBe(false)
expect(isCommunityEnabled({ COMMUNITY_ENABLED: 'true' })).toBe(true)
expect(getPersonalNavItems({ communityEnabled: false }).at(-1)).toMatchObject({
  href: '/trainers',
  label: 'Entrenadores',
})
expect(getPersonalNavItems({ communityEnabled: true }).at(-1)).toMatchObject({
  href: '/feed',
  label: 'Comunidad',
})
```

- [ ] **Step 2: Ejecutar la prueba y confirmar RED**

```bash
pnpm vitest run src/lib/features/__tests__/community.test.ts src/components/navigation/__tests__/appNavigation.test.ts
```

Esperado: FAIL porque la bandera y el generador de navegacion aun no existen.

- [ ] **Step 3: Implementar el contrato minimo**

```ts
export type CommunityEnvironment = { COMMUNITY_ENABLED?: string }

export function isCommunityEnabled(
  env: CommunityEnvironment = process.env,
): boolean {
  return env.COMMUNITY_ENABLED === 'true'
}
```

Cambiar `APP_NAV_ITEMS` por `getPersonalNavItems`, pasar la lista calculada desde `AppLayout` a `AppShell`, `DesktopSidebar` y `BottomNav`, y crear `/trainers` con titulo, explicacion breve y CTA deshabilitada hasta la fase 3.

- [ ] **Step 4: Ejecutar la prueba y confirmar GREEN**

```bash
pnpm vitest run src/lib/features/__tests__/community.test.ts src/components/navigation/__tests__/appNavigation.test.ts
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add src/lib/features src/components/navigation src/app/\(app\)/layout.tsx src/app/\(app\)/trainers/page.tsx
git commit -m "feat(navigation): replace community with trainers"
```

### Task 2: Bloquear rutas, acciones y superficies sociales

**Files:**
- Create: `src/lib/social/__tests__/communityAvailability.test.ts`
- Modify: `src/app/(app)/feed/page.tsx`
- Modify: `src/app/(app)/feed/new/page.tsx`
- Modify: `src/app/(app)/post/[id]/page.tsx`
- Modify: `src/app/actions/feed.ts`
- Modify: `src/app/actions/follows.ts`
- Modify: `src/app/actions/posts.ts`
- Modify: `src/app/actions/moderation.ts`
- Modify: `src/app/(app)/plan/page.tsx`
- Modify: `src/app/(app)/history/[logId]/page.tsx`
- Modify: `src/components/session/CompletionScreen.tsx`
- Modify: `src/app/(app)/session/[workoutId]/SessionClient.tsx`

**Interfaces:**
- Consumes: `isCommunityEnabled()`.
- Produces: `communityUnavailableResult()` con `{ ok: false, error: 'Comunidad no esta disponible.' }` para acciones mutadoras y colecciones vacias para lecturas.

- [ ] **Step 1: Añadir una prueba estatica roja de cobertura del guard**

La prueba debe leer los cuatro archivos de acciones y verificar que cada export social publico llama a `isCommunityEnabled` antes de autenticarse o consultar Supabase. Tambien debe comprobar que los tres entry points de pagina importan la bandera.

- [ ] **Step 2: Ejecutar la prueba y confirmar RED**

```bash
pnpm vitest run src/lib/social/__tests__/communityAvailability.test.ts
```

- [ ] **Step 3: Aplicar guards de servidor y ocultar compartir**

El patron mutador debe quedar asi:

```ts
export async function createPost(formData: FormData): Promise<ActionResult<{ id: string }>> {
  if (!isCommunityEnabled()) return communityUnavailableResult()
  // flujo social existente, sin cambios
}
```

`/feed` usa `redirect('/trainers')`; compositor y detalle usan `notFound()`. Calcular `communityEnabled` en paginas servidor y pasarlo a `CompletionScreen`; no renderizar `ShareRoutineButton` ni `ShareSessionButton` cuando sea falso.

- [ ] **Step 4: Probar guards y regresion social con la bandera activa**

```bash
pnpm vitest run src/lib/social/__tests__/communityAvailability.test.ts src/lib/social/__tests__
```

Esperado: PASS tanto para el modo apagado como para los helpers sociales preservados.

- [ ] **Step 5: Commit de la tarea**

```bash
git add src/lib/social src/app/actions/feed.ts src/app/actions/follows.ts src/app/actions/posts.ts src/app/actions/moderation.ts src/app/\(app\)/feed src/app/\(app\)/post src/app/\(app\)/plan/page.tsx src/app/\(app\)/history src/app/\(app\)/session src/components/session/CompletionScreen.tsx
git commit -m "feat(community): disable social surfaces behind flag"
```

### Task 3: Crear persistencia general de notificaciones y auditoria

**Files:**
- Create: `supabase/migrations/040_trainer_foundations.sql`
- Create: `src/lib/notifications/__tests__/foundationMigration.test.ts`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces tablas `product_notifications`, `product_push_tokens`, `product_notification_preferences` y `professional_audit_logs`.
- Produce RPC interna `create_product_notification(...)` ejecutable solo por `service_role` y por funciones `SECURITY DEFINER` posteriores.

- [ ] **Step 1: Escribir la prueba roja del esquema**

Verificar RLS, indices y estas invariantes:

```sql
UNIQUE (user_id, dedupe_key)
CHECK (url IS NULL OR url LIKE '/%')
CHECK (read_at IS NULL OR read_at >= created_at)
```

La prueba tambien debe exigir `REVOKE ALL` para tokens/auditoria y una politica de lectura/actualizacion propia para notificaciones.

- [ ] **Step 2: Ejecutar la prueba y confirmar RED**

```bash
pnpm vitest run src/lib/notifications/__tests__/foundationMigration.test.ts
```

- [ ] **Step 3: Implementar la migracion**

Usar estas columnas nucleares:

```sql
CREATE TABLE public.product_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  url TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  dedupe_key TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, dedupe_key)
);
```

`product_push_tokens` conserva plataforma, device id, enabled y last seen. `product_notification_preferences` contiene `professional_enabled` y `push_enabled`. `professional_audit_logs` conserva actor, sujeto, entidad, accion, metadata y fecha y no ofrece acceso directo a `authenticated`.

- [ ] **Step 4: Actualizar tipos y ejecutar GREEN**

Añadir las cuatro tablas y la funcion a `Database`; actualizar el encabezado a migracion 040.

```bash
pnpm vitest run src/lib/notifications/__tests__/foundationMigration.test.ts
pnpm type-check
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add supabase/migrations/040_trainer_foundations.sql src/lib/notifications/__tests__/foundationMigration.test.ts src/types/database.ts
git commit -m "feat(notifications): add product notification foundation"
```

### Task 4: Generalizar registro y envio push

**Files:**
- Create: `src/lib/notifications/product.ts`
- Create: `src/lib/notifications/__tests__/product.test.ts`
- Create: `src/app/actions/notifications.ts`
- Create: `src/app/actions/__tests__/notifications.test.ts`
- Create: `src/components/native/ProductPushNotificationsInit.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Preserve: `src/lib/notifications/socialPush.ts`
- Preserve: `src/components/native/SocialPushNotificationsInit.tsx`

**Interfaces:**
- Produces: `createProductNotification(input)`, `registerProductPushToken(input)`, `disableProductPushToken(token)` y `updateProductNotificationPreferences(input)`.
- Consumes: credenciales Firebase actuales y tabla `product_push_tokens`.

- [ ] **Step 1: Escribir pruebas rojas de validacion y deduplicacion**

Cubrir token vacio, plataforma invalida, sesion ausente, URL externa rechazada, dedupe repetido y fallo Firebase best-effort. El input de servidor es:

```ts
export type CreateProductNotificationInput = {
  recipientUserId: string
  type: ProductNotificationType
  title: string
  body: string
  url: `/${string}`
  dedupeKey: string
  payload?: Json
}
```

- [ ] **Step 2: Ejecutar pruebas y confirmar RED**

```bash
pnpm vitest run src/lib/notifications/__tests__/product.test.ts src/app/actions/__tests__/notifications.test.ts
```

- [ ] **Step 3: Implementar almacenamiento primero y push despues**

`createProductNotification` inserta/upsert por dedupe, retorna el registro persistido y luego envia a lotes de 500. Desactiva tokens con codigos Firebase invalidos. Un fallo de push nunca revierte el evento interno.

Reutilizar la logica de dispositivo de `SocialPushNotificationsInit`, pero registrar en la accion general. En `AppLayout` montar siempre `ProductPushNotificationsInit` y montar `SocialPushNotificationsInit` solo si Comunidad esta activa.

- [ ] **Step 4: Ejecutar pruebas y confirmar GREEN**

```bash
pnpm vitest run src/lib/notifications/__tests__/product.test.ts src/app/actions/__tests__/notifications.test.ts
pnpm type-check
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add src/lib/notifications/product.ts src/lib/notifications/__tests__/product.test.ts src/app/actions/notifications.ts src/app/actions/__tests__/notifications.test.ts src/components/native/ProductPushNotificationsInit.tsx src/app/\(app\)/layout.tsx
git commit -m "feat(notifications): add in-app and native product delivery"
```

### Task 5: Construir el centro interno y preferencias

**Files:**
- Create: `src/app/(app)/notifications/page.tsx`
- Create: `src/app/(app)/notifications/loading.tsx`
- Create: `src/components/notifications/NotificationCenter.tsx`
- Create: `src/components/notifications/__tests__/notificationCenter.test.tsx`
- Create: `src/components/settings/ProductNotificationPreferences.tsx`
- Modify: `src/app/(app)/settings/notificaciones/page.tsx`

**Interfaces:**
- Consumes: `listProductNotifications({ cursor })`, `markProductNotificationRead(id)` y preferencias del usuario.
- Produces: lista paginada, estado leido/no leido y navegacion solo a URLs internas validadas.

- [ ] **Step 1: Escribir la prueba roja del modelo de presentacion**

Probar orden descendente, badge no leido, URL segura, estado vacio y que la seccion social solo aparece con `communityEnabled=true`.

- [ ] **Step 2: Ejecutar la prueba y confirmar RED**

```bash
pnpm vitest run src/components/notifications/__tests__/notificationCenter.test.tsx
```

- [ ] **Step 3: Implementar UI accesible y paginada**

Usar botones/enlaces de 44 px, `aria-live="polite"` al marcar, cursor `(created_at,id)` y un limite de 30. Actualizar settings para mostrar preferencias profesionales generales y conservar el componente social detras de la bandera.

- [ ] **Step 4: Ejecutar prueba y confirmar GREEN**

```bash
pnpm vitest run src/components/notifications/__tests__/notificationCenter.test.tsx
pnpm type-check
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add src/app/\(app\)/notifications src/components/notifications src/components/settings/ProductNotificationPreferences.tsx src/app/\(app\)/settings/notificaciones/page.tsx
git commit -m "feat(notifications): add product notification center"
```

### Task 6: Verificar la fase completa

**Files:**
- Create: `tests/e2e/trainer-foundations.spec.ts`
- Modify: `.env.example`
- Verify only: resto de archivos de la fase.

**Interfaces:**
- Consumes: build con `COMMUNITY_ENABLED=false`.
- Produces: evidencia de que Comunidad esta preservada pero inaccesible y de que las fundaciones no rompen el producto personal.

- [ ] **Step 1: Añadir smoke E2E de navegacion y rutas**

Probar que la barra muestra Entrenadores y no Comunidad, `/feed` termina en `/trainers`, `/feed/new` y `/post/<uuid>` no exponen contenido, y `/notifications` carga su estado vacio.

- [ ] **Step 2: Ejecutar la suite focalizada**

```bash
pnpm playwright test tests/e2e/trainer-foundations.spec.ts --project=mobile-375 --project=desktop-1440
```

- [ ] **Step 3: Ejecutar regresion completa de la fase**

```bash
pnpm test
pnpm type-check
pnpm lint
pnpm build
```

- [ ] **Step 4: Inspeccionar que no se eliminaron activos sociales**

```bash
git diff --name-status HEAD~5 -- src/lib/social src/components/social supabase/migrations/019_social_posts.sql supabase/migrations/020_social_rls.sql supabase/migrations/025_social_push_notifications.sql
```

Esperado: solo adiciones de guards/pruebas en codigo; ninguna migracion social eliminada o modificada.

- [ ] **Step 5: Commit de verificacion**

```bash
git add tests/e2e/trainer-foundations.spec.ts .env.example
git commit -m "test(trainers): verify foundation rollout"
```

## Completion Criteria

- Comunidad esta apagada por defecto en navegacion, rutas, mutaciones, compartir y push social.
- `/trainers` sustituye la entrada anterior sin mezclar relaciones sociales y profesionales.
- Notificaciones internas, tokens y preferencias generales funcionan sin tablas sociales.
- La auditoria profesional esta disponible para las siguientes fases y no es legible por usuarios normales.
- Todas las pruebas, type-check, lint y build pasan con `COMMUNITY_ENABLED=false`.

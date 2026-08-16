# Settings Foundation and General Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el sistema visual compartido de Ajustes y renovar portada, Perfil, Notificaciones, Idioma y Cuenta con i18n, accesibilidad y feature gates coherentes.

**Architecture:** Las rutas servidor seguirán cargando usuario, perfil, idioma y flags. Componentes presentacionales pequeños definirán la jerarquía visual, mientras los componentes cliente conservarán únicamente estado de interacción y persistencia atómica. Este plan no modifica Entrenamiento, Datos personales ni Medidas; esos bloques tienen planes separados.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, Supabase server actions, Vitest y React DOM server rendering.

**Spec:** `docs/superpowers/specs/2026-08-16-settings-quality-redesign-design.md`

## Global Constraints

- Conservar las rutas públicas existentes.
- Soportar español e inglés en todo texto nuevo o actualmente fijo.
- Controles interactivos con área mínima de 44 px, foco visible y estado accesible.
- No añadir dependencias de producción.
- No borrar `username`, `is_private` ni contenido social al apagar Comunidad.
- No modificar las páginas internas de Administración.
- No modificar el plan activo desde ninguna acción de Ajustes.
- Preservar cambios no relacionados ya presentes en `src/components/plan/__tests__/`.

## File Map

- `src/components/settings/SettingsSection.tsx`: contenedor semántico de grupos.
- `src/components/settings/SettingsField.tsx`: etiqueta, ayuda y error accesible.
- `src/components/settings/SettingsChoiceGroup.tsx`: selección accesible simple o múltiple.
- `src/components/settings/SettingsSwitchRow.tsx`: fila visual reutilizable para interruptores.
- `src/components/settings/SettingsSaveBar.tsx`: acción de guardado y estado pendiente.
- `src/components/settings/SettingsStatus.tsx`: estado informativo, de éxito o error.
- `src/components/settings/SettingsNavGroup.tsx`: grupos navegables de la portada.
- `src/components/settings/SettingsScreen.tsx`: shell con introducción y espacio seguro.
- `src/app/(app)/settings/page.tsx`: composición de la portada.
- `src/app/(app)/settings/perfil/page.tsx`: feature gate y nueva tarjeta de identidad.
- `src/components/profile/AvatarUploader.tsx`: localización de acciones y resultados.
- `src/app/actions/settings.ts`: validación del nombre visible.
- `src/components/settings/ProductNotificationPreferences.tsx`: preferencias de producto.
- `src/components/settings/WorkoutReminders.tsx`: recordatorios localizados.
- `src/app/actions/notifications.ts`: persistencia mediante `upsert`.
- `src/app/(app)/settings/idioma/LanguageSelector.tsx`: guardado automático observable.
- `src/app/(app)/settings/cuenta/page.tsx`: secciones de identidad, sesión y documentos.
- `src/components/feedback/RouteLoading.tsx`: esqueletos alineados.
- `src/lib/i18n/index.ts`: copy español/inglés.

---

### Task 1: Shared Settings Primitives

**Files:**
- Create: `src/components/settings/SettingsSection.tsx`
- Create: `src/components/settings/SettingsField.tsx`
- Create: `src/components/settings/SettingsChoiceGroup.tsx`
- Create: `src/components/settings/SettingsSwitchRow.tsx`
- Create: `src/components/settings/SettingsSaveBar.tsx`
- Create: `src/components/settings/SettingsStatus.tsx`
- Create: `src/components/settings/__tests__/settingsPrimitives.test.tsx`
- Modify: `src/components/settings/SettingsScreen.tsx`

**Interfaces:**
- Produces: `SettingsSection`, `SettingsField`, `SettingsChoiceGroup`, `SettingsSwitchRow`, `SettingsSaveBar`, `SettingsStatus`.
- `SettingsChoiceGroup<T extends string | number>` consumes `options`, `selected`, `onToggle`, `multiple`, `label` and optional `error`.
- `SettingsScreen` adds optional `eyebrow` and `description` props without breaking current callers.

- [ ] **Step 1: Write failing rendering and accessibility tests**

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SettingsChoiceGroup } from '../SettingsChoiceGroup'
import { SettingsField } from '../SettingsField'
import { SettingsStatus } from '../SettingsStatus'

describe('settings primitives', () => {
  it('associates help and error copy with a field', () => {
    const html = renderToStaticMarkup(
      <SettingsField id="height" label="Altura" help="En centímetros" error="Valor inválido">
        <input id="height" aria-invalid />
      </SettingsField>,
    )
    expect(html).toContain('aria-describedby="height-help height-error"')
    expect(html).toContain('id="height-error"')
    expect(html).toContain('role="alert"')
  })

  it('exposes pressed state and 44px targets', () => {
    const html = renderToStaticMarkup(
      <SettingsChoiceGroup
        label="Duración"
        options={[{ value: 30, label: '30 min' }, { value: 60, label: '1 hora' }]}
        selected={[60]}
        multiple={false}
        onToggle={vi.fn()}
      />,
    )
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('min-h-11')
    expect(html).toContain('<fieldset')
  })

  it('announces status without relying on color', () => {
    const html = renderToStaticMarkup(<SettingsStatus tone="error">No se pudo guardar.</SettingsStatus>)
    expect(html).toContain('role="alert"')
    expect(html).toContain('No se pudo guardar.')
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails because the primitives do not exist**

Run: `pnpm exec vitest run src/components/settings/__tests__/settingsPrimitives.test.tsx`

Expected: FAIL with module-resolution errors for the new components.

- [ ] **Step 3: Implement the primitive APIs and extend the shell**

Use a shared contract for choices:

```tsx
export type SettingsChoice<T extends string | number> = {
  value: T
  label: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
}

export function SettingsChoiceGroup<T extends string | number>({
  label, options, selected, multiple, onToggle, error,
}: {
  label: string
  options: readonly SettingsChoice<T>[]
  selected: readonly T[]
  multiple: boolean
  onToggle: (value: T) => void
  error?: string
}) {
  return (
    <fieldset aria-invalid={Boolean(error)}>
      <legend className="mb-3 text-sm font-semibold text-foreground">{label}</legend>
      <div
        data-selection-mode={multiple ? 'multiple' : 'single'}
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {options.map(option => {
          const active = selected.includes(option.value)
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(option.value)}
              className={cn(
                'min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                active ? 'border-violet-500 bg-violet-500/15 text-violet-100' : 'border-border/60 bg-background text-foreground',
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {error ? <p role="alert" className="mt-2 text-xs text-red-300">{error}</p> : null}
    </fieldset>
  )
}
```

`SettingsField` must clone its only child to add `aria-describedby`; generate `${id}-help` and `${id}-error` only when those nodes exist. `SettingsSwitchRow` receives the actual switch button as `control`, so it contains no persistence logic. `SettingsSaveBar` wraps `SubmitButton` and applies `pb-[var(--app-safe-area-bottom)]` on mobile. `SettingsStatus` uses `role="alert"` for errors and `role="status" aria-live="polite"` otherwise.

Extend `SettingsScreen` as follows:

```tsx
type Props = {
  title: string
  subtitle?: string
  eyebrow?: string
  description?: string
  backHref: string
  backLabel: string
  icon: React.ReactNode
  children: React.ReactNode
}

// Inside <main aria-label={title}> before children:
{eyebrow || description ? (
  <div className="mb-6">
    {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">{eyebrow}</p> : null}
    {description ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p> : null}
  </div>
) : null}
```

- [ ] **Step 4: Run focused tests and type-check**

Run: `pnpm exec vitest run src/components/settings/__tests__/settingsPrimitives.test.tsx && pnpm type-check`

Expected: PASS and no TypeScript errors.

- [ ] **Step 5: Commit the primitives**

```bash
git add src/components/settings/SettingsSection.tsx src/components/settings/SettingsField.tsx src/components/settings/SettingsChoiceGroup.tsx src/components/settings/SettingsSwitchRow.tsx src/components/settings/SettingsSaveBar.tsx src/components/settings/SettingsStatus.tsx src/components/settings/SettingsScreen.tsx src/components/settings/__tests__/settingsPrimitives.test.tsx
git commit -m "feat(settings): add shared settings primitives"
```

---

### Task 2: Grouped Settings Overview and Loading State

**Files:**
- Create: `src/components/settings/SettingsNavGroup.tsx`
- Create: `src/components/settings/__tests__/settingsOverview.test.tsx`
- Modify: `src/app/(app)/settings/page.tsx`
- Modify: `src/components/feedback/RouteLoading.tsx`
- Modify: `src/components/feedback/__tests__/routeLoading.test.ts`
- Modify: `src/lib/i18n/index.ts`

**Interfaces:**
- Consumes: `SettingsSection` from Task 1.
- Produces: `SettingsNavGroup({ title, entries })` where each entry is `{ href, label, description, icon }`.
- Does not perform data fetching.

- [ ] **Step 1: Write failing tests for grouping, descriptions and admin isolation**

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { UserRound } from 'lucide-react'
import { SettingsNavGroup } from '../SettingsNavGroup'

describe('SettingsNavGroup', () => {
  it('renders a semantic group with descriptive links and touch targets', () => {
    const html = renderToStaticMarkup(
      <SettingsNavGroup
        title="Tu perfil"
        entries={[{ href: '/settings/perfil', label: 'Perfil', description: 'Foto y nombre', icon: UserRound }]}
      />,
    )
    expect(html).toContain('Tu perfil')
    expect(html).toContain('Foto y nombre')
    expect(html).toContain('href="/settings/perfil"')
    expect(html).toContain('min-h-11')
  })
})
```

Update `routeLoading.test.ts` so `SettingsLoading` must contain these group names rather than one flat string array:

```ts
for (const label of ['Tu perfil', 'Tu entrenamiento', 'Aplicación', 'Acceso y seguridad']) {
  expect(routeLoading).toContain(label)
}
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm exec vitest run src/components/settings/__tests__/settingsOverview.test.tsx src/components/feedback/__tests__/routeLoading.test.ts`

Expected: FAIL because `SettingsNavGroup` and grouped skeleton copy do not exist.

- [ ] **Step 3: Implement the grouped overview**

Define groups in `settings/page.tsx` after creating `t`:

```tsx
const groups = [
  {
    title: t('Tu perfil'),
    entries: [
      { href: '/settings/perfil', label: t('Perfil'), description: t('Foto, nombre e identidad'), icon: UserRound },
      { href: '/settings/datos', label: t('Datos personales'), description: t('Edad, género y altura'), icon: ContactRound },
      { href: '/medidas?from=settings', label: t('Medidas'), description: t('Peso, perímetros y evolución'), icon: Ruler },
    ],
  },
  {
    title: t('Tu entrenamiento'),
    entries: [{ href: '/settings/entrenamiento', label: t('Entrenamiento'), description: t('Objetivo, agenda y equipo'), icon: Dumbbell }],
  },
  {
    title: t('Aplicación'),
    entries: [
      { href: '/settings/notificaciones', label: t('Notificaciones'), description: t('Recordatorios y avisos'), icon: BellRing },
      { href: '/settings/idioma', label: t('Idioma'), description: t('Idioma de la interfaz'), icon: Languages },
    ],
  },
  {
    title: t('Acceso y seguridad'),
    entries: [{ href: '/settings/cuenta', label: t('Cuenta'), description: t('Sesión, documentos y eliminación'), icon: UserCog }],
  },
]
```

Render Administración as its own `SettingsNavGroup` only when `profile.is_admin`. Use `ShieldCheck` and the existing `/admin` route. Give every group `space-y-3`; use `SettingsSection` for heading/description and preserve `PendingLink` navigation.

Update `SettingsLoading` to render four labeled blocks with 3/1/2/1 skeleton rows. Do not render an Administración skeleton because the loading boundary cannot know the user's role. Add all new copy to `src/lib/i18n/index.ts` and extend the i18n table test.

- [ ] **Step 4: Run overview, loading and translation tests**

Run: `pnpm exec vitest run src/components/settings/__tests__/settingsOverview.test.tsx src/components/feedback/__tests__/routeLoading.test.ts src/lib/i18n/__tests__/i18n.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the overview**

```bash
git add src/components/settings/SettingsNavGroup.tsx src/components/settings/__tests__/settingsOverview.test.tsx 'src/app/(app)/settings/page.tsx' src/components/feedback/RouteLoading.tsx src/components/feedback/__tests__/routeLoading.test.ts src/lib/i18n/index.ts src/lib/i18n/__tests__/i18n.test.ts
git commit -m "feat(settings): group the settings overview"
```

---

### Task 3: Community-Aware Profile Settings

**Files:**
- Create: `src/components/settings/__tests__/profileSettings.test.tsx`
- Create: `src/components/settings/ProfileNameForm.tsx`
- Create: `src/app/actions/__tests__/profileNameSettingsAction.test.ts`
- Modify: `src/app/(app)/settings/perfil/page.tsx`
- Modify: `src/components/profile/AvatarUploader.tsx`
- Modify: `src/app/actions/settings.ts`
- Modify: `src/components/feedback/RouteLoading.tsx`
- Modify: `src/components/feedback/__tests__/routeLoading.test.ts`
- Modify: `src/lib/i18n/index.ts`

**Interfaces:**
- Consumes: `SettingsSection`, `SettingsField`, `SettingsSaveBar` from Task 1.
- Consumes: `isCommunityEnabled()`.
- Produces `ProfileNameActionState` and `ProfileNameForm({ initialName })`.
- Produces no new public route or database field.

- [ ] **Step 1: Write failing page tests for both flag states**

Use the dynamic-mock pattern already present in `notificationCenter.test.tsx`:

```tsx
async function renderProfileSettings(communityEnabled: boolean) {
  vi.doMock('@/lib/features/community', () => ({
    isCommunityEnabled: () => communityEnabled,
  }))
  vi.doMock('@/lib/auth/server', () => ({
    requireAppUserContext: async () => ({
      user: { id: 'user-1', email: 'ana@example.com' },
      profile: {
        language: 'es', full_name: 'Ana Pérez', avatar_url: null,
        username: 'ana', is_private: true,
      },
    }),
  }))
  const Page = (await import('@/app/(app)/settings/perfil/page')).default
  return renderToStaticMarkup(await Page())
}

it('hides every social control while Community is disabled', async () => {
  const html = await renderProfileSettings(false)
  expect(html).toContain('Ana Pérez')
  expect(html).toContain('ana@example.com')
  expect(html).not.toContain('Nombre de usuario')
  expect(html).not.toContain('Cuenta privada')
  expect(html).not.toContain('Ver mi perfil')
})

it('keeps social controls when Community is enabled', async () => {
  const html = await renderProfileSettings(true)
  expect(html).toContain('Nombre de usuario')
  expect(html).toContain('Cuenta privada')
  expect(html).toContain('Ver mi perfil')
})
```

Add a profile-name action test that submits 101 characters and asserts the action returns a `fullName` field error before `.from()` is called. A 100-character value must update only `{ full_name }` for the authenticated id. Keep username actions unchanged because onboarding still consumes them.

- [ ] **Step 2: Run tests and confirm social controls/actions still leak**

Run: `pnpm exec vitest run src/components/settings/__tests__/profileSettings.test.tsx src/app/actions/__tests__/profileNameSettingsAction.test.ts`

Expected: FAIL because the page still renders social controls and the name action has no field-error contract.

- [ ] **Step 3: Add the server feature gates and polished identity section**

Change `updateProfileName` to a stateful action with an exact contract:

```ts
export type ProfileNameActionState = {
  ok: boolean
  message: string | null
  fieldErrors: { fullName?: string }
}

export async function updateProfileName(
  _previous: ProfileNameActionState,
  formData: FormData,
): Promise<ProfileNameActionState> {
  const fullName = String(formData.get('fullName') ?? '').trim()
  if (fullName.length > 100) {
    return { ok: false, message: null, fieldErrors: { fullName: 'El nombre no puede superar 100 caracteres.' } }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Sesión no válida.', fieldErrors: {} }
  const { error } = await (supabase.from('profiles') as any)
    .update({ full_name: fullName || null })
    .eq('id', user.id)
  if (error) return { ok: false, message: 'No se pudo guardar el nombre.', fieldErrors: {} }
  revalidatePath('/settings/perfil')
  revalidatePath('/dashboard')
  return { ok: true, message: 'Nombre actualizado.', fieldErrors: {} }
}
```

`ProfileNameForm` uses `useActionState`, `SettingsField`, `SettingsStatus` and `SettingsSaveBar`; it passes `maxLength={100}` to the input but relies on the server rule as authoritative.

Change `ProfileSettingsLoading` to render only the identity/avatar card and name form. The loading boundary cannot know the feature flag, so it must not mention Usuario, Privacidad or any public-profile control. Add a source assertion to `routeLoading.test.ts` that the `ProfileSettingsLoading` function body excludes both labels.

In the page:

```tsx
const communityEnabled = isCommunityEnabled()

<SettingsSection title={t('Identidad')} description={t('Así te reconoce Vekira en tu cuenta.') }>
  <div className="flex flex-col items-center gap-4 sm:flex-row sm:text-left">
    <AvatarUploader ... />
    <div className="min-w-0 text-center sm:text-left">
      <p className="font-semibold text-foreground">{profile.full_name || t('Sin nombre')}</p>
      <p className="truncate text-sm text-muted-foreground">{user.email}</p>
    </div>
  </div>
</SettingsSection>

{communityEnabled ? (
  <SettingsSection title={t('Perfil en Comunidad')}>
    <UsernameField ... />
    <PrivacyToggle ... />
    {/* existing public-profile link */}
  </SettingsSection>
) : null}
```

Use `useI18n()` in `AvatarUploader` for “Cambiar foto”, “Quitar foto”, success and error copy. Replace its remove control with `min-h-11` and visible focus styles. Render `ProfileNameForm` for the name editor.

- [ ] **Step 4: Run profile, community and i18n tests**

Run: `pnpm exec vitest run src/components/settings/__tests__/profileSettings.test.tsx src/app/actions/__tests__/profileNameSettingsAction.test.ts src/components/feedback/__tests__/routeLoading.test.ts src/lib/features/__tests__/community.test.ts src/lib/i18n/__tests__/i18n.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the profile boundary**

```bash
git add 'src/app/(app)/settings/perfil/page.tsx' src/components/profile/AvatarUploader.tsx src/components/settings/ProfileNameForm.tsx src/app/actions/settings.ts src/components/settings/__tests__/profileSettings.test.tsx src/app/actions/__tests__/profileNameSettingsAction.test.ts src/components/feedback/RouteLoading.tsx src/components/feedback/__tests__/routeLoading.test.ts src/lib/i18n/index.ts src/lib/i18n/__tests__/i18n.test.ts
git commit -m "fix(settings): hide social profile settings with community off"
```

---

### Task 4: Reliable and Localized Notification Preferences

**Files:**
- Create: `src/app/actions/__tests__/notificationPreferences.test.ts`
- Modify: `src/components/settings/ProductNotificationPreferences.tsx`
- Modify: `src/components/settings/SocialNotificationPreferences.tsx`
- Modify: `src/components/settings/WorkoutReminders.tsx`
- Modify: `src/app/actions/notifications.ts`
- Modify: `src/app/(app)/settings/notificaciones/page.tsx`
- Modify: `src/components/notifications/__tests__/notificationCenter.test.tsx`
- Modify: `src/components/feedback/RouteLoading.tsx`
- Modify: `src/components/feedback/__tests__/routeLoading.test.ts`
- Modify: `src/lib/i18n/index.ts`
- Create: `supabase/migrations/047_product_notification_preferences_insert.sql`
- Create: `supabase/tests/047_product_notification_preferences_insert_test.sql`
- Modify: `scripts/test-trainer-foundations-db.mjs`

**Interfaces:**
- Consumes: `SettingsSection`, `SettingsSwitchRow`, `SettingsStatus` from Task 1.
- `updateProductNotificationPreferences(input)` keeps its current result type but persists with `upsert`.
- Social preferences remain omitted when Community is disabled.
- Migration 047 grants authenticated users insert access only for their own preference row.

- [ ] **Step 1: Write a failing action test for a missing preference row**

```ts
it('upserts product preferences for an authenticated user', async () => {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  mockCreateClient({ user: { id: 'user-1' }, upsert })

  await expect(updateProductNotificationPreferences({
    professionalEnabled: false,
    pushEnabled: true,
  })).resolves.toEqual({ ok: true })

  expect(upsert).toHaveBeenCalledWith({
    user_id: 'user-1',
    professional_enabled: false,
    push_enabled: true,
  }, { onConflict: 'user_id' })
})
```

Extend notification rendering tests to require localized reminder headings in English and an `aria-live="polite"` status region.

Add a pgTAP test that deletes the provisioned preference for a new fixture user, switches to `authenticated`, inserts that user's row successfully, and rejects insertion for a different `user_id`:

```sql
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(4);

SELECT ok(
  has_column_privilege('authenticated', 'public.product_notification_preferences', 'user_id', 'INSERT'),
  'authenticated can supply its own user id'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('44444444-4444-4444-8444-444444444444', 'preference-upsert@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id) VALUES ('44444444-4444-4444-8444-444444444444');
DELETE FROM public.product_notification_preferences
WHERE user_id = '44444444-4444-4444-8444-444444444444';

SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.product_notification_preferences (user_id, professional_enabled, push_enabled)
    VALUES ('44444444-4444-4444-8444-444444444444', false, true)$$,
  'authenticated user inserts own missing preference row'
);
SELECT is(
  (SELECT count(*) FROM public.product_notification_preferences),
  1::bigint,
  'authenticated user sees the inserted own row'
);
SELECT throws_ok(
  $$INSERT INTO public.product_notification_preferences (user_id)
    VALUES ('33333333-3333-4333-8333-333333333333')$$,
  '42501', NULL,
  'authenticated user cannot insert another account preference'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Run the tests and confirm `update` is still used**

Run: `pnpm exec vitest run src/app/actions/__tests__/notificationPreferences.test.ts src/components/notifications/__tests__/notificationCenter.test.tsx`

Expected: FAIL on the missing `upsert` call and localization assertions.

- [ ] **Step 3: Implement persistence, shared rows and translations**

Replace the product write with:

```ts
const { error } = await (supabase.from('product_notification_preferences') as any)
  .upsert({
    user_id: user.id,
    professional_enabled: input.professionalEnabled,
    push_enabled: input.pushEnabled,
  }, { onConflict: 'user_id' })
```

Create migration 047:

```sql
DROP POLICY IF EXISTS "product_notification_preferences: insert own"
  ON public.product_notification_preferences;
CREATE POLICY "product_notification_preferences: insert own"
  ON public.product_notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

GRANT INSERT (user_id, professional_enabled, push_enabled)
  ON TABLE public.product_notification_preferences TO authenticated;
```

Extend `scripts/test-trainer-foundations-db.mjs` with exact paths and execution after the existing migration-040 suite:

```js
const preferenceInsertMigrationPath = path.join(
  repoRoot, 'supabase', 'migrations', '047_product_notification_preferences_insert.sql',
)
const preferenceInsertTestPath = path.join(
  repoRoot, 'supabase', 'tests', '047_product_notification_preferences_insert_test.sql',
)

// After the migration-040 pgTAP output has been checked:
runPsql(readFileSync(preferenceInsertMigrationPath, 'utf8'), 'applying migration 047')
const preferenceInsertTap = runPsql(
  readFileSync(preferenceInsertTestPath, 'utf8'),
  'running 047 preference-insert pgTAP suite',
)
if (/^not ok\b/m.test(preferenceInsertTap) || /# Looks like you failed\b/.test(preferenceInsertTap)) {
  throw new Error('migration 047 pgTAP reported one or more failed assertions')
}
```

Render each preference through `SettingsSwitchRow`; keep the actual switch button in the owning client component. Add an off-screen `role="status" aria-live="polite"` message updated on success or rollback. Preserve optimistic updates, but copy `previous` before starting the transition so rejected calls restore the exact prior state.

In `WorkoutReminders`, use `useI18n()` for headings, platform copy, day labels, permission errors and toast text. Define day keys rather than literal Spanish labels:

```ts
const DAY_KEYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const
const label = t(DAY_KEYS[day - 1] ?? '')
```

Add both full and abbreviated weekday translations to `i18n/index.ts`. Keep localStorage key and native APIs unchanged.

Update `NotificationsSettingsLoading` to show Recordatorios and Avisos de Vekira only. Omit Actividad social because the loading boundary cannot resolve Comunidad. Extend the route-loading test with an assertion over that function body.

- [ ] **Step 4: Run notification and translation tests**

Run: `pnpm exec vitest run src/app/actions/__tests__/notificationPreferences.test.ts src/components/notifications/__tests__/notificationCenter.test.tsx src/components/feedback/__tests__/routeLoading.test.ts src/lib/i18n/__tests__/i18n.test.ts && pnpm test:db`

Expected: PASS.

- [ ] **Step 5: Commit notification reliability**

```bash
git add src/app/actions/notifications.ts src/app/actions/__tests__/notificationPreferences.test.ts src/components/settings/ProductNotificationPreferences.tsx src/components/settings/SocialNotificationPreferences.tsx src/components/settings/WorkoutReminders.tsx 'src/app/(app)/settings/notificaciones/page.tsx' src/components/notifications/__tests__/notificationCenter.test.tsx src/components/feedback/RouteLoading.tsx src/components/feedback/__tests__/routeLoading.test.ts src/lib/i18n/index.ts src/lib/i18n/__tests__/i18n.test.ts supabase/migrations/047_product_notification_preferences_insert.sql supabase/tests/047_product_notification_preferences_insert_test.sql scripts/test-trainer-foundations-db.mjs
git commit -m "fix(settings): persist and localize notification preferences"
```

---

### Task 5: Observable Language Selection and Structured Account Page

**Files:**
- Create: `src/app/(app)/settings/idioma/__tests__/LanguageSelector.test.tsx`
- Create: `src/components/settings/__tests__/accountSettings.test.tsx`
- Modify: `src/app/(app)/settings/idioma/LanguageSelector.tsx`
- Modify: `src/app/(app)/settings/idioma/page.tsx`
- Modify: `src/app/(app)/settings/cuenta/page.tsx`
- Modify: `src/app/actions/settings.ts`
- Modify: `src/lib/i18n/index.ts`
- Modify: `src/components/feedback/RouteLoading.tsx`

**Interfaces:**
- Consumes: shared settings primitives from Task 1.
- Changes `updateLanguage` to `updateLanguage(language: string): Promise<ActionResult>`.
- Uses localized legal routes: Spanish `/es/privacidad` and `/es/terminos`; English `/en/privacy` and `/en/terms`.

- [ ] **Step 1: Write failing interaction-state and account structure tests**

```tsx
it('renders native language names and an accessible save status', () => {
  const html = renderToStaticMarkup(
    <LanguageSelector
      currentLanguage="es"
      legend="Idioma de la aplicación"
      options={[
        { value: 'es', title: 'Español', description: 'Interfaz en español' },
        { value: 'en', title: 'English', description: 'Interface in English' },
      ]}
    />,
  )
  expect(html).toContain('Interfaz en español')
  expect(html).toContain('role="status"')
  expect(html).toContain('aria-checked="true"')
})
```

For Account, render the page with mocked auth and assert headings “Cuenta de acceso”, “Sesión”, “Documentos” and “Zona peligrosa”, plus both language-correct legal links.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm exec vitest run 'src/app/(app)/settings/idioma/__tests__/LanguageSelector.test.tsx' src/components/settings/__tests__/accountSettings.test.tsx`

Expected: FAIL because descriptions, status and structured sections are absent.

- [ ] **Step 3: Implement action result, client transition and account sections**

Refactor the action:

```ts
export async function updateLanguage(language: string): Promise<ActionResult> {
  if (language !== 'es' && language !== 'en') return { ok: false, error: 'Idioma no válido.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }
  const { error } = await (supabase.from('profiles') as any).update({ language }).eq('id', user.id)
  if (error) return { ok: false, error: 'No se pudo guardar el idioma.' }
  cookies().set('fitai-language', language, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 31_536_000 })
  revalidatePath('/', 'layout')
  return { ok: true }
}
```

`LanguageSelector` owns `selected`, `pending`, `announcement` and uses `startTransition`; on failure restore the previous language and show an error toast, on success call `router.refresh()`. Buttons use `role="radio"` and `aria-checked` within a `role="radiogroup"`.

Build Account with four `SettingsSection` instances. Resolve legal links from `normalizeLanguage(profile.language)`:

```ts
const legal = language === 'en'
  ? { privacy: '/en/privacy', terms: '/en/terms' }
  : { privacy: '/es/privacidad', terms: '/es/terminos' }
```

Keep `DeleteAccountSection` behavior intact. Update language and account loading skeletons to match the final group count.

- [ ] **Step 4: Run focused and regression tests**

Run: `pnpm exec vitest run 'src/app/(app)/settings/idioma/__tests__/LanguageSelector.test.tsx' src/components/settings/__tests__/accountSettings.test.tsx src/components/feedback/__tests__/routeLoading.test.ts src/lib/i18n/__tests__/i18n.test.ts && pnpm type-check`

Expected: PASS.

- [ ] **Step 5: Commit general preference screens**

```bash
git add 'src/app/(app)/settings/idioma/LanguageSelector.tsx' 'src/app/(app)/settings/idioma/page.tsx' 'src/app/(app)/settings/idioma/__tests__/LanguageSelector.test.tsx' 'src/app/(app)/settings/cuenta/page.tsx' src/components/settings/__tests__/accountSettings.test.tsx src/app/actions/settings.ts src/lib/i18n/index.ts src/lib/i18n/__tests__/i18n.test.ts src/components/feedback/RouteLoading.tsx src/components/feedback/__tests__/routeLoading.test.ts
git commit -m "feat(settings): polish language and account preferences"
```

---

### Task 6: Foundation Verification

**Files:**
- Modify only if verification exposes a regression in files owned by Tasks 1–5.

**Interfaces:**
- Produces a green baseline required by the Training and Measurements plans.

- [ ] **Step 1: Run all settings-focused unit tests**

Run:

```bash
pnpm exec vitest run \
  src/components/settings/__tests__ \
  src/components/notifications/__tests__/notificationCenter.test.tsx \
  src/components/feedback/__tests__/routeLoading.test.ts \
  src/app/actions/__tests__/profileNameSettingsAction.test.ts \
  src/app/actions/__tests__/notificationPreferences.test.ts \
  src/lib/i18n/__tests__/i18n.test.ts
```

Expected: PASS with no unhandled rejection.

- [ ] **Step 2: Run static verification**

Run: `pnpm type-check && pnpm lint`

Expected: both commands exit 0.

- [ ] **Step 3: Run the complete unit suite**

Run: `pnpm test`

Expected: PASS. If a pre-existing unrelated test fails, capture its exact output and verify it also fails on the pre-task commit before classifying it as unrelated.

- [ ] **Step 4: Review the diff and confirm scope**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and no staged changes from `src/components/plan/__tests__/`.

- [ ] **Step 5: Route defects back to their owning task**

If verification exposes a defect, first add a failing regression test to the task that introduced it, implement the smallest fix, rerun that task's focused command, and amend that task's commit. If no defect appears, create no commit.



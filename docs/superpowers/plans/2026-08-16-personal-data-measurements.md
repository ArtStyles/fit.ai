# Personal Data and Measurements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar el peso utilizado por el motor con el historial de Medidas y renovar Datos personales y Medidas con validación, navegación coherente, i18n y eliminación recuperable.

**Architecture:** Un trigger transaccional mantendrá `profiles.weight_kg` sincronizado con la medida con peso más reciente. Validadores puros protegerán acciones de Datos personales y Medidas antes de Supabase. La pantalla de Medidas se dividirá en formulario, gráfica e historial, manteniendo `/medidas` como herramienta independiente y usando `?from=settings` solo para resolver el destino de regreso.

**Tech Stack:** PostgreSQL/Supabase migrations, pgTAP en Docker, Next.js App Router, React 19, TypeScript, Tailwind CSS, Vitest y Playwright.

**Spec:** `docs/superpowers/specs/2026-08-16-settings-quality-redesign-design.md`

## Global Constraints

- Ejecutar después de los planes de base visual y Entrenamiento.
- Conservar `/settings/datos` y `/medidas`.
- El peso inicial del onboarding permanece hasta registrar una medida con peso.
- La medida con peso más reciente es la fuente operativa después del primer registro.
- Insertar una medida sin peso no borra el peso inicial.
- Eliminar o vaciar la última medida con peso establece `profiles.weight_kg = NULL`.
- La migración inicial no modifica perfiles sin medidas con peso.
- Datos personales admite campos vacíos; si existen, edad 18–100, altura 100–250 cm y género canónico.
- Medidas admite: peso 30–300 kg, grasa 1–75 %, masa muscular 5–200 kg, perímetros 10–300 cm y notas de hasta 500 caracteres.
- Cada medida debe contener al menos un valor o una nota no vacía.
- Todas las escrituras se limitan al usuario autenticado.
- Controles de al menos 44 px, i18n español/inglés, foco y errores accesibles.
- No añadir dependencias de producción.
- Preservar cambios no relacionados ya presentes en `src/components/plan/__tests__/`.

## File Map

- `supabase/migrations/048_profile_weight_measurement_sync.sql`: función, trigger y backfill.
- `supabase/tests/048_profile_weight_measurement_sync_test.sql`: contrato pgTAP.
- `scripts/test-settings-weight-sync-db.mjs`: ejecución aislada de migración y pruebas.
- `package.json`: script `test:db:settings-weight`.
- `src/app/actions/measurements.logic.ts`: parser y validación de medidas.
- `src/app/actions/measurements.ts`: acciones autenticadas con errores estables.
- `src/app/actions/__tests__/measurements.logic.test.ts`: límites puros.
- `src/app/actions/__tests__/measurements.test.ts`: comportamiento de acciones.
- `src/lib/profile/personalData.ts`: parser de Datos personales.
- `src/lib/profile/__tests__/personalData.test.ts`: contrato puro.
- `src/components/settings/PersonalDataForm.tsx`: formulario con estado servidor.
- `src/app/(app)/settings/datos/page.tsx`: carga y peso actual enlazado.
- `src/components/measurements/MeasurementForm.tsx`: registrar/editar.
- `src/components/measurements/WeightChart.tsx`: visualización aislada.
- `src/components/measurements/MeasurementHistory.tsx`: historial y eliminación recuperable.
- `src/components/measurements/MeasurementsClient.tsx`: composición de pantalla.
- `src/app/(app)/medidas/page.tsx`: destino de regreso validado.
- `src/lib/i18n/index.ts`: copy completo.
- `tests/e2e/settings.spec.ts`: aceptación responsive y accesible.

---

### Task 1: Transactional Profile Weight Synchronization

**Files:**
- Create: `supabase/migrations/048_profile_weight_measurement_sync.sql`
- Create: `supabase/tests/048_profile_weight_measurement_sync_test.sql`
- Create: `scripts/test-settings-weight-sync-db.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces trigger `trg_measurements_sync_profile_weight`.
- Produces function `public.sync_profile_weight_from_measurements()`.
- Does not change the application API or measurement schema.

- [ ] **Step 1: Write the failing pgTAP behavior suite**

```sql
BEGIN;
SELECT plan(7);

INSERT INTO auth.users (id, email) VALUES
  ('10000000-0000-4000-8000-000000000001', 'weight-sync@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'no-history@example.test');
INSERT INTO public.profiles (id, weight_kg) VALUES
  ('10000000-0000-4000-8000-000000000001', 80),
  ('10000000-0000-4000-8000-000000000002', 72);

INSERT INTO public.measurements (id, user_id, recorded_at, notes)
VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '2026-08-01T12:00:00Z', 'solo nota');
SELECT is((SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000001'), 80::numeric, 'notes-only insert preserves onboarding weight');

INSERT INTO public.measurements (id, user_id, recorded_at, weight_kg)
VALUES ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '2026-08-02T12:00:00Z', 78);
SELECT is((SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000001'), 78::numeric, 'weighted insert updates profile');

INSERT INTO public.measurements (id, user_id, recorded_at, weight_kg)
VALUES ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '2026-08-03T12:00:00Z', 77);
SELECT is((SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000001'), 77::numeric, 'newest weighted measurement wins');

UPDATE public.measurements SET weight_kg = 76 WHERE id = '20000000-0000-4000-8000-000000000002';
SELECT is((SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000001'), 77::numeric, 'editing an older row keeps newest weight');

DELETE FROM public.measurements WHERE id = '20000000-0000-4000-8000-000000000003';
SELECT is((SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000001'), 76::numeric, 'deleting newest restores previous weight');

UPDATE public.measurements SET weight_kg = NULL WHERE id = '20000000-0000-4000-8000-000000000002';
SELECT is((SELECT weight_kg FROM profiles WHERE id = '10000000-0000-4000-8000-000000000001'), NULL::numeric, 'clearing last weighted row clears profile');

SELECT is((SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000002'), 72::numeric, 'profile without weighted history stays unchanged');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Run the isolated suite and confirm migration objects are missing**

Run: `pnpm test:db:settings-weight`

Expected: FAIL because the script or migration does not exist.

- [ ] **Step 3: Implement migration, backfill and isolated runner**

Create the migration with an event-sensitive trigger:

```sql
CREATE OR REPLACE FUNCTION public.sync_profile_weight_from_measurements()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_should_sync BOOLEAN := FALSE;
  v_latest_weight NUMERIC(5,1);
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_user_id := NEW.user_id;
    v_should_sync := NEW.weight_kg IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_user_id := NEW.user_id;
    v_should_sync := OLD.weight_kg IS DISTINCT FROM NEW.weight_kg;
  ELSE
    v_user_id := OLD.user_id;
    v_should_sync := OLD.weight_kg IS NOT NULL;
  END IF;

  IF NOT v_should_sync THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT m.weight_kg
    INTO v_latest_weight
    FROM public.measurements AS m
   WHERE m.user_id = v_user_id
     AND m.weight_kg IS NOT NULL
   ORDER BY m.recorded_at DESC, m.id DESC
   LIMIT 1;

  UPDATE public.profiles SET weight_kg = v_latest_weight WHERE id = v_user_id;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_measurements_sync_profile_weight ON public.measurements;
CREATE TRIGGER trg_measurements_sync_profile_weight
AFTER INSERT OR DELETE OR UPDATE OF weight_kg ON public.measurements
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_weight_from_measurements();

WITH latest AS (
  SELECT DISTINCT ON (user_id) user_id, weight_kg
  FROM public.measurements
  WHERE weight_kg IS NOT NULL
  ORDER BY user_id, recorded_at DESC, id DESC
)
UPDATE public.profiles AS p
SET weight_kg = latest.weight_kg
FROM latest
WHERE p.id = latest.user_id
  AND p.weight_kg IS DISTINCT FROM latest.weight_kg;
```

Implement the isolated runner with the same pinned image already used by database tests:

```js
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { waitForFinalDatabase } from './trainer-foundations-readiness.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const image = process.env.SETTINGS_WEIGHT_DB_IMAGE
  ?? 'public.ecr.aws/supabase/postgres:17.6.1.143'
const container = `fitai-settings-weight-${process.pid}-${Date.now().toString(36)}`
const migrationPath = path.join(repoRoot, 'supabase', 'migrations', '048_profile_weight_measurement_sync.sql')
const testPath = path.join(repoRoot, 'supabase', 'tests', '048_profile_weight_measurement_sync_test.sql')

const bootstrapSql = `
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  weight_kg NUMERIC(5,1)
);

CREATE TABLE public.measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  weight_kg NUMERIC(5,1),
  notes TEXT
);
`

function docker(args, { input, print = true } = {}) {
  const result = spawnSync('docker', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    input,
    maxBuffer: 10 * 1024 * 1024,
  })
  if (print) {
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
  }
  if (result.error) throw result.error
  return result
}

function runPsql(sql, label) {
  process.stdout.write(`\n[settings-weight-db] ${label}\n`)
  const result = docker([
    'exec', '-i', container,
    'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres',
  ], { input: sql })
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`)
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`
}

function waitForDatabase() {
  return waitForFinalDatabase({
    inspectHealth: () => {
      const result = docker([
        'inspect', container,
        '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}',
      ], { print: false })
      return result.status === 0 ? result.stdout.trim() || 'unknown' : `inspect-error-${result.status}`
    },
    probeFinalDatabase: () => {
      const result = docker([
        'exec', container,
        'psql', '-X', '-A', '-t', '-q', '-U', 'postgres', '-d', 'postgres',
        '-c', "SELECT CASE WHEN to_regclass('auth.users') IS NOT NULL THEN 'ready' ELSE 'missing auth.users' END",
      ], { print: false })
      const output = result.stdout.trim()
      return result.status === 0 && output === 'ready'
        ? { ok: true, diagnostic: 'auth.users ready' }
        : { ok: false, diagnostic: result.stderr.trim() || output || `psql exit ${result.status}` }
    },
    wait: milliseconds => {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
    },
  })
}

let started = false
try {
  const start = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres', image,
  ])
  if (start.status !== 0) throw new Error(`docker run failed with exit code ${start.status}`)
  started = true
  waitForDatabase()
  runPsql(bootstrapSql, 'applying minimal bootstrap')
  runPsql(readFileSync(migrationPath, 'utf8'), 'applying migration 048')
  const tapOutput = runPsql(readFileSync(testPath, 'utf8'), 'running pgTAP suite')
  if (/^not ok\b/m.test(tapOutput) || /# Looks like you failed\b/.test(tapOutput)) {
    throw new Error('pgTAP reported one or more failed assertions')
  }
  process.stdout.write('\n[settings-weight-db] PASS\n')
} finally {
  if (started) docker(['rm', '--force', container], { print: false })
}
```

Add:

```json
"test:db:settings-weight": "node scripts/test-settings-weight-sync-db.mjs"
```

to `package.json`.

- [ ] **Step 4: Run pgTAP twice for idempotence confidence**

Run: `pnpm test:db:settings-weight && pnpm test:db:settings-weight`

Expected: both runs report all seven assertions passing and remove their containers.

- [ ] **Step 5: Commit the database contract**

```bash
git add supabase/migrations/048_profile_weight_measurement_sync.sql supabase/tests/048_profile_weight_measurement_sync_test.sql scripts/test-settings-weight-sync-db.mjs package.json
git commit -m "feat(measurements): sync current profile weight"
```

---

### Task 2: Measurement Validation and Reliable Actions

**Files:**
- Modify: `src/app/actions/measurements.logic.ts`
- Modify: `src/app/actions/__tests__/measurements.logic.test.ts`
- Create: `src/app/actions/__tests__/measurements.test.ts`
- Modify: `src/app/actions/measurements.ts`

**Interfaces:**
- Produces `parseMeasurementPayload(input): MeasurementPayloadParseResult`.
- Produces stable `MeasurementActionResult = { success: true; id?: string } | { success: false; error: string; fieldErrors?: MeasurementFieldErrors }`.
- Keeps `logMeasurement`, `updateMeasurement`, `deleteMeasurement` names.

- [ ] **Step 1: Write failing boundary tests**

```ts
it.each([
  ['weight_kg', 29.9], ['weight_kg', 300.1],
  ['body_fat_percentage', 0.9], ['body_fat_percentage', 75.1],
  ['muscle_mass_kg', 4.9], ['muscle_mass_kg', 200.1],
  ['waist_cm', 9.9], ['waist_cm', 300.1],
])('rejects %s=%s outside the accepted range', (field, value) => {
  const result = parseMeasurementPayload({ [field]: value })
  expect(result).toMatchObject({ ok: false, fieldErrors: { [field]: expect.any(String) } })
})

it('accepts notes-only payloads and trims them', () => {
  expect(parseMeasurementPayload({ notes: '  observación  ' })).toEqual({
    ok: true,
    value: { notes: 'observación' },
  })
})

it('rejects NaN, Infinity, an empty payload and notes over 500 characters', () => {
  expect(parseMeasurementPayload({ weight_kg: Number.NaN }).ok).toBe(false)
  expect(parseMeasurementPayload({ weight_kg: Number.POSITIVE_INFINITY }).ok).toBe(false)
  expect(parseMeasurementPayload({}).ok).toBe(false)
  expect(parseMeasurementPayload({ notes: 'x'.repeat(501) }).ok).toBe(false)
})
```

Action tests must assert invalid payloads do not call `.from()`, update/delete include both row id and authenticated `user_id`, database errors return friendly copy, and delete does not report success when Supabase fails.

- [ ] **Step 2: Run logic and action tests and confirm failure**

Run: `pnpm exec vitest run src/app/actions/__tests__/measurements.logic.test.ts src/app/actions/__tests__/measurements.test.ts`

Expected: FAIL because range parsing and reliable delete results do not exist.

- [ ] **Step 3: Implement the parser and action boundary**

Define ranges once:

```ts
const MEASUREMENT_RANGES = {
  weight_kg: [30, 300],
  body_fat_percentage: [1, 75],
  muscle_mass_kg: [5, 200],
  chest_cm: [10, 300],
  waist_cm: [10, 300],
  hips_cm: [10, 300],
  arms_cm: [10, 300],
  legs_cm: [10, 300],
} as const
```

Define the exact parser types:

```ts
export type MeasurementField = keyof typeof MEASUREMENT_RANGES | 'notes'
export type MeasurementFieldErrors = Partial<Record<MeasurementField, string>>
export type MeasurementPayloadParseResult =
  | { ok: true; value: LogMeasurementPayload }
  | { ok: false; error: string; fieldErrors: MeasurementFieldErrors }
```

Reject non-number finite values rather than coercing strings in the server action. Preserve explicit `null` so editing can clear a measurement. Trim notes, convert an empty note to `null`, and require at least one non-null numeric value or non-empty note.

In each action, authenticate first, parse before opening the mutation query, scope by `user_id`, and translate Supabase failures to stable copy. Validate ids with the existing UUID pattern style before update/delete. Return the updated row id only after Supabase confirms success. Revalidate `/medidas`, `/settings/datos`, `/dashboard` and `/progress` after successful mutations.

- [ ] **Step 4: Run focused tests and type-check**

Run: `pnpm exec vitest run src/app/actions/__tests__/measurements.logic.test.ts src/app/actions/__tests__/measurements.test.ts && pnpm type-check`

Expected: PASS.

- [ ] **Step 5: Commit measurement action hardening**

```bash
git add src/app/actions/measurements.logic.ts src/app/actions/__tests__/measurements.logic.test.ts src/app/actions/__tests__/measurements.test.ts src/app/actions/measurements.ts
git commit -m "fix(measurements): validate and confirm measurement writes"
```

---

### Task 3: Validated Personal Data Form and Current Weight Summary

**Files:**
- Create: `src/lib/profile/personalData.ts`
- Create: `src/lib/profile/__tests__/personalData.test.ts`
- Create: `src/components/settings/PersonalDataForm.tsx`
- Create: `src/components/settings/__tests__/PersonalDataForm.test.tsx`
- Create: `src/app/actions/__tests__/personalDataSettingsAction.test.ts`
- Modify: `src/app/actions/settings.ts`
- Modify: `src/app/(app)/settings/datos/page.tsx`
- Modify: `src/components/feedback/RouteLoading.tsx`
- Modify: `src/lib/i18n/index.ts`

**Interfaces:**
- Produces `parsePersonalDataForm(formData, now?): PersonalDataParseResult`.
- Produces `PersonalDataActionState` and stateful `updatePersonalData(previousState, formData)`.
- Produces `PersonalDataForm({ initial, currentWeightKg })`.

- [ ] **Step 1: Write failing domain, action and component tests**

```ts
it('accepts a completely empty optional profile', () => {
  expect(parsePersonalDataForm(formData({ heightCm: '', dateOfBirth: '', gender: '' }), new Date('2026-08-16')))
    .toEqual({ ok: true, value: { heightCm: null, dateOfBirth: null, gender: null } })
})

it.each([
  ['heightCm', '99.9'], ['heightCm', '250.1'],
  ['gender', 'unsupported'],
  ['dateOfBirth', '2010-08-17'],
  ['dateOfBirth', '1925-08-15'],
])('rejects invalid %s=%s', (field, value) => {
  const result = parsePersonalDataForm(formData({ heightCm: '', dateOfBirth: '', gender: '', [field]: value }), new Date('2026-08-16'))
  expect(result.ok).toBe(false)
})
```

Action test: verify invalid input never calls `.from()`, valid input updates only `height_cm`, `date_of_birth`, `gender`, `last_check_in_at`, and never includes `weight_kg`.

Component test:

```tsx
const html = renderWithProviders(
  <PersonalDataForm
    initial={{ heightCm: 175, dateOfBirth: '1996-01-01', gender: 'other' }}
    currentWeightKg={72.5}
  />,
)
expect(html).toContain('72.5 kg')
expect(html).toContain('href="/medidas?from=settings"')
expect(html).not.toContain('name="weightKg"')
expect(html).toContain('aria-describedby="heightCm-help"')
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm exec vitest run src/lib/profile/__tests__/personalData.test.ts src/app/actions/__tests__/personalDataSettingsAction.test.ts src/components/settings/__tests__/PersonalDataForm.test.tsx`

Expected: FAIL because the parser/form do not exist and weight is still editable.

- [ ] **Step 3: Implement optional validation, stateful action and summary**

Use an exact ISO date regex plus UTC date round-trip. Calculate age at the provided `now`, accounting for whether the birthday has occurred. Empty values become `null`; non-empty values must meet the global limits.

Define the domain result before the parser:

```ts
export type PersonalDataValue = {
  heightCm: number | null
  dateOfBirth: string | null
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null
}

export type PersonalDataFieldErrors = Partial<Record<'heightCm' | 'dateOfBirth' | 'gender', string>>
export type PersonalDataParseResult =
  | { ok: true; value: PersonalDataValue }
  | { ok: false; formError: string; fieldErrors: PersonalDataFieldErrors }
```

State shape:

```ts
export type PersonalDataActionState = {
  ok: boolean
  message: string | null
  formError: string | null
  fieldErrors: { heightCm?: string; dateOfBirth?: string; gender?: string }
}
```

Use `useActionState(updatePersonalData, INITIAL_PERSONAL_DATA_STATE)` in `PersonalDataForm`. Compose `SettingsField`, `SettingsSection`, `SettingsSaveBar` and `SettingsStatus`. Render current weight as read-only text and link to `/medidas?from=settings`; use “Sin peso registrado” when null. The server page should read `appProfile.weight_kg` and stop selecting/updating weight in its secondary query.

Add exact field, help, error and status translations. Update the skeleton to show three personal fields and a separate current-weight summary instead of an editable weight field.

- [ ] **Step 4: Run personal-data, loading and i18n tests**

Run: `pnpm exec vitest run src/lib/profile/__tests__/personalData.test.ts src/app/actions/__tests__/personalDataSettingsAction.test.ts src/components/settings/__tests__/PersonalDataForm.test.tsx src/components/feedback/__tests__/routeLoading.test.ts src/lib/i18n/__tests__/i18n.test.ts && pnpm type-check`

Expected: PASS.

- [ ] **Step 5: Commit personal-data unification**

```bash
git add src/lib/profile/personalData.ts src/lib/profile/__tests__/personalData.test.ts src/components/settings/PersonalDataForm.tsx src/components/settings/__tests__/PersonalDataForm.test.tsx src/app/actions/__tests__/personalDataSettingsAction.test.ts src/app/actions/settings.ts 'src/app/(app)/settings/datos/page.tsx' src/components/feedback/RouteLoading.tsx src/components/feedback/__tests__/routeLoading.test.ts src/lib/i18n/index.ts src/lib/i18n/__tests__/i18n.test.ts
git commit -m "feat(settings): unify personal data with current weight"
```

---

### Task 4: Polished Measurements Screen and Recoverable Interactions

**Files:**
- Create: `src/components/measurements/MeasurementForm.tsx`
- Create: `src/components/measurements/WeightChart.tsx`
- Create: `src/components/measurements/MeasurementHistory.tsx`
- Create: `src/components/measurements/__tests__/measurementInteractions.test.ts`
- Create: `src/components/measurements/__tests__/MeasurementsClient.test.tsx`
- Modify: `src/components/measurements/MeasurementsClient.tsx`
- Modify: `src/app/(app)/medidas/page.tsx`
- Modify: `src/components/feedback/RouteLoading.tsx`
- Modify: `src/components/feedback/__tests__/routeLoading.test.ts`
- Modify: `src/lib/i18n/index.ts`

**Interfaces:**
- Produces `deleteMeasurementInteraction(rows, id, action)` returning `{ rows, error }`.
- Produces `MeasurementForm({ initial, onSaved, onClose })`.
- Produces `MeasurementHistory({ rows, onRowsChange, onEdit })`.
- Changes `MeasurementsClient` props to `{ initialMeasurements, fromSettings }`; the client localizes its own back label.

- [ ] **Step 1: Write failing navigation, rendering and rollback tests**

```ts
it('restores the original rows when deletion fails', async () => {
  const rows = [measurement('row-1'), measurement('row-2')]
  const result = await deleteMeasurementInteraction(rows, 'row-1', async () => ({ success: false, error: 'No se pudo eliminar.' }))
  expect(result.rows).toEqual(rows)
  expect(result.error).toBe('No se pudo eliminar.')
})

it('removes the row only after a confirmed successful action result', async () => {
  const rows = [measurement('row-1'), measurement('row-2')]
  const result = await deleteMeasurementInteraction(rows, 'row-1', async () => ({ success: true }))
  expect(result.rows.map(row => row.id)).toEqual(['row-2'])
  expect(result.error).toBeNull()
})
```

Rendering test:

```tsx
const html = renderWithProviders(
  <MeasurementsClient initialMeasurements={[]} fromSettings />,
)
expect(html).toContain('Medidas corporales')
expect(html).toContain('Sin medidas registradas')
expect(html).toContain('aria-label="Ajustes"')
expect(html).toContain('min-h-11')
```

Page test: `from=settings` yields `/settings`; missing, repeated or unknown values yield `/dashboard`.

- [ ] **Step 2: Run measurements component tests and confirm failure**

Run: `pnpm exec vitest run src/components/measurements/__tests__/measurementInteractions.test.ts src/components/measurements/__tests__/MeasurementsClient.test.tsx`

Expected: FAIL because the helper, split components and back props do not exist.

- [ ] **Step 3: Split and implement the screen**

Move chart-only code to `WeightChart.tsx` and keep hooks unconditional before its empty return. Move form code to `MeasurementForm.tsx`; use the shared numeric ranges for HTML `min`/`max` and client error copy, but treat the server parser as authoritative. Use `role="alert"` for field/form errors and keep the dialog open on failure.

Move history rows to `MeasurementHistory.tsx`. Before deletion call:

```ts
if (!window.confirm(t('¿Eliminar esta medida?'))) return
```

Set the optimistic list, await `deleteMeasurementInteraction`, then restore its returned rows and show a toast on error. Announce success/error with an `aria-live="polite"` region. Do not swallow rejected promises; convert them to the same stable error result.

Use `PageTopBar` in `MeasurementsClient`:

```tsx
<PageTopBar
  title={t('Medidas corporales')}
  subtitle={t('Peso, composición y perímetros')}
  backHref={fromSettings ? '/settings' : '/dashboard'}
  backLabel={t(fromSettings ? 'Ajustes' : 'Dashboard')}
  icon={<Scale className="h-5 w-5" />}
  right={/* progress and register actions */}
/>
```

Replace literal `text-white`, `text-gray-*`, `bg-white/5` with the shared semantic tokens used in Ajustes. Localize dates with the active `language`, not hard-coded `es-ES`.

In the route:

```tsx
export default async function MedidasPage({ searchParams }: {
  searchParams?: { from?: string | string[] }
}) {
  const fromSettings = searchParams?.from === 'settings'
  const measurements = await getMeasurements()
  return <MeasurementsClient initialMeasurements={measurements} fromSettings={fromSettings} />
}
```

Add every heading, metric, action, dialog, date label, empty state and toast used by Medidas to `i18n/index.ts` with tests for English output.

Update `MeasurementsLoading` to use the same top-bar title/subtitle, summary grid, chart surface and history rows as the final screen. Extend `routeLoading.test.ts` to assert those four landmarks.

- [ ] **Step 4: Run measurement, action and i18n tests**

Run: `pnpm exec vitest run src/components/measurements/__tests__/measurementInteractions.test.ts src/components/measurements/__tests__/MeasurementsClient.test.tsx src/app/actions/__tests__/measurements.logic.test.ts src/app/actions/__tests__/measurements.test.ts src/components/feedback/__tests__/routeLoading.test.ts src/lib/i18n/__tests__/i18n.test.ts && pnpm type-check`

Expected: PASS.

- [ ] **Step 5: Commit the Measurements experience**

```bash
git add src/components/measurements/MeasurementForm.tsx src/components/measurements/WeightChart.tsx src/components/measurements/MeasurementHistory.tsx src/components/measurements/MeasurementsClient.tsx src/components/measurements/__tests__/measurementInteractions.test.ts src/components/measurements/__tests__/MeasurementsClient.test.tsx 'src/app/(app)/medidas/page.tsx' src/components/feedback/RouteLoading.tsx src/components/feedback/__tests__/routeLoading.test.ts src/lib/i18n/index.ts src/lib/i18n/__tests__/i18n.test.ts
git commit -m "feat(measurements): polish tracking and navigation"
```

---

### Task 5: End-to-End Settings Acceptance and Final Verification

**Files:**
- Create: `tests/e2e/settings.spec.ts`
- Modify only owned settings/measurements files if the acceptance test exposes a regression.

**Interfaces:**
- Verifies all three implementation plans as one user-visible feature.

- [ ] **Step 1: Write the end-to-end settings acceptance test**

```ts
import { expect, test } from './fixtures'
import { auditCriticalAndSeriousAccessibility, expectActionTargetsAtLeast44, expectNoHorizontalOverflow } from './helpers/acceptance'
import { signInAsE2EUser } from './helpers/auth'

test('settings routes are coherent, responsive and accessible', async ({ page }) => {
  test.setTimeout(240_000)
  await signInAsE2EUser(page)

  for (const route of [
    '/settings', '/settings/perfil', '/settings/datos',
    '/settings/entrenamiento', '/settings/notificaciones',
    '/settings/idioma', '/settings/cuenta', '/medidas?from=settings',
  ]) {
    await page.goto(route)
    await expect(page.locator('h1')).toHaveCount(1)
    await expectNoHorizontalOverflow(page)
    await expectActionTargetsAtLeast44(page)
    await auditCriticalAndSeriousAccessibility(page)
  }

  await page.goto('/settings/entrenamiento')
  await expect(page.getByText('Equipo disponible')).toBeVisible()
  await expect(page.locator('input[name="availableEquipment"][type="text"]')).toHaveCount(0)

  await page.goto('/medidas?from=settings')
  await page.getByRole('link', { name: /ajustes|settings/i }).click()
  await expect(page).toHaveURL(/\/settings$/)
})
```

The Playwright configuration already runs this test in mobile 375, tablet 768 and desktop 1024/1440 projects; do not add viewport-specific sleeps or screenshots as assertions.

- [ ] **Step 2: Run the acceptance test in mobile and desktop projects**

Run: `pnpm exec playwright test tests/e2e/settings.spec.ts --project=mobile-375 --project=desktop-1024`

Expected: PASS on both projects.

- [ ] **Step 3: Run all unit, static and build verification**

Run:

```bash
pnpm test
pnpm type-check
pnpm lint
pnpm build
pnpm test:db:settings-weight
```

Expected: every command exits 0.

- [ ] **Step 4: Run the acceptance test across every configured viewport**

Run: `pnpm exec playwright test tests/e2e/settings.spec.ts`

Expected: PASS in mobile-375, tablet-768, desktop-1024 and desktop-1440.

- [ ] **Step 5: Review final scope and commit acceptance coverage**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; no unrelated user files staged. Then:

```bash
git add tests/e2e/settings.spec.ts
git commit -m "test(settings): cover settings acceptance"
```



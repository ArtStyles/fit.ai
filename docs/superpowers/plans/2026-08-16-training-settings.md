# Training Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el formulario escueto de Entrenamiento por preferencias tipadas, visuales y coherentes con el motor, sin modificar automáticamente el plan activo.

**Architecture:** Un módulo de dominio compartirá catálogos y validación entre onboarding, Ajustes y acciones servidor. Una página servidor cargará el modelo inicial y un formulario cliente manejará las selecciones, mientras la acción servidor repetirá todas las reglas antes de actualizar exclusivamente `profiles`. La interfaz tendrá cuatro secciones: objetivo, disponibilidad, espacio/equipo y seguridad/alcance.

**Tech Stack:** Next.js App Router, React 19 `useActionState`, TypeScript, Tailwind CSS, Supabase server actions y Vitest.

**Spec:** `docs/superpowers/specs/2026-08-16-settings-quality-redesign-design.md`

## Global Constraints

- Ejecutar después de `2026-08-16-settings-foundation-preferences.md`.
- Conservar `/settings/entrenamiento` y las columnas actuales de `profiles`.
- Objetivo, nivel, frecuencia, duración, espacio y días exactos son obligatorios.
- Frecuencia permitida: 2, 3, 4, 5 o 6.
- Duración permitida: 30, 45, 60 o 90 minutos.
- Días ISO únicos entre 1 y 7, con longitud igual a `days_per_week`.
- Equipo limitado a los ocho identificadores canónicos del motor.
- `home_no_equipment` siempre persiste `available_equipment: []`.
- Lesiones admite vacío o un máximo de 1.000 caracteres.
- Guardar solo actualiza el perfil; nunca escribe tablas del plan activo.
- Controles interactivos de al menos 44 px, i18n español/inglés y errores accesibles.
- No añadir dependencias de producción.
- Preservar cambios no relacionados ya presentes en `src/components/plan/__tests__/`.

## File Map

- `src/lib/profile/trainingPreferences.ts`: catálogos, tipos y parser servidor.
- `src/lib/profile/__tests__/trainingPreferences.test.ts`: contrato puro.
- `src/components/onboarding/ProfileStage.tsx`: consume objetivos y niveles compartidos.
- `src/components/onboarding/EquipmentStage.tsx`: consume el catálogo compartido.
- `src/components/onboarding/AvailabilityStage.tsx`: consume frecuencia y duración compartidas.
- `src/components/onboarding/onboardingStages.ts`: consume identificadores compartidos.
- `src/app/actions/settings.ts`: acción `updateTrainingSettings` basada en estado.
- `src/app/actions/__tests__/trainingSettingsAction.test.ts`: límite servidor y alcance de escritura.
- `src/components/settings/TrainingSettingsForm.tsx`: interacción y composición de las cuatro secciones.
- `src/components/settings/__tests__/TrainingSettingsForm.test.tsx`: renderizado, reglas y errores.
- `src/app/(app)/settings/entrenamiento/page.tsx`: carga y adaptación del perfil.
- `src/components/feedback/RouteLoading.tsx`: esqueleto de la nueva composición.
- `src/lib/i18n/index.ts`: etiquetas, ayudas, estados y errores.

---

### Task 1: Canonical Training Preferences Domain

**Files:**
- Create: `src/lib/profile/trainingPreferences.ts`
- Create: `src/lib/profile/__tests__/trainingPreferences.test.ts`
- Modify: `src/components/onboarding/ProfileStage.tsx`
- Modify: `src/components/onboarding/EquipmentStage.tsx`
- Modify: `src/components/onboarding/AvailabilityStage.tsx`
- Modify: `src/components/onboarding/onboardingStages.ts`
- Modify: `src/components/settings/fields.tsx`

**Interfaces:**
- Produces constants `TRAINING_GOALS`, `FITNESS_LEVELS`, `GYM_TYPES`, `TRAINING_FREQUENCIES`, `SESSION_DURATIONS`, `WEEK_DAYS`, `EQUIPMENT_OPTIONS`.
- Produces types `TrainingSettingsValue`, `TrainingSettingsFieldErrors`, `TrainingSettingsParseResult`.
- Produces `parseTrainingSettingsForm(formData: FormData): TrainingSettingsParseResult`.
- Onboarding consumes the same identifiers without changing its persisted payload.

- [ ] **Step 1: Write the failing domain tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  EQUIPMENT_OPTIONS,
  parseTrainingSettingsForm,
} from '../trainingPreferences'

function validForm(overrides: Record<string, string | string[]> = {}) {
  const form = new FormData()
  const values: Record<string, string | string[]> = {
    primaryGoal: 'build_muscle',
    fitnessLevel: 'intermediate',
    daysPerWeek: '3',
    sessionDurationMinutes: '60',
    gymType: 'home_basic',
    preferredWorkoutDays: ['1', '3', '5'],
    availableEquipment: ['dumbbells', 'resistance_bands'],
    injuries: '',
    ...overrides,
  }
  for (const [key, raw] of Object.entries(values)) {
    for (const value of Array.isArray(raw) ? raw : [raw]) form.append(key, value)
  }
  return form
}

describe('parseTrainingSettingsForm', () => {
  it('normalizes a valid payload', () => {
    expect(parseTrainingSettingsForm(validForm())).toEqual({
      ok: true,
      value: {
        primaryGoal: 'build_muscle',
        fitnessLevel: 'intermediate',
        daysPerWeek: 3,
        sessionDurationMinutes: 60,
        gymType: 'home_basic',
        preferredWorkoutDays: [1, 3, 5],
        availableEquipment: ['dumbbells', 'resistance_bands'],
        injuries: null,
      },
    })
  })

  it.each(['20', '45.5', '120'])('rejects unsupported duration %s', duration => {
    const result = parseTrainingSettingsForm(validForm({ sessionDurationMinutes: duration }))
    expect(result).toMatchObject({ ok: false, fieldErrors: { sessionDurationMinutes: expect.any(String) } })
  })

  it('requires the selected-day count to equal frequency after deduplication', () => {
    const result = parseTrainingSettingsForm(validForm({ preferredWorkoutDays: ['1', '1', '5'] }))
    expect(result).toMatchObject({ ok: false, fieldErrors: { preferredWorkoutDays: expect.any(String) } })
  })

  it('clears equipment for bodyweight training', () => {
    const result = parseTrainingSettingsForm(validForm({
      gymType: 'home_no_equipment',
      availableEquipment: ['barbell'],
    }))
    expect(result).toMatchObject({ ok: true, value: { availableEquipment: [] } })
  })

  it('rejects unknown equipment and overlong injury notes', () => {
    expect(parseTrainingSettingsForm(validForm({ availableEquipment: ['unknown'] })).ok).toBe(false)
    expect(parseTrainingSettingsForm(validForm({ injuries: 'x'.repeat(1001) })).ok).toBe(false)
  })
})

it('keeps the exact eight engine-supported equipment values', () => {
  expect(EQUIPMENT_OPTIONS.map(option => option.value)).toEqual([
    'dumbbells', 'barbell', 'bench', 'kettlebell',
    'resistance_bands', 'cable_machine', 'pull_up_bar', 'trx',
  ])
})
```

- [ ] **Step 2: Run the domain test and confirm failure**

Run: `pnpm exec vitest run src/lib/profile/__tests__/trainingPreferences.test.ts`

Expected: FAIL because the domain module does not exist.

- [ ] **Step 3: Implement typed catalogs and parser**

Use immutable option objects with translation keys:

```ts
export const TRAINING_GOALS = [
  { value: 'lose_weight', label: 'Perder peso' },
  { value: 'build_muscle', label: 'Ganar músculo' },
  { value: 'gain_strength', label: 'Ganar fuerza' },
  { value: 'stay_active', label: 'Mantenerse activo' },
  { value: 'improve_endurance', label: 'Mejorar resistencia' },
  { value: 'other', label: 'Otro' },
] as const

export const FITNESS_LEVELS = [
  { value: 'beginner', label: 'Principiante' },
  { value: 'intermediate', label: 'Intermedio' },
  { value: 'advanced', label: 'Avanzado' },
] as const

export const GYM_TYPES = [
  { value: 'home_no_equipment', label: 'Casa sin equipo' },
  { value: 'home_basic', label: 'Casa con equipo básico' },
  { value: 'full_gym', label: 'Gimnasio completo' },
] as const

export const TRAINING_FREQUENCIES = [2, 3, 4, 5, 6] as const
export const SESSION_DURATIONS = [30, 45, 60, 90] as const
export const WEEK_DAYS = [
  { value: 1, shortLabel: 'L', label: 'Lunes' },
  { value: 2, shortLabel: 'M', label: 'Martes' },
  { value: 3, shortLabel: 'X', label: 'Miércoles' },
  { value: 4, shortLabel: 'J', label: 'Jueves' },
  { value: 5, shortLabel: 'V', label: 'Viernes' },
  { value: 6, shortLabel: 'S', label: 'Sábado' },
  { value: 7, shortLabel: 'D', label: 'Domingo' },
] as const

export const EQUIPMENT_OPTIONS = [
  { value: 'dumbbells', label: 'Mancuernas' },
  { value: 'barbell', label: 'Barra' },
  { value: 'bench', label: 'Banco' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'resistance_bands', label: 'Bandas' },
  { value: 'cable_machine', label: 'Polea o cable' },
  { value: 'pull_up_bar', label: 'Barra de dominadas' },
  { value: 'trx', label: 'TRX' },
] as const
```

Define the shared value and error types explicitly:

```ts
export type TrainingSettingsValue = {
  primaryGoal: typeof TRAINING_GOALS[number]['value']
  fitnessLevel: typeof FITNESS_LEVELS[number]['value']
  daysPerWeek: typeof TRAINING_FREQUENCIES[number]
  sessionDurationMinutes: typeof SESSION_DURATIONS[number]
  gymType: typeof GYM_TYPES[number]['value']
  preferredWorkoutDays: number[]
  availableEquipment: Array<typeof EQUIPMENT_OPTIONS[number]['value']>
  injuries: string | null
}

export type TrainingSettingsFieldErrors = Partial<Record<
  'primaryGoal' | 'fitnessLevel' | 'daysPerWeek' |
  'sessionDurationMinutes' | 'gymType' |
  'preferredWorkoutDays' | 'availableEquipment' | 'injuries',
  string
>>
```

Implement exact membership helpers without coercing unsupported numbers. Build `fieldErrors` for every failing field in one pass. Deduplicate and numeric-sort days. Normalize trimmed empty injuries to `null`. Export a discriminated result:

```ts
export type TrainingSettingsParseResult =
  | { ok: true; value: TrainingSettingsValue }
  | { ok: false; fieldErrors: TrainingSettingsFieldErrors; formError: string }
```

Refactor onboarding constants to import the shared values and add icons/descriptions locally by identifier. `ProfileStage` continues omitting the `other` goal from onboarding by filtering that identifier; Ajustes may display it for compatibility with the database. `settings/fields.tsx` should re-export goal/level/gym options temporarily for callers not yet migrated, rather than keeping duplicate arrays.

- [ ] **Step 4: Run domain and onboarding tests**

Run: `pnpm exec vitest run src/lib/profile/__tests__/trainingPreferences.test.ts src/components/onboarding/__tests__/onboardingStages.test.ts src/components/onboarding/__tests__/onboardingExperience.test.ts`

Expected: PASS with unchanged onboarding behavior.

- [ ] **Step 5: Commit the canonical domain**

```bash
git add src/lib/profile/trainingPreferences.ts src/lib/profile/__tests__/trainingPreferences.test.ts src/components/onboarding/ProfileStage.tsx src/components/onboarding/EquipmentStage.tsx src/components/onboarding/AvailabilityStage.tsx src/components/onboarding/onboardingStages.ts src/components/settings/fields.tsx
git commit -m "refactor(settings): share training preference catalogs"
```

---

### Task 2: Validated Training Settings Server Action

**Files:**
- Create: `src/app/actions/__tests__/trainingSettingsAction.test.ts`
- Modify: `src/app/actions/settings.ts`

**Interfaces:**
- Consumes: `parseTrainingSettingsForm` from Task 1.
- Produces `TrainingSettingsActionState` and `INITIAL_TRAINING_SETTINGS_STATE`.
- Changes action signature to `updateTrainingSettings(previousState: TrainingSettingsActionState, formData: FormData): Promise<TrainingSettingsActionState>`.

- [ ] **Step 1: Write failing action tests for rejection and scoped update**

```ts
it('rejects invalid values before opening a profiles query', async () => {
  const from = vi.fn()
  mockCreateClient({ user: { id: 'user-1' }, from })
  const form = validTrainingForm({ sessionDurationMinutes: '20' })

  const result = await updateTrainingSettings(INITIAL_TRAINING_SETTINGS_STATE, form)

  expect(result.ok).toBe(false)
  expect(result.fieldErrors.sessionDurationMinutes).toBeTruthy()
  expect(from).not.toHaveBeenCalled()
})

it('updates only the authenticated profile with normalized values', async () => {
  const eq = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn((table: string) => {
    expect(table).toBe('profiles')
    return { update }
  })
  mockCreateClient({ user: { id: 'user-1' }, from })

  const result = await updateTrainingSettings(
    INITIAL_TRAINING_SETTINGS_STATE,
    validTrainingForm(),
  )

  expect(result).toMatchObject({ ok: true, message: 'Preferencias guardadas.' })
  expect(update).toHaveBeenCalledWith({
    fitness_level: 'intermediate',
    primary_goal: 'build_muscle',
    days_per_week: 3,
    session_duration_minutes: 60,
    gym_type: 'home_basic',
    available_equipment: ['dumbbells', 'resistance_bands'],
    injuries: null,
    preferred_workout_days: [1, 3, 5],
    last_check_in_at: expect.any(String),
  })
  expect(eq).toHaveBeenCalledWith('id', 'user-1')
})

it('never opens a workout-plan table', async () => {
  // collect every table passed to from(); assert the list is exactly ['profiles']
})
```

- [ ] **Step 2: Run the action test and confirm the old redirect action fails it**

Run: `pnpm exec vitest run src/app/actions/__tests__/trainingSettingsAction.test.ts`

Expected: FAIL because the current signature redirects and lacks field errors.

- [ ] **Step 3: Implement the stateful action**

```ts
export type TrainingSettingsActionState = {
  ok: boolean
  message: string | null
  formError: string | null
  fieldErrors: TrainingSettingsFieldErrors
}

export const INITIAL_TRAINING_SETTINGS_STATE: TrainingSettingsActionState = {
  ok: false,
  message: null,
  formError: null,
  fieldErrors: {},
}

export async function updateTrainingSettings(
  _previousState: TrainingSettingsActionState,
  formData: FormData,
): Promise<TrainingSettingsActionState> {
  const parsed = parseTrainingSettingsForm(formData)
  if (!parsed.ok) return { ok: false, message: null, formError: parsed.formError, fieldErrors: parsed.fieldErrors }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: null, formError: 'Sesión no válida.', fieldErrors: {} }

  const value = parsed.value
  const { error } = await (supabase.from('profiles') as any).update({
    fitness_level: value.fitnessLevel,
    primary_goal: value.primaryGoal,
    days_per_week: value.daysPerWeek,
    session_duration_minutes: value.sessionDurationMinutes,
    gym_type: value.gymType,
    available_equipment: value.availableEquipment,
    injuries: value.injuries,
    preferred_workout_days: value.preferredWorkoutDays,
    last_check_in_at: new Date().toISOString(),
  }).eq('id', user.id)

  if (error) return { ok: false, message: null, formError: 'No se pudieron guardar las preferencias.', fieldErrors: {} }
  revalidatePath('/settings/entrenamiento')
  revalidatePath('/dashboard')
  revalidatePath('/plan')
  return { ok: true, message: 'Preferencias guardadas.', formError: null, fieldErrors: {} }
}
```

Do not redirect on validation or persistence errors; this preserves the client state. Keep authentication as a returned error for this action so `useActionState` can announce it.

- [ ] **Step 4: Run action and type tests**

Run: `pnpm exec vitest run src/app/actions/__tests__/trainingSettingsAction.test.ts src/lib/profile/__tests__/trainingPreferences.test.ts && pnpm type-check`

Expected: PASS.

- [ ] **Step 5: Commit the action boundary**

```bash
git add src/app/actions/settings.ts src/app/actions/__tests__/trainingSettingsAction.test.ts
git commit -m "fix(settings): validate training preferences on the server"
```

---

### Task 3: Interactive Training Settings Form

**Files:**
- Create: `src/components/settings/TrainingSettingsForm.tsx`
- Create: `src/components/settings/__tests__/TrainingSettingsForm.test.tsx`
- Modify: `src/lib/i18n/index.ts`

**Interfaces:**
- Consumes: Task 1 catalogs and shared visual primitives from the foundation plan.
- Consumes: `updateTrainingSettings`, `TrainingSettingsActionState`, `INITIAL_TRAINING_SETTINGS_STATE` from Task 2.
- Produces `TrainingSettingsForm({ initial, readinessStatus, hasActivePlan })`.

- [ ] **Step 1: Write failing render tests for the four sections and hidden form contract**

```tsx
const initial: TrainingSettingsValue = {
  primaryGoal: 'build_muscle',
  fitnessLevel: 'advanced',
  daysPerWeek: 5,
  sessionDurationMinutes: 90,
  gymType: 'full_gym',
  preferredWorkoutDays: [1, 2, 3, 4, 5],
  availableEquipment: ['dumbbells', 'barbell'],
  injuries: null,
}

it('renders canonical equipment as buttons instead of CSV text', () => {
  const html = renderWithProviders(
    <TrainingSettingsForm initial={initial} readinessStatus="cleared" hasActivePlan />,
  )
  expect(html).toContain('Objetivo y experiencia')
  expect(html).toContain('Disponibilidad')
  expect(html).toContain('Espacio y equipo')
  expect(html).toContain('Seguridad')
  expect(html).toContain('Mancuernas')
  expect(html).toContain('aria-pressed="true"')
  expect(html).not.toContain('mancuernas, barra, polea')
  expect(html).not.toContain('name="availableEquipment" value="dumbbells,barbell"')
})

it('renders one hidden input per selected day and equipment item', () => {
  const html = renderWithProviders(
    <TrainingSettingsForm initial={initial} readinessStatus="modified" hasActivePlan={false} />,
  )
  expect(html.match(/name="preferredWorkoutDays"/g)).toHaveLength(5)
  expect(html.match(/name="availableEquipment"/g)).toHaveLength(2)
})

it('explains that saving does not rewrite the active plan', () => {
  const html = renderWithProviders(
    <TrainingSettingsForm initial={initial} readinessStatus="cleared" hasActivePlan />,
  )
  expect(html).toContain('no cambia automáticamente tu plan activo')
  expect(html).toContain('href="/plan"')
})
```

Add a pure exported helper test:

```ts
expect(daySelectionMessage(5, [1, 2, 3, 4, 5, 6], t)).toBe('Quita 1 día para continuar.')
expect(daySelectionMessage(5, [1, 2, 3], t)).toBe('Elige 2 días más para continuar.')
```

The helper signature is:

```ts
export function daySelectionMessage(
  daysPerWeek: number,
  selectedDays: readonly number[],
  t: (key: string, values?: Record<string, string | number>) => string,
): string | null
```

- [ ] **Step 2: Run the component test and confirm failure**

Run: `pnpm exec vitest run src/components/settings/__tests__/TrainingSettingsForm.test.tsx`

Expected: FAIL because the component and helper do not exist.

- [ ] **Step 3: Implement local selection state and four visual sections**

Use this state shape:

```ts
const [form, setForm] = useState(initial)
const [state, action, pending] = useActionState(updateTrainingSettings, INITIAL_TRAINING_SETTINGS_STATE)
const dayCountValid = form.preferredWorkoutDays.length === form.daysPerWeek
```

Render hidden inputs from state so the server receives only canonical values:

```tsx
<input type="hidden" name="primaryGoal" value={form.primaryGoal} />
<input type="hidden" name="fitnessLevel" value={form.fitnessLevel} />
<input type="hidden" name="daysPerWeek" value={form.daysPerWeek} />
<input type="hidden" name="sessionDurationMinutes" value={form.sessionDurationMinutes} />
<input type="hidden" name="gymType" value={form.gymType} />
{form.preferredWorkoutDays.map(day => <input key={day} type="hidden" name="preferredWorkoutDays" value={day} />)}
{form.availableEquipment.map(item => <input key={item} type="hidden" name="availableEquipment" value={item} />)}
```

Rules in the client:

- changing frequency preserves selected days;
- selected days are kept unique and sorted;
- selecting `home_no_equipment` immediately sets `availableEquipment: []`;
- equipment controls are omitted for `home_no_equipment`;
- unknown persisted equipment was removed by the page adapter and never appears;
- Save is disabled when pending or the day count is invalid;
- action field errors are passed to the corresponding group;
- a top-level `SettingsStatus` shows success or form error;
- `readinessStatus` maps to localized neutral/green/amber copy and is read-only;
- show `/plan` CTA only when `hasActivePlan` is true.

Add all copy, full weekdays, equipment, statuses and plural messages to `i18n/index.ts` and verify them in `i18n.test.ts`.

- [ ] **Step 4: Run form and i18n tests**

Run: `pnpm exec vitest run src/components/settings/__tests__/TrainingSettingsForm.test.tsx src/lib/i18n/__tests__/i18n.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the form**

```bash
git add src/components/settings/TrainingSettingsForm.tsx src/components/settings/__tests__/TrainingSettingsForm.test.tsx src/lib/i18n/index.ts src/lib/i18n/__tests__/i18n.test.ts
git commit -m "feat(settings): add structured training preferences form"
```

---

### Task 4: Server Page Adapter and Legacy Compatibility

**Files:**
- Create: `src/components/settings/__tests__/trainingSettingsPage.test.tsx`
- Modify: `src/app/(app)/settings/entrenamiento/page.tsx`
- Modify: `src/components/feedback/RouteLoading.tsx`
- Modify: `src/components/feedback/__tests__/routeLoading.test.ts`

**Interfaces:**
- Consumes: `TrainingSettingsForm` from Task 3 and canonical catalog sets from Task 1.
- Produces a safe `TrainingSettingsValue` for incomplete or legacy profiles.

- [ ] **Step 1: Write failing page-adapter tests**

```tsx
it('drops unknown legacy equipment without crashing', async () => {
  mockTrainingProfile({
    fitness_level: 'advanced', primary_goal: 'build_muscle',
    days_per_week: 3, session_duration_minutes: 60, gym_type: 'full_gym',
    available_equipment: ['dumbbells', 'legacy_machine'],
    injuries: null, preferred_workout_days: [1, 3, 5],
    readiness_status: 'cleared',
  })
  const html = renderToStaticMarkup(await TrainingSettingsPage())
  expect(html).toContain('Mancuernas')
  expect(html).not.toContain('legacy_machine')
})

it('renders an invalid legacy day schedule but requires correction before save', async () => {
  mockTrainingProfile({ days_per_week: 3, preferred_workout_days: [1, 2, 3, 4] })
  const html = renderToStaticMarkup(await TrainingSettingsPage())
  expect(html).toContain('Quita 1 día para continuar.')
  expect(html).toContain('disabled')
})
```

Also assert the page makes a lightweight active-plan existence query and passes `hasActivePlan` without fetching workout details.

- [ ] **Step 2: Run page and skeleton tests and confirm failure**

Run: `pnpm exec vitest run src/components/settings/__tests__/trainingSettingsPage.test.tsx src/components/feedback/__tests__/routeLoading.test.ts`

Expected: FAIL because the old page renders native inputs and the old skeleton.

- [ ] **Step 3: Adapt database rows to the client model**

Query profile fields plus readiness:

```ts
.select(`
  fitness_level, primary_goal, days_per_week, session_duration_minutes,
  gym_type, available_equipment, injuries, preferred_workout_days,
  readiness_status
`)
```

In parallel, query only `id` from `workout_plans` with `user_id`, `is_active = true`, `.limit(1).maybeSingle()`. Normalize only for display:

- use valid stored enum values or the first canonical option for incomplete legacy profiles;
- use 3 days and 60 minutes only as display defaults when stored values are absent;
- preserve stored preferred-day arrays, including inconsistent counts, so the user sees what must be corrected;
- filter equipment by `EQUIPMENT_OPTIONS` membership;
- pass `readiness_status ?? 'pending'`.

Render `TrainingSettingsForm` inside `SettingsScreen` with a localized description. Replace `TrainingSettingsLoading` with four section placeholders matching the final layout and no CSV-shaped field.

- [ ] **Step 4: Run training page, form, route-loading and type tests**

Run: `pnpm exec vitest run src/components/settings/__tests__/trainingSettingsPage.test.tsx src/components/settings/__tests__/TrainingSettingsForm.test.tsx src/components/feedback/__tests__/routeLoading.test.ts && pnpm type-check`

Expected: PASS.

- [ ] **Step 5: Commit the route integration**

```bash
git add 'src/app/(app)/settings/entrenamiento/page.tsx' src/components/settings/__tests__/trainingSettingsPage.test.tsx src/components/feedback/RouteLoading.tsx src/components/feedback/__tests__/routeLoading.test.ts
git commit -m "feat(settings): integrate structured training settings"
```

---

### Task 5: Training Settings Verification

**Files:**
- Modify only files owned by Tasks 1–4 if verification reveals a regression.

**Interfaces:**
- Produces the verified training-settings block required before measurements work begins.

- [ ] **Step 1: Run the complete focused test set**

Run:

```bash
pnpm exec vitest run \
  src/lib/profile/__tests__/trainingPreferences.test.ts \
  src/app/actions/__tests__/trainingSettingsAction.test.ts \
  src/components/settings/__tests__/TrainingSettingsForm.test.tsx \
  src/components/settings/__tests__/trainingSettingsPage.test.tsx \
  src/components/onboarding/__tests__/onboardingStages.test.ts \
  src/components/onboarding/__tests__/onboardingExperience.test.ts \
  src/components/feedback/__tests__/routeLoading.test.ts \
  src/lib/i18n/__tests__/i18n.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run static analysis and production build**

Run: `pnpm type-check && pnpm lint && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 3: Verify no active-plan mutation is reachable from the action**

Run: `rg -n "from\('(workout_plans|workouts|workout_exercises)'\)|rpc\(" src/app/actions/settings.ts`

Expected: no matches inside `updateTrainingSettings`.

- [ ] **Step 4: Inspect scope and whitespace**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; unrelated plan-test modifications remain unstaged.

- [ ] **Step 5: Return any discovered defect to its owning task**

Do not create a generic cleanup commit. Add a failing regression test to the owning task, implement the smallest fix, rerun that task's focused command, and amend that task's commit.



# Structured Plan Adjustments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the weekly “Pedir ajuste al coach” flow with a structured “Ajustar plan” dialog that sends validated intents directly to the deterministic training engine.

**Architecture:** A pure plans-domain module will own runtime validation and the shared options contract. The plan page will supply already-loaded profile and exercise options to a client dialog, while server actions will validate every preview and apply request before calling `generatePlan({ mode: 'plan_adjustment' })`. The conversational coach and individual-workout AI adjustment flow remain unchanged.

**Tech Stack:** Next.js 14 server actions, React 18, TypeScript, Supabase, Vitest, Tailwind CSS, Radix Dialog.

## Global Constraints

- The weekly adjustment UI must not send free text or call Anthropic.
- One structured adjustment category is allowed per operation.
- Supported categories are days, duration, intensity, unavailable equipment, cardio preferences, and exercise replacement.
- Adjustments affect only the active plan; persistent profile preferences continue to be managed from Profile.
- Preview and apply must both revalidate authentication, plan ownership, active-plan state, intent shape, equipment, and exercise identifiers.
- Health changes are not an adjustment category and continue through the readiness-review flow.
- “Regenerar semana” remains an independent adaptive engine operation.
- All new user-facing copy must be available in Spanish and English.

---

### Task 1: Add the structured intent boundary

**Files:**
- Create: `src/lib/plans/adjustmentIntent.ts`
- Create: `src/lib/plans/__tests__/adjustmentIntent.test.ts`
- Create: `src/lib/ai/healthRequest.ts`
- Create: `src/lib/ai/__tests__/healthRequest.test.ts`
- Delete: `src/lib/ai/planAdjustmentIntent.ts`
- Delete: `src/lib/ai/__tests__/planAdjustmentIntent.test.ts`

**Interfaces:**
- Produces: `CARDIO_MODALITIES: readonly CardioModality[]`
- Produces: `PlanAdjustmentOptions`
- Produces: `validatePlanAdjustmentIntent(raw: unknown, options: PlanAdjustmentOptions): PlanAdjustmentIntent | null`
- Produces: `isHealthChangeRequest(request: string): boolean`

- [ ] **Step 1: Write failing validator tests**

```ts
import { describe, expect, it } from 'vitest'
import { validatePlanAdjustmentIntent } from '../adjustmentIntent'

const options = {
  currentDaysPerWeek: 4,
  currentSessionDurationMinutes: 60,
  availableEquipment: ['dumbbells', 'bench'],
  cardioPreferences: ['walking' as const],
  exercises: [{ id: 'exercise-1', name: 'Press de banca' }],
}

describe('validatePlanAdjustmentIntent', () => {
  it.each([
    [{ type: 'change_days', daysPerWeek: 3 }],
    [{ type: 'change_duration', sessionDurationMinutes: 45 }],
    [{ type: 'change_intensity', direction: 'easier' }],
    [{ type: 'equipment_unavailable', equipment: ['bench'] }],
    [{ type: 'replace_exercise', exerciseId: 'exercise-1' }],
    [{ type: 'change_cardio_preferences', cardioPreferences: ['cycling'] }],
  ])('accepts a supported structured intent', raw => {
    expect(validatePlanAdjustmentIntent(raw, options)).toEqual(raw)
  })

  it.each([
    { type: 'change_days', daysPerWeek: 7 },
    { type: 'change_duration', sessionDurationMinutes: 50 },
    { type: 'change_intensity', direction: 'maximum' },
    { type: 'equipment_unavailable', equipment: ['barbell'] },
    { type: 'replace_exercise', exerciseId: 'foreign-id' },
    { type: 'change_cardio_preferences', cardioPreferences: ['swimming'] },
    { type: 'health_change' },
  ])('rejects an unsupported or out-of-context intent', raw => {
    expect(validatePlanAdjustmentIntent(raw, options)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the validator test and confirm the red state**

Run: `npm test -- src/lib/plans/__tests__/adjustmentIntent.test.ts`

Expected: FAIL because `src/lib/plans/adjustmentIntent.ts` does not exist.

- [ ] **Step 3: Implement the plans-domain validator**

```ts
import type { CardioModality, PlanAdjustmentIntent } from '@/lib/training-engine'

export const CARDIO_MODALITIES = [
  'walking', 'running', 'cycling', 'elliptical', 'rowing', 'stairs', 'jump_rope',
] as const satisfies readonly CardioModality[]

export interface PlanAdjustmentOptions {
  currentDaysPerWeek: number
  currentSessionDurationMinutes: number
  availableEquipment: string[]
  cardioPreferences: CardioModality[]
  exercises: Array<{ id: string; name: string }>
}

export function validatePlanAdjustmentIntent(
  raw: unknown,
  options: PlanAdjustmentOptions,
): PlanAdjustmentIntent | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (value.type === 'change_days' && Number.isInteger(value.daysPerWeek)
      && Number(value.daysPerWeek) >= 2 && Number(value.daysPerWeek) <= 6) {
    return { type: 'change_days', daysPerWeek: Number(value.daysPerWeek) }
  }
  if (value.type === 'change_duration'
      && [30, 45, 60, 90].includes(Number(value.sessionDurationMinutes))) {
    return {
      type: 'change_duration',
      sessionDurationMinutes: Number(value.sessionDurationMinutes) as 30 | 45 | 60 | 90,
    }
  }
  if (value.type === 'change_intensity'
      && (value.direction === 'easier' || value.direction === 'harder')) {
    return { type: 'change_intensity', direction: value.direction }
  }
  if (value.type === 'equipment_unavailable' && Array.isArray(value.equipment)) {
    const allowed = new Set(options.availableEquipment)
    const equipment = Array.from(new Set(value.equipment))
      .filter((item): item is string => typeof item === 'string' && allowed.has(item))
    return equipment.length === value.equipment.length && equipment.length > 0
      ? { type: 'equipment_unavailable', equipment }
      : null
  }
  if (value.type === 'replace_exercise' && typeof value.exerciseId === 'string'
      && options.exercises.some(exercise => exercise.id === value.exerciseId)) {
    return { type: 'replace_exercise', exerciseId: value.exerciseId }
  }
  if (value.type === 'change_cardio_preferences' && Array.isArray(value.cardioPreferences)) {
    const allowed = new Set<string>(CARDIO_MODALITIES)
    const cardioPreferences = Array.from(new Set(value.cardioPreferences))
      .filter((item): item is CardioModality => typeof item === 'string' && allowed.has(item))
    return cardioPreferences.length === value.cardioPreferences.length && cardioPreferences.length > 0
      ? { type: 'change_cardio_preferences', cardioPreferences }
      : null
  }
  return null
}
```

- [ ] **Step 4: Move the health-text guard and test it independently**

```ts
// src/lib/ai/healthRequest.ts
const HEALTH_PATTERN = /dolor|duele|dol[ií]a|lesi[oó]n|molestia|mareo|desmayo|cirug|m[eé]dic|pain|injury/i

export function isHealthChangeRequest(request: string): boolean {
  return HEALTH_PATTERN.test(request)
}
```

```ts
// src/lib/ai/__tests__/healthRequest.test.ts
import { describe, expect, it } from 'vitest'
import { isHealthChangeRequest } from '../healthRequest'

describe('isHealthChangeRequest', () => {
  it('detects health-related requests', () => {
    expect(isHealthChangeRequest('Me duele el hombro')).toBe(true)
  })

  it('does not confuse pecho with a health request', () => {
    expect(isHealthChangeRequest('Quiero entrenar más el pecho')).toBe(false)
  })
})
```

- [ ] **Step 5: Delete the AI intent interpreter and its obsolete tests**

Delete `src/lib/ai/planAdjustmentIntent.ts` and
`src/lib/ai/__tests__/planAdjustmentIntent.test.ts`. Update the individual
workout adjustment import in `src/app/actions/adjustPlan.ts` to use
`@/lib/ai/healthRequest`.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- src/lib/plans/__tests__/adjustmentIntent.test.ts src/lib/ai/__tests__/healthRequest.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the domain boundary**

```bash
git add src/lib/plans/adjustmentIntent.ts src/lib/plans/__tests__/adjustmentIntent.test.ts src/lib/ai/healthRequest.ts src/lib/ai/__tests__/healthRequest.test.ts src/lib/ai/planAdjustmentIntent.ts src/lib/ai/__tests__/planAdjustmentIntent.test.ts src/app/actions/adjustPlan.ts
git commit -m "refactor(plan): replace AI adjustment intent with validation"
```

### Task 2: Route preview and apply directly to the engine

**Files:**
- Modify: `src/app/actions/adjustPlan.ts`
- Create: `src/app/actions/__tests__/structuredPlanAdjustment.test.ts`

**Interfaces:**
- Consumes: `validatePlanAdjustmentIntent(raw, options)` from Task 1
- Produces: `previewStructuredPlanAdjustment(planId: string, rawIntent: unknown): Promise<SuggestPlanAdjustmentResult>`
- Updates: `applyPlanAdjustment(planId: string, rawIntent: unknown): Promise<ApplyAdjustmentResult>`

- [ ] **Step 1: Write a structural regression test for the server action**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../adjustPlan.ts', import.meta.url), 'utf8')

describe('structured weekly plan adjustment action', () => {
  it('does not import or invoke the AI intent interpreter', () => {
    expect(source).not.toContain('generatePlanAdjustmentIntent')
    expect(source).not.toContain("from '@/lib/ai/planAdjustmentIntent'")
  })

  it('validates preview and apply inputs before generation', () => {
    expect(source).toContain('export async function previewStructuredPlanAdjustment')
    expect(source).toContain('validatePlanAdjustmentIntent(rawIntent, options)')
    expect(source.match(/validatePlanAdjustmentIntent\(rawIntent, options\)/g)).toHaveLength(2)
    expect(source).toContain("mode: 'plan_adjustment'")
  })
})
```

- [ ] **Step 2: Run the action regression test and confirm the red state**

Run: `npm test -- src/app/actions/__tests__/structuredPlanAdjustment.test.ts`

Expected: FAIL because the old interpreter and action name are still present.

- [ ] **Step 3: Extract server-owned adjustment options**

Add a private loader to `adjustPlan.ts`:

```ts
async function loadPlanAdjustmentOptions(
  supabase: SupabaseServerClient,
  userId: string,
  planId: string,
): Promise<PlanAdjustmentOptions> {
  const [profileResult, workoutsResult] = await Promise.all([
    (supabase.from('profiles') as any)
      .select('days_per_week, session_duration_minutes, available_equipment, cardio_preferences')
      .eq('id', userId)
      .single(),
    (supabase.from('workouts') as any)
      .select('id')
      .eq('plan_id', planId)
      .eq('user_id', userId),
  ])
  const workoutIds = ((workoutsResult.data ?? []) as Array<{ id: string }>).map(row => row.id)
  const exerciseResult = workoutIds.length
    ? await (supabase.from('workout_exercises') as any)
        .select('exercise:exercises(id, name)')
        .in('workout_id', workoutIds)
    : { data: [] }
  const relationRows = (exerciseResult.data ?? []) as Array<{
    exercise: { id: string; name: string } | Array<{ id: string; name: string }> | null
  }>
  const uniqueExercises = new Map<string, { id: string; name: string }>()
  relationRows.forEach(row => {
    const exercise = Array.isArray(row.exercise) ? row.exercise[0] : row.exercise
    if (exercise) uniqueExercises.set(exercise.id, exercise)
  })
  const profile = profileResult.data as {
    days_per_week: number | null
    session_duration_minutes: number | null
    available_equipment: string[] | null
    cardio_preferences: CardioModality[] | null
  } | null
  return {
    currentDaysPerWeek: profile?.days_per_week ?? 3,
    currentSessionDurationMinutes: profile?.session_duration_minutes ?? 60,
    availableEquipment: profile?.available_equipment ?? [],
    cardioPreferences: profile?.cardio_preferences ?? ['walking'],
    exercises: Array.from(uniqueExercises.values()),
  }
}
```

- [ ] **Step 4: Replace text interpretation with validated preview**

Implement:

```ts
export async function previewStructuredPlanAdjustment(
  planId: string,
  rawIntent: unknown,
): Promise<SuggestPlanAdjustmentResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }
  const plan = await getOwnedActivePlan(supabase, user.id, planId)
  if (!plan) return { success: false, error: 'Plan activo no encontrado' }

  const options = await loadPlanAdjustmentOptions(supabase, user.id, plan.id)
  const intent = validatePlanAdjustmentIntent(rawIntent, options)
  if (!intent) return { success: false, error: 'El ajuste seleccionado no es válido.' }

  const preview = await generatePlan({
    mode: 'plan_adjustment',
    adjustmentIntent: intent,
    previewOnly: true,
  })
  // Return the existing deterministic diff summary and the validated intent.
}
```

Do not call `checkUserRateLimit`, `checkGlobalDailyBudget`, or any AI module in
this weekly action. Leave those calls in `suggestWorkoutAdjustment`, which is
outside this feature.

- [ ] **Step 5: Revalidate apply requests**

Change `applyPlanAdjustment` to accept `rawIntent: unknown`, load server-owned
options, call `validatePlanAdjustmentIntent(rawIntent, options)`, and pass only
the validated result to `generatePlan`.

- [ ] **Step 6: Run the action and domain tests**

Run: `npm test -- src/app/actions/__tests__/structuredPlanAdjustment.test.ts src/lib/plans/__tests__/adjustmentIntent.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the direct engine route**

```bash
git add src/app/actions/adjustPlan.ts src/app/actions/__tests__/structuredPlanAdjustment.test.ts
git commit -m "feat(plan): route structured adjustments to engine"
```

### Task 3: Build the structured dialog

**Files:**
- Modify: `src/components/plan/PlanAdjustButton.tsx`
- Create: `src/components/plan/planAdjustmentForm.ts`
- Create: `src/components/plan/__tests__/planAdjustmentForm.test.ts`
- Create: `src/components/plan/__tests__/planAdjustmentStructure.test.ts`

**Interfaces:**
- Consumes: `PlanAdjustmentOptions`, `CARDIO_MODALITIES`
- Consumes: `previewStructuredPlanAdjustment` and `applyPlanAdjustment`
- Produces: `PlanAdjustmentDraft`
- Produces: `buildPlanAdjustmentIntent(draft: PlanAdjustmentDraft): PlanAdjustmentIntent | null`

- [ ] **Step 1: Write failing form-model tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildPlanAdjustmentIntent } from '../planAdjustmentForm'

describe('buildPlanAdjustmentIntent', () => {
  it.each([
    [{ category: 'days', daysPerWeek: 4 }, { type: 'change_days', daysPerWeek: 4 }],
    [{ category: 'duration', minutes: 45 }, { type: 'change_duration', sessionDurationMinutes: 45 }],
    [{ category: 'intensity', direction: 'easier' }, { type: 'change_intensity', direction: 'easier' }],
    [{ category: 'equipment', equipment: ['bench'] }, { type: 'equipment_unavailable', equipment: ['bench'] }],
    [{ category: 'cardio', cardioPreferences: ['cycling'] }, { type: 'change_cardio_preferences', cardioPreferences: ['cycling'] }],
    [{ category: 'exercise', exerciseId: 'exercise-1' }, { type: 'replace_exercise', exerciseId: 'exercise-1' }],
  ] as const)('builds the selected category intent', (draft, intent) => {
    expect(buildPlanAdjustmentIntent(draft)).toEqual(intent)
  })

  it('requires at least one value for multi-select categories', () => {
    expect(buildPlanAdjustmentIntent({ category: 'equipment', equipment: [] })).toBeNull()
    expect(buildPlanAdjustmentIntent({ category: 'cardio', cardioPreferences: [] })).toBeNull()
  })
})
```

- [ ] **Step 2: Write a failing UI structure regression test**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../PlanAdjustButton.tsx', import.meta.url), 'utf8')

describe('structured plan adjustment dialog', () => {
  it('uses structured controls and direct preview', () => {
    expect(source).toContain("t('Ajustar plan')")
    expect(source).toContain('previewStructuredPlanAdjustment')
    expect(source).not.toContain('<textarea')
    expect(source).not.toContain('suggestPlanAdjustment')
    expect(source).not.toContain('Pedir ajuste al coach para toda la semana')
  })
})
```

- [ ] **Step 3: Run both tests and confirm the red state**

Run: `npm test -- src/components/plan/__tests__/planAdjustmentForm.test.ts src/components/plan/__tests__/planAdjustmentStructure.test.ts`

Expected: FAIL because the form model does not exist and the component still
contains text input and coach copy.

- [ ] **Step 4: Implement the discriminated form model**

Create `planAdjustmentForm.ts`:

```ts
import type { CardioModality, PlanAdjustmentIntent } from '@/lib/training-engine'

export type PlanAdjustmentDraft =
  | { category: 'days'; daysPerWeek: number }
  | { category: 'duration'; minutes: 30 | 45 | 60 | 90 }
  | { category: 'intensity'; direction: 'easier' | 'harder' }
  | { category: 'equipment'; equipment: string[] }
  | { category: 'cardio'; cardioPreferences: CardioModality[] }
  | { category: 'exercise'; exerciseId: string }

export function buildPlanAdjustmentIntent(
  draft: PlanAdjustmentDraft,
): PlanAdjustmentIntent | null {
  switch (draft.category) {
    case 'days':
      return { type: 'change_days', daysPerWeek: draft.daysPerWeek }
    case 'duration':
      return { type: 'change_duration', sessionDurationMinutes: draft.minutes }
    case 'intensity':
      return { type: 'change_intensity', direction: draft.direction }
    case 'equipment':
      return draft.equipment.length
        ? { type: 'equipment_unavailable', equipment: draft.equipment }
        : null
    case 'cardio':
      return draft.cardioPreferences.length
        ? { type: 'change_cardio_preferences', cardioPreferences: draft.cardioPreferences }
        : null
    case 'exercise':
      return draft.exerciseId
        ? { type: 'replace_exercise', exerciseId: draft.exerciseId }
        : null
  }
}
```

- [ ] **Step 5: Replace the dialog body with category controls**

In `PlanAdjustButton.tsx`:

- accept `options: PlanAdjustmentOptions`;
- initialize days and duration from `options`;
- render six category buttons in the same dialog;
- render radio-style buttons for days, duration, and intensity;
- render accessible checkbox buttons for equipment and cardio;
- render a native `select` for an existing exercise;
- disable categories without valid equipment or exercise options;
- build the intent locally and call `previewStructuredPlanAdjustment`;
- preserve deterministic diff, warning, apply, loading, and error states;
- replace `Sparkles` with `SlidersHorizontal`;
- remove `ReadinessReviewDialog` from this weekly flow.

The preview submit button must be disabled when
`buildPlanAdjustmentIntent(draft)` returns `null`.

- [ ] **Step 6: Run component tests**

Run: `npm test -- src/components/plan/__tests__/planAdjustmentForm.test.ts src/components/plan/__tests__/planAdjustmentStructure.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the structured dialog**

```bash
git add src/components/plan/PlanAdjustButton.tsx src/components/plan/planAdjustmentForm.ts src/components/plan/__tests__/planAdjustmentForm.test.ts src/components/plan/__tests__/planAdjustmentStructure.test.ts
git commit -m "feat(plan): add structured adjustment dialog"
```

### Task 4: Supply options and localize the complete flow

**Files:**
- Modify: `src/app/(app)/plan/page.tsx`
- Modify: `src/lib/i18n/index.ts`
- Create: `src/components/plan/__tests__/planAdjustmentLocalization.test.ts`

**Interfaces:**
- Consumes: `PlanAdjustmentOptions`
- Supplies: `<PlanAdjustButton planId={planRaw.id} options={adjustmentOptions} />`

- [ ] **Step 1: Write a failing localization and wiring test**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('../../../app/(app)/plan/page.tsx', import.meta.url), 'utf8')
const component = readFileSync(new URL('../PlanAdjustButton.tsx', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../../../lib/i18n/index.ts', import.meta.url), 'utf8')

describe('plan adjustment localization and wiring', () => {
  it('supplies server-owned adjustment options', () => {
    expect(page).toContain('cardio_preferences')
    expect(page).toContain('options={adjustmentOptions}')
  })

  it('routes visible copy through translation', () => {
    expect(component).toContain("t('Ajustar plan')")
    expect(i18n).toContain("'Ajustar plan': 'Adjust plan'")
    expect(i18n).toContain("'Vista previa del ajuste': 'Adjustment preview'")
  })
})
```

- [ ] **Step 2: Run the wiring test and confirm the red state**

Run: `npm test -- src/components/plan/__tests__/planAdjustmentLocalization.test.ts`

Expected: FAIL because the page does not supply options and the translation
keys do not exist.

- [ ] **Step 3: Build options from data already loaded by the plan page**

Extend `PlanConstraintProfile` and its query with `cardio_preferences`. Build
unique localized plan exercise options from `exerciseRows`. Pass:

```ts
const adjustmentOptions: PlanAdjustmentOptions = {
  currentDaysPerWeek: planRaw.days_per_week ?? workouts.length,
  currentSessionDurationMinutes: constraintProfile?.session_duration_minutes ?? 60,
  availableEquipment: constraintProfile?.available_equipment ?? [],
  cardioPreferences: constraintProfile?.cardio_preferences ?? ['walking'],
  exercises: uniquePlanExercises,
}
```

- [ ] **Step 4: Add Spanish-to-English translation entries**

Add these entries to the translation map, reusing an existing key instead of
duplicating it when one already exists:

```ts
'Ajustar plan': 'Adjust plan',
'Ajustar el plan activo': 'Adjust active plan',
'Elige qué quieres cambiar': 'Choose what you want to change',
'Días por semana': 'Days per week',
'Duración de las sesiones': 'Session duration',
'Intensidad': 'Intensity',
'Equipamiento no disponible': 'Unavailable equipment',
'Cardio preferido': 'Preferred cardio',
'Sustituir ejercicio': 'Replace exercise',
'Más suave': 'Easier',
'Más intensa': 'Harder',
'Selecciona al menos un equipo': 'Select at least one equipment item',
'Selecciona al menos una modalidad': 'Select at least one modality',
'Ejercicio que quieres sustituir': 'Exercise to replace',
'Vista previa del ajuste': 'Adjustment preview',
'Recalculando vista previa…': 'Recalculating preview…',
'Editar ajuste': 'Edit adjustment',
'Aplicar ajuste': 'Apply adjustment',
'Aplicando…': 'Applying…',
'El motor recalculará y validará el plan completo antes de aplicar el cambio.': 'The engine will recalculate and validate the complete plan before applying the change.',
'No hay equipamiento disponible para ajustar.': 'There is no available equipment to adjust.',
'No hay ejercicios en el plan para sustituir.': 'There are no exercises in the plan to replace.',
'Caminar': 'Walking',
'Correr': 'Running',
'Bicicleta': 'Cycling',
'Elíptica': 'Elliptical',
'Remo': 'Rowing',
'Escaleras': 'Stairs',
'Cuerda': 'Jump rope',
```

Keep “Pedir ajuste al coach” because `WorkoutAdjustButton` still uses it.
Remove only the weekly-specific “Pedir ajuste al coach para toda la semana”
entry once it has no consumers.

- [ ] **Step 5: Run wiring, component, and i18n tests**

Run: `npm test -- src/components/plan/__tests__/planAdjustmentLocalization.test.ts src/components/plan/__tests__/planAdjustmentStructure.test.ts src/lib/i18n/__tests__/i18n.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit page wiring and localization**

```bash
git add src/app/\(app\)/plan/page.tsx src/lib/i18n/index.ts src/components/plan/__tests__/planAdjustmentLocalization.test.ts
git commit -m "feat(plan): localize structured adjustment options"
```

### Task 5: Verify behavior and visual quality

**Files:**
- Modify only if verification finds defects in files from Tasks 1–4.

**Interfaces:**
- Verifies all interfaces introduced by Tasks 1–4.

- [ ] **Step 1: Run all focused adjustment tests**

Run:

```bash
npm test -- src/lib/plans/__tests__/adjustmentIntent.test.ts src/lib/ai/__tests__/healthRequest.test.ts src/app/actions/__tests__/structuredPlanAdjustment.test.ts src/components/plan/__tests__/planAdjustmentForm.test.ts src/components/plan/__tests__/planAdjustmentStructure.test.ts src/components/plan/__tests__/planAdjustmentLocalization.test.ts src/lib/training-engine/__tests__/engine.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the complete unit suite**

Run: `npm test`

Expected: PASS with no failed tests.

- [ ] **Step 3: Run static verification**

Run: `npm run type-check`

Expected: exit code 0.

Run: `npm run lint`

Expected: exit code 0, or only pre-existing warnings documented with exact file
and line references.

- [ ] **Step 4: Inspect the production diff for AI leakage**

Run:

```bash
rg -n "generatePlanAdjustmentIntent|Pedir ajuste al coach para toda la semana|<textarea" src/components/plan/PlanAdjustButton.tsx src/app/actions/adjustPlan.ts src/lib
```

Expected: no matches for the deleted interpreter or weekly coach copy; any
remaining textarea must be outside `PlanAdjustButton`.

- [ ] **Step 5: Verify the dialog visually when the local app is available**

Open `/plan` at 390×844 and 1280×800. Confirm:

- the menu action reads “Ajustar plan”;
- the dialog fits without horizontal overflow;
- all six categories are keyboard reachable;
- selected states are visible;
- preview, edit, error, and apply states remain readable;
- the “Regenerar semana” action is unchanged.

- [ ] **Step 6: Commit verification fixes if needed**

If verification required changes:

```bash
git add src/app/actions/adjustPlan.ts src/app/\(app\)/plan/page.tsx src/components/plan/PlanAdjustButton.tsx src/components/plan/planAdjustmentForm.ts src/lib/plans/adjustmentIntent.ts src/lib/i18n/index.ts
git commit -m "fix(plan): address structured adjustment verification"
```

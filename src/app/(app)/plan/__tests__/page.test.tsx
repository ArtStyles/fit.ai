import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAppUserContext: vi.fn(),
}))

vi.mock('@/lib/auth/server', () => ({
  requireAppUserContext: mocks.requireAppUserContext,
}))

vi.mock('@/lib/features/community', () => ({
  isCommunityEnabled: () => false,
}))

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    language: 'es',
    timeZone: 'America/Havana',
    t: (source: string) => source,
  }),
}))

vi.mock('@/app/actions/plan', () => ({
  activatePlan: '/test/activate-plan',
  createManualPlan: '/test/create-plan',
  updatePlanSummary: '/test/update-plan',
}))

vi.mock('@/components/feedback/SubmitButton', () => ({
  SubmitButton: ({ children, label }: { children?: React.ReactNode; label: string }) => (
    <button type="submit">{children ?? label}</button>
  ),
}))

vi.mock('@/components/navigation/PendingLink', () => ({
  PendingLink: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('@/components/navigation/PageTopBar', () => ({
  PageTopBar: ({ title }: { title: string }) => <header>{title}</header>,
}))

vi.mock('@/components/plan/PlanAdjustButton', () => ({
  PlanAdjustButton: () => <button type="button">Ajustar plan</button>,
}))

vi.mock('@/components/plan/PlanRetireButton', () => ({
  PlanRetireButton: () => <button type="button">Retirar plan</button>,
}))

vi.mock('@/components/plan/PlanWorkoutWorkspace', () => ({
  PlanWorkoutWorkspace: () => <div data-plan-workspace />,
}))

vi.mock('@/components/plan/PlanDistribution', () => ({
  PlanDistribution: () => <div data-plan-distribution />,
}))

vi.mock('@/components/social/ShareRoutineButton', () => ({
  ShareRoutineButton: () => <button type="button">Compartir</button>,
}))

import PlanPage from '../page'

type QueryResult = {
  data: unknown
  error: { message: string } | null
}

type CoachingLookupOverrides = {
  relationship?: QueryResult
  trainerProfile?: QueryResult
  assignmentVersion?: QueryResult
  workouts?: QueryResult
  workoutExercises?: QueryResult
}

type PlanFixture = {
  id: string
  name: string
  description: string | null
  goal: string | null
  duration_weeks: number | null
  days_per_week: number | null
  difficulty: string | null
  source_type: 'manual' | 'trainer_assigned'
  prescription_locked: boolean
  trainer_assignment_id: string | null
  trainer_assignment_version_id: string | null
  trainer_relationship_id: string | null
  created_at: string
}

const lockedPlan: PlanFixture = {
  id: 'plan-1',
  name: 'Rutina profesional',
  description: null,
  goal: 'Fuerza',
  duration_weeks: 8,
  days_per_week: 3,
  difficulty: 'intermediate',
  source_type: 'trainer_assigned',
  prescription_locked: true,
  trainer_assignment_id: 'assignment-1',
  trainer_assignment_version_id: 'version-1',
  trainer_relationship_id: 'relationship-1',
  created_at: '2026-09-01T00:00:00.000Z',
}

const completeWorkout = {
  id: 'workout-1',
  name: 'Día A',
  focus: 'Fuerza',
  day_of_week: 1,
  order_in_plan: 0,
  estimated_duration_minutes: 45,
}

const completeWorkoutExercise = {
  id: 'workout-exercise-1',
  workout_id: 'workout-1',
  order_index: 0,
  sets: 3,
  reps: 10,
  rest_seconds: 90,
  weight_kg: null,
  notes: 'Mantener el control',
  target_rpe: 7,
  weight_suggestion_basis: null,
  exercise: {
    id: 'exercise-1',
    name: 'Squat',
    name_es: 'Sentadilla',
    image_url: null,
    muscle_groups: ['quadriceps'],
    muscle_groups_es: ['cuádriceps'],
    equipment: 'barbell',
    equipment_es: 'barra',
    difficulty: 'intermediate',
    exercise_type: 'strength',
    is_compound: true,
  },
}

function createThenableQuery(result: QueryResult) {
  const query: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'is', 'order', 'limit', 'in']) {
    query[method] = vi.fn(() => query)
  }
  query.maybeSingle = vi.fn(() => Promise.resolve(result))
  query.single = vi.fn(() => Promise.resolve(result))
  query.then = (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) => (
    Promise.resolve(result).then(resolve, reject)
  )
  return query
}

function createSupabase(plan: PlanFixture, overrides: CoachingLookupOverrides = {}) {
  const activePlan = { data: plan, error: null }
  const planLibrary = {
    data: [{
      id: plan.id,
      name: plan.name,
      goal: plan.goal,
      days_per_week: plan.days_per_week,
      difficulty: plan.difficulty,
      source_type: plan.source_type,
      prescription_locked: plan.prescription_locked,
      created_at: plan.created_at,
      is_active: true,
    }, ...(plan.prescription_locked ? [{
      id: 'personal-plan-2',
      name: 'Plan personal anterior',
      goal: 'Movilidad',
      days_per_week: 2,
      difficulty: 'beginner',
      source_type: 'manual' as const,
      prescription_locked: false,
      created_at: '2026-08-01T00:00:00.000Z',
      is_active: false,
    }] : [])],
    error: null,
  }
  let workoutPlanCalls = 0

  return {
    from: vi.fn((table: string) => {
      if (table === 'workout_plans') {
        workoutPlanCalls += 1
        return createThenableQuery(workoutPlanCalls === 1 ? activePlan : planLibrary)
      }
      if (table === 'coaching_relationships') {
        return createThenableQuery(overrides.relationship ?? {
          data: { status: 'active', trainer_user_id: 'trainer-1' },
          error: null,
        })
      }
      if (table === 'public_profiles') {
        return createThenableQuery(overrides.trainerProfile ?? {
          data: { full_name: 'Laura Pérez', username: 'laura' },
          error: null,
        })
      }
      if (table === 'trainer_assignment_versions') {
        return createThenableQuery(overrides.assignmentVersion ?? {
          data: { version_number: 7, change_summary: 'Más volumen', assignment_id: 'assignment-1' },
          error: null,
        })
      }
      if (table === 'profiles') {
        return createThenableQuery({ data: null, error: null })
      }
      if (table === 'workouts') {
        return createThenableQuery(overrides.workouts ?? {
          data: plan.prescription_locked ? [completeWorkout] : [],
          error: null,
        })
      }
      if (table === 'workout_exercises') {
        return createThenableQuery(overrides.workoutExercises ?? {
          data: plan.prescription_locked ? [completeWorkoutExercise] : [],
          error: null,
        })
      }
      if (table === 'exercises') {
        return createThenableQuery({ data: [], error: null })
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

async function renderPlan(
  plan: PlanFixture,
  overrides: CoachingLookupOverrides = {},
) {
  const supabase = createSupabase(plan, overrides)
  mocks.requireAppUserContext.mockResolvedValue({
    supabase,
    user: { id: 'user-1' },
    profile: {
      language: 'es',
      timezone: 'America/Havana',
      subscription_tier: 'free',
    },
  })

  return {
    html: renderToStaticMarkup(await PlanPage()),
    supabase,
  }
}

describe('plan coaching metadata projection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the plan switcher read-only when the relationship lookup fails', async () => {
    const { html } = await renderPlan(lockedPlan, {
      relationship: { data: null, error: { message: 'relationship lookup failed' } },
    })

    expect(html).toContain('role="alert"')
    expect(html).toContain('No pudimos verificar la relación con tu entrenador.')
    expect(html).toContain('Biblioteca en solo lectura mientras tu entrenador gestione la rutina activa.')
    expect(html).not.toContain('href="/plans/generate"')
    expect(html).not.toContain('>Usar<')
  })

  it('keeps the plan switcher read-only when the relationship row is missing', async () => {
    const { html } = await renderPlan(lockedPlan, {
      relationship: { data: null, error: null },
    })

    expect(html).toContain('role="alert"')
    expect(html).toContain('No pudimos verificar la relación con tu entrenador.')
    expect(html).toContain('Biblioteca en solo lectura mientras tu entrenador gestione la rutina activa.')
    expect(html).not.toContain('href="/plans/generate"')
    expect(html).not.toContain('>Usar<')
  })

  it('shows a profile lookup error without inventing a trainer name', async () => {
    const { html } = await renderPlan(lockedPlan, {
      trainerProfile: { data: null, error: { message: 'profile lookup failed' } },
    })

    expect(html).toContain('role="alert"')
    expect(html).toContain('No pudimos cargar el nombre de tu entrenador.')
    expect(html).not.toContain('Asignada por<!-- --> ')
    expect(html).not.toContain('>Tu entrenador<')
  })

  it('shows an explicit alert when the trainer profile row is missing', async () => {
    const { html } = await renderPlan(lockedPlan, {
      trainerProfile: { data: null, error: null },
    })

    expect(html).toContain('role="alert"')
    expect(html).toContain('No pudimos cargar el nombre de tu entrenador.')
    expect(html).not.toContain('Asignada por<!-- --> ')
    expect(html).not.toContain('>Tu entrenador<')
  })

  it('keeps the generic trainer label for an existing profile with empty names', async () => {
    const { html } = await renderPlan(lockedPlan, {
      trainerProfile: { data: { full_name: '  ', username: null }, error: null },
    })

    expect(html).toContain('>Tu entrenador</a>')
    expect(html).not.toContain('No pudimos cargar el nombre de tu entrenador.')
  })

  it('shows an assignment version lookup error without inventing a version number', async () => {
    const { html } = await renderPlan(lockedPlan, {
      assignmentVersion: { data: null, error: { message: 'version lookup failed' } },
    })

    expect(html).toContain('role="alert"')
    expect(html).toContain('No pudimos cargar la versión de esta rutina.')
    expect(html).not.toContain('Versión 7')
  })

  it.each([
    ['the version row is missing', { data: null, error: null }],
    ['the version belongs to another assignment', {
      data: { version_number: 9, change_summary: 'Otra rutina', assignment_id: 'assignment-2' },
      error: null,
    }],
  ])('shows an explicit version alert when %s', async (_case, assignmentVersion) => {
    const { html } = await renderPlan(lockedPlan, { assignmentVersion })

    expect(html).toContain('role="alert"')
    expect(html).toContain('No pudimos cargar la versión de esta rutina.')
    expect(html).not.toContain('Versión 9')
  })

  it('preserves the normal editable flow for a personal plan', async () => {
    const personalPlan = {
      ...lockedPlan,
      name: 'Rutina personal',
      source_type: 'manual' as const,
      prescription_locked: false,
      trainer_assignment_id: null,
      trainer_assignment_version_id: null,
      trainer_relationship_id: null,
    }

    const { html, supabase } = await renderPlan(personalPlan)

    expect(html).toContain('href="/plans/generate"')
    expect(html).not.toContain('Biblioteca en solo lectura')
    expect(html).not.toContain('role="alert"')
    expect(supabase.from).not.toHaveBeenCalledWith('coaching_relationships')
    expect(supabase.from).not.toHaveBeenCalledWith('public_profiles')
    expect(supabase.from).not.toHaveBeenCalledWith('trainer_assignment_versions')
  })

  it('does not render prescribed content when the workout lookup fails', async () => {
    const { html } = await renderPlan(lockedPlan, {
      workouts: { data: [], error: { message: 'workouts lookup failed' } },
    })

    expect(html).toContain('role="alert"')
    expect(html).toContain('No pudimos cargar completa la rutina indicada por tu entrenador')
    expect(html).not.toContain('data-plan-workspace')
    expect(html).not.toContain('data-plan-distribution')
  })

  it('does not render a prescribed plan without workouts', async () => {
    const { html } = await renderPlan(lockedPlan, {
      workouts: { data: [], error: null },
    })

    expect(html).toContain('role="alert"')
    expect(html).toContain('No pudimos cargar completa la rutina indicada por tu entrenador')
    expect(html).not.toContain('data-plan-workspace')
    expect(html).not.toContain('data-plan-distribution')
  })

  it('does not render prescribed content when the workout exercise lookup fails', async () => {
    const { html } = await renderPlan(lockedPlan, {
      workouts: {
        data: [{
          id: 'workout-1',
          name: 'Día A',
          focus: 'Fuerza',
          day_of_week: 1,
          order_in_plan: 0,
          estimated_duration_minutes: 45,
        }],
        error: null,
      },
      workoutExercises: { data: [], error: { message: 'workout exercises lookup failed' } },
    })

    expect(html).toContain('role="alert"')
    expect(html).toContain('No pudimos cargar completa la rutina indicada por tu entrenador')
    expect(html).not.toContain('data-plan-workspace')
    expect(html).not.toContain('data-plan-distribution')
  })

  it('does not render prescribed content when a required exercise join is missing', async () => {
    const { html } = await renderPlan(lockedPlan, {
      workouts: {
        data: [{
          id: 'workout-1',
          name: 'Día A',
          focus: 'Fuerza',
          day_of_week: 1,
          order_in_plan: 0,
          estimated_duration_minutes: 45,
        }],
        error: null,
      },
      workoutExercises: {
        data: [{
          id: 'workout-exercise-1',
          workout_id: 'workout-1',
          order_index: 0,
          sets: 3,
          reps: 10,
          rest_seconds: 90,
          weight_kg: null,
          notes: 'Mantener el control',
          target_rpe: 7,
          weight_suggestion_basis: null,
          exercise: null,
        }],
        error: null,
      },
    })

    expect(html).toContain('role="alert"')
    expect(html).toContain('No pudimos cargar completa la rutina indicada por tu entrenador')
    expect(html).not.toContain('data-plan-workspace')
    expect(html).not.toContain('data-plan-distribution')
  })

  it('does not render a prescribed plan when any workout has no exercises', async () => {
    const { html } = await renderPlan(lockedPlan, {
      workouts: {
        data: [
          {
            id: 'workout-1',
            name: 'Día A',
            focus: 'Fuerza',
            day_of_week: 1,
            order_in_plan: 0,
            estimated_duration_minutes: 45,
          },
          {
            id: 'workout-2',
            name: 'Día B',
            focus: 'Piernas',
            day_of_week: 3,
            order_in_plan: 1,
            estimated_duration_minutes: 50,
          },
        ],
        error: null,
      },
      workoutExercises: {
        data: [{
          id: 'workout-exercise-1',
          workout_id: 'workout-1',
          order_index: 0,
          sets: 3,
          reps: 10,
          rest_seconds: 90,
          weight_kg: null,
          notes: 'Mantener el control',
          target_rpe: 7,
          weight_suggestion_basis: null,
          exercise: {
            id: 'exercise-1',
            name: 'Squat',
            name_es: 'Sentadilla',
            image_url: null,
            muscle_groups: ['quadriceps'],
            muscle_groups_es: ['cuádriceps'],
            equipment: 'barbell',
            equipment_es: 'barra',
            difficulty: 'intermediate',
            exercise_type: 'strength',
            is_compound: true,
          },
        }],
        error: null,
      },
    })

    expect(html).toContain('role="alert"')
    expect(html).toContain('No pudimos cargar completa la rutina indicada por tu entrenador')
    expect(html).not.toContain('data-plan-workspace')
    expect(html).not.toContain('data-plan-distribution')
  })
})

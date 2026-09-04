import { createElement, type ComponentProps, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PlanOverview } from '../PlanOverview'
import { PlanWorkoutReadView } from '../PlanWorkoutReadView'

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    t: (source: string, values?: Record<string, string | number>) => source.replace(
      /\{(version|minutes|seconds)\}/g,
      (_match, key: string) => String(values?.[key] ?? `{${key}}`),
    ),
  }),
}))

vi.mock('@/components/exercises/ExerciseImage', () => ({
  ExerciseImage: () => <span data-testid="exercise-image" />,
}))

vi.mock('@/components/navigation/PendingLink', () => ({
  PendingLink: ({ children }: { children: ReactNode }) => <a href="/session/workout">{children}</a>,
}))

const overviewProps: ComponentProps<typeof PlanOverview> = {
  name: 'Plan de fuerza',
  sourceLabel: 'Asignada por entrenador',
  daysPerWeek: 3,
  durationMinutes: 60,
  difficultyLabel: 'Intermedio',
  constraintLabels: [],
  switcher: null,
  prescriptionLocked: true,
  professionalVersionNumber: 2,
  professionalChangeSummary: 'Subimos el volumen de tirón.',
  professionalTrainerName: 'Ada Entrenadora',
}

const readViewProps: ComponentProps<typeof PlanWorkoutReadView> = {
  summary: {
    id: 'workout', name: 'Día A', focus: null, dayOfWeek: 1, orderInPlan: 1,
    durationMinutes: 60, exerciseCount: 1, isScheduled: true,
  },
  exercises: [{
    id: 'row', workout_id: 'workout', order_index: 1, sets: 3, reps: 8,
    rest_seconds: 90, weight_kg: null, notes: 'Controla la bajada.', target_rpe: 7,
    weight_suggestion_basis: null,
    exercise: { id: 'squat', name: 'Sentadilla', image_url: null, muscle_groups: [], equipment: [], difficulty: null, exercise_type: null, is_compound: true },
  }],
  isToday: false,
}

describe('professional plan prescription presentation', () => {
  it('renders the assigning trainer as a coaching link while retaining version and summary', () => {
    const html = renderToStaticMarkup(<PlanOverview {...overviewProps} />)

    expect(html).toContain('Versión 2')
    expect(html).toContain('Subimos el volumen de tirón.')
    expect(html).toContain('Ada Entrenadora')
    expect(html).toContain('href="/coaching"')
  })

  it('renders a locked trainer indication separately from the target RPE', () => {
    const html = renderToStaticMarkup(createElement(PlanWorkoutReadView, { ...readViewProps, prescriptionLocked: true } as any))

    expect(html).toContain('RPE 7')
    expect(html).toContain('Indicación del entrenador:')
    expect(html).toContain('Controla la bajada.')
  })

  it('keeps the same note generic for an unlocked plan', () => {
    const html = renderToStaticMarkup(createElement(PlanWorkoutReadView, { ...readViewProps, prescriptionLocked: false } as any))

    expect(html).toContain('Notas:')
    expect(html).toContain('Controla la bajada.')
    expect(html).not.toContain('Indicación del entrenador')
  })
})

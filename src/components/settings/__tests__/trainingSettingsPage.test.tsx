import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'

type TrainingProfile = {
  fitness_level: string | null
  primary_goal: string | null
  days_per_week: number | null
  session_duration_minutes: number | null
  gym_type: string | null
  available_equipment: string[] | null
  injuries: string | null
  preferred_workout_days: number[] | null
  readiness_status: string | null
}

const defaultProfile: TrainingProfile = {
  fitness_level: 'intermediate',
  primary_goal: 'build_muscle',
  days_per_week: 3,
  session_duration_minutes: 60,
  gym_type: 'full_gym',
  available_equipment: ['dumbbells'],
  injuries: null,
  preferred_workout_days: [1, 3, 5],
  readiness_status: 'cleared',
}

let profile: TrainingProfile = defaultProfile
let hasActivePlan = false
let profileError: { message: string } | null = null
let activePlanError: { message: string } | null = null
const selectCalls: Array<{ table: string; columns: string }> = []

vi.mock('react-dom', async importOriginal => {
  const reactDom = await importOriginal<typeof import('react-dom')>()
  return {
    ...reactDom,
    useFormState: () => [{ ok: false, message: null, formError: null, fieldErrors: {} }, vi.fn()],
    useFormStatus: () => ({ pending: false }),
  }
})

vi.mock('next/navigation', async importOriginal => ({
  ...await importOriginal<typeof import('next/navigation')>(),
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/lib/auth/server', () => ({
  requireAppUserContext: async () => ({
    user: { id: 'user-1' },
    profile: { language: 'es' },
    supabase: {
      from: (table: string) => {
        const filters = {
          select(columns: string) {
            selectCalls.push({ table, columns })
            return filters
          },
          eq: () => filters,
          limit: () => filters,
          single: async () => ({ data: profileError ? null : profile, error: profileError }),
          maybeSingle: async () => ({ data: activePlanError ? null : hasActivePlan ? { id: 'plan-1' } : null, error: activePlanError }),
        }
        return filters
      },
    },
  }),
}))

function mockTrainingProfile(overrides: Partial<TrainingProfile>) {
  profile = { ...defaultProfile, ...overrides }
}

async function renderTrainingSettings() {
  const TrainingSettingsPage = (await import('@/app/(app)/settings/entrenamiento/page')).default
  return renderToStaticMarkup(
    <I18nProvider language="es" syncDocumentLanguage={false}>
      {await TrainingSettingsPage()}
    </I18nProvider>,
  )
}

describe('TrainingSettingsPage', () => {
  afterEach(() => {
    profile = defaultProfile
    hasActivePlan = false
    profileError = null
    activePlanError = null
    selectCalls.length = 0
  })

  it('drops unknown legacy equipment without crashing', async () => {
    mockTrainingProfile({
      fitness_level: 'advanced', primary_goal: 'build_muscle',
      days_per_week: 3, session_duration_minutes: 60, gym_type: 'full_gym',
      available_equipment: ['dumbbells', 'legacy_machine'],
      injuries: null, preferred_workout_days: [1, 3, 5],
      readiness_status: 'cleared',
    })

    const html = await renderTrainingSettings()

    expect(html).toContain('Mancuernas')
    expect(html).not.toContain('legacy_machine')
  })

  it('renders an invalid legacy day schedule but requires correction before save', async () => {
    mockTrainingProfile({ days_per_week: 3, preferred_workout_days: [1, 2, 3, 4] })

    const html = await renderTrainingSettings()

    expect(html).toContain('Quita 1 día para continuar.')
    expect(html).toContain('disabled')
  })

  it('canonicalizes duplicate legacy days before the form validates their count', async () => {
    mockTrainingProfile({ days_per_week: 3, preferred_workout_days: [1, 1, 3] })

    const html = await renderTrainingSettings()

    expect(html.match(/name="preferredWorkoutDays"/g)).toHaveLength(2)
    expect(html).toContain('Elige 1 ')
    expect(html).toContain('disabled')
  })

  it.each(['profile', 'active plan'] as const)('renders a localized retry state instead of defaults when the %s read fails', async source => {
    if (source === 'profile') profileError = { message: 'profile unavailable' }
    else activePlanError = { message: 'plan unavailable' }

    const html = await renderTrainingSettings()

    expect(html).toContain('No se pudo cargar esta vista')
    expect(html).toContain('Tus datos siguen guardados. Intenta nuevamente.')
    expect(html).toContain('Reintentar')
    expect(html).toContain('aria-label="Reintentar carga de entrenamiento"')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('Perder peso')
  })

  it('uses only the profile fields needed by the form and an id-only active-plan lookup', async () => {
    hasActivePlan = true

    const html = await renderTrainingSettings()

    expect(selectCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'profiles',
        columns: expect.stringContaining('readiness_status'),
      }),
      { table: 'workout_plans', columns: 'id' },
    ]))
    expect(selectCalls.find(call => call.table === 'profiles')?.columns).not.toContain('*')
    expect(html).toContain('href="/plan"')
  })

  it('normalizes incomplete values and keeps home-without-equipment empty', async () => {
    mockTrainingProfile({
      fitness_level: 'legacy', primary_goal: null, days_per_week: null,
      session_duration_minutes: null, gym_type: 'home_no_equipment',
      available_equipment: ['dumbbells'], readiness_status: null,
    })

    const html = await renderTrainingSettings()

    expect(html).toContain('Perder peso')
    expect(html).not.toContain('Mancuernas')
    expect(html).toContain('Completa tu información de preparación')
  })
})

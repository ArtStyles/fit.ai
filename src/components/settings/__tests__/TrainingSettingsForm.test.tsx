import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { createTranslator } from '@/lib/i18n'
import type { TrainingSettingsValue } from '@/lib/profile/trainingPreferences'
import { TrainingSettingsForm, daySelectionMessage } from '../TrainingSettingsForm'

vi.mock('react-dom', async importOriginal => {
  const reactDom = await importOriginal<typeof import('react-dom')>()
  return {
    ...reactDom,
    useFormState: () => [{ ok: false, message: null, formError: null, fieldErrors: {} }, vi.fn()],
    useFormStatus: () => ({ pending: false }),
  }
})

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

function renderWithProviders(element: React.ReactElement) {
  return renderToStaticMarkup(
    <I18nProvider language="es" syncDocumentLanguage={false}>
      {element}
    </I18nProvider>,
  )
}

describe('TrainingSettingsForm', () => {
  it('renders canonical equipment controls instead of CSV text', () => {
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

  it('submits one hidden value per selected day and equipment item', () => {
    const html = renderWithProviders(
      <TrainingSettingsForm initial={initial} readinessStatus="modified" hasActivePlan={false} />,
    )

    expect(html.match(/name="preferredWorkoutDays"/g)).toHaveLength(5)
    expect(html.match(/name="availableEquipment"/g)).toHaveLength(2)
  })

  it('omits equipment controls for bodyweight-only training', () => {
    const html = renderWithProviders(
      <TrainingSettingsForm
        initial={{ ...initial, gymType: 'home_no_equipment', availableEquipment: ['dumbbells'] }}
        readinessStatus="pending"
        hasActivePlan={false}
      />,
    )

    expect(html).not.toContain('Mancuernas')
    expect(html).not.toContain('name="availableEquipment"')
  })

  it('explains that saving does not rewrite the active plan', () => {
    const html = renderWithProviders(
      <TrainingSettingsForm initial={initial} readinessStatus="cleared" hasActivePlan />,
    )

    expect(html).toContain('no cambia automáticamente tu plan activo')
    expect(html).toContain('href="/plan"')
  })
})

describe('daySelectionMessage', () => {
  it('states how many days to remove or add before saving', () => {
    const t = createTranslator('es')

    expect(daySelectionMessage(5, [1, 2, 3, 4, 5, 6], t)).toBe('Quita 1 día para continuar.')
    expect(daySelectionMessage(5, [1, 2, 3], t)).toBe('Elige 2 días más para continuar.')
  })
})

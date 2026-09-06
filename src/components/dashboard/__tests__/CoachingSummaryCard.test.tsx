import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  CoachingSummaryCard,
  getCoachingSummaryDisplayState,
  type CoachingSummaryDisplayState,
} from '../CoachingSummaryCard'
import type { ClientCoachingSummary } from '@/lib/coaching/clientSummary'

const cases: Array<{
  name: string
  expectedState: CoachingSummaryDisplayState
  expectedLabel: string
  expectedCta: string
  summary: ClientCoachingSummary
}> = [
  {
    name: 'prioritizes a paused relationship over consent and assignment state',
    expectedState: 'paused',
    expectedLabel: 'Acompañamiento pausado',
    expectedCta: 'Revisar acompañamiento',
    summary: {
      relationshipId: 'relationship-paused',
      relationshipStatus: 'paused_by_platform',
      trainerUserId: 'trainer-paused',
      trainerName: 'Ada Pausa',
      trainerAvatarUrl: 'https://example.com/ada-pausa.jpg',
      trainerSlug: 'ada-pausa',
      serviceId: 'service-paused',
      serviceName: 'Fuerza profesional',
      startedAt: '2026-09-01T10:00:00.000Z',
      trainingConsentActive: false,
      assignmentStatus: 'proposed',
    },
  },
  {
    name: 'prioritizes missing consent over a pending proposal',
    expectedState: 'needs_consent',
    expectedLabel: 'Falta autorizar tus datos de entrenamiento',
    expectedCta: 'Completar autorización',
    summary: {
      relationshipId: 'relationship-consent',
      relationshipStatus: 'active',
      trainerUserId: 'trainer-consent',
      trainerName: 'Bruno Consentimiento',
      trainerAvatarUrl: null,
      trainerSlug: 'bruno-consentimiento',
      serviceId: 'service-consent',
      serviceName: 'Movilidad guiada',
      startedAt: '2026-09-02T10:00:00.000Z',
      trainingConsentActive: false,
      assignmentStatus: 'proposed',
    },
  },
  {
    name: 'shows a proposed assignment as pending review',
    expectedState: 'proposal_pending',
    expectedLabel: 'Rutina pendiente de revisión',
    expectedCta: 'Revisar rutina',
    summary: {
      relationshipId: 'relationship-proposal',
      relationshipStatus: 'active',
      trainerUserId: 'trainer-proposal',
      trainerName: 'Carla Propuesta',
      trainerAvatarUrl: 'https://example.com/carla.jpg',
      trainerSlug: 'carla-propuesta',
      serviceId: 'service-proposal',
      serviceName: 'Rendimiento deportivo',
      startedAt: '2026-09-03T10:00:00.000Z',
      trainingConsentActive: true,
      assignmentStatus: 'proposed',
    },
  },
  {
    name: 'shows an active trainer plan',
    expectedState: 'active_plan',
    expectedLabel: 'Rutina activa con tu entrenador',
    expectedCta: 'Ver acompañamiento',
    summary: {
      relationshipId: 'relationship-active',
      relationshipStatus: 'active',
      trainerUserId: 'trainer-active',
      trainerName: 'Diego Activo',
      trainerAvatarUrl: null,
      trainerSlug: 'diego-activo',
      serviceId: 'service-active',
      serviceName: 'Hipertrofia avanzada',
      startedAt: '2026-09-04T10:00:00.000Z',
      trainingConsentActive: true,
      assignmentStatus: 'active',
    },
  },
  {
    name: 'shows that an active trainer without an assignment is preparing the next step',
    expectedState: 'awaiting_routine',
    expectedLabel: 'Tu entrenador está preparando el siguiente paso',
    expectedCta: 'Ver acompañamiento',
    summary: {
      relationshipId: 'relationship-awaiting',
      relationshipStatus: 'active',
      trainerUserId: 'trainer-awaiting',
      trainerName: 'Elena Preparación',
      trainerAvatarUrl: 'https://example.com/elena.jpg',
      trainerSlug: 'elena-preparacion',
      serviceId: 'service-awaiting',
      serviceName: 'Acompañamiento integral',
      startedAt: '2026-09-05T10:00:00.000Z',
      trainingConsentActive: true,
      assignmentStatus: null,
    },
  },
]

describe('CoachingSummaryCard', () => {
  it.each(cases)('$name', ({ expectedState, expectedLabel, expectedCta, summary }) => {
    const html = renderToStaticMarkup(<CoachingSummaryCard summary={summary} />)

    expect(getCoachingSummaryDisplayState(summary)).toBe(expectedState)
    expect(html).toContain(expectedLabel)
    expect(html).toContain(summary.trainerName)
    expect(html).toContain(summary.serviceName)
    expect(html).toContain('href="/coaching"')
    expect(html).toContain(`>${expectedCta}</a>`)
  })

  it('renders the visible coaching section label', () => {
    const html = renderToStaticMarkup(<CoachingSummaryCard summary={cases[0].summary} />)

    expect(html).toContain('>Tu acompañamiento</p>')
    expect(html).not.toContain('sr-only">Tu acompañamiento')
  })
})

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireActiveTrainerContext } = vi.hoisted(() => ({
  requireActiveTrainerContext: vi.fn().mockResolvedValue({
    user: { id: 'trainer-user-1' },
    profile: { language: 'es' },
    trainerProfile: { id: 'trainer-profile-1', status: 'active' },
  }),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/coaching/access', () => ({ requireActiveTrainerContext }))
vi.mock('@/app/actions/trainerProfile', () => ({ updateTrainerProfile: vi.fn() }))

describe('professional workspace routes', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ['../page', 'Resumen profesional'],
    ['../clients/page', 'Todavía no tienes clientes'],
    ['../programs/page', 'Todavía no tienes rutinas'],
    ['../requests/page', 'No hay solicitudes nuevas'],
  ] as const)('guards %s and renders its real empty state', async (modulePath, expectedText) => {
    const Page = (await import(modulePath)).default

    const html = renderToStaticMarkup(await Page())

    expect(requireActiveTrainerContext).toHaveBeenCalledTimes(1)
    expect(html).toContain(expectedText)
    expect(html).not.toMatch(/cliente de ejemplo|solicitud de ejemplo|rutina de ejemplo/i)
  })

  it('guards the profile route before loading its owner-visible pending review', async () => {
    const order: string[] = []
    const pending = {
      id: 'review-1',
      status: 'submitted',
      application_kind: 'profile_update',
      professional_name: 'Ada Propuesta',
      specialties: ['Movilidad'],
      modalities: ['hybrid'],
      experience_summary: 'Experiencia propuesta pendiente de revisión.',
    }
    const maybeSingle = vi.fn(async () => ({ data: pending, error: null }))
    const query = {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => ({
              order: vi.fn(() => ({ maybeSingle })),
            })),
          })),
        })),
      })),
    }
    const from = vi.fn(() => {
      order.push('query')
      return query
    })
    requireActiveTrainerContext.mockImplementationOnce(async () => {
      order.push('guard')
      return {
        user: { id: 'trainer-user-1' },
        profile: { language: 'es' },
        supabase: { from },
        trainerProfile: {
          id: 'trainer-profile-1',
          professional_name: 'Ada Aprobada',
          professional_photo_url: 'https://cdn.example.test/ada.jpg',
          bio: 'Entrenadora de fuerza con un enfoque progresivo, seguro y adaptado a cada persona.',
          specialties: ['Fuerza'],
          modalities: ['online'],
          experience_summary: 'Ocho anos de experiencia profesional aprobada.',
          general_location: 'La Habana',
          languages: ['Espanol'],
          status: 'active',
        },
      }
    })
    const Page = (await import('../profile/page')).default

    const html = renderToStaticMarkup(await Page())

    expect(order).toEqual(['guard', 'query'])
    expect(html).toContain('Ada Aprobada')
    expect(html).toContain('Ada Propuesta')
  })

  it('keeps the professional summary within the coach workspace', async () => {
    const Page = (await import('../page')).default

    const html = renderToStaticMarkup(await Page())

    expect(html).not.toContain('href="/dashboard"')
  })
})

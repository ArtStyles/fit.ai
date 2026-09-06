import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAppUserContext: vi.fn(),
  getTrainerDirectory: vi.fn(),
  normalizeDirectoryFilters: vi.fn(),
  loadClientCoachingSummary: vi.fn(),
}))

vi.mock('@/lib/auth/server', () => ({ requireAppUserContext: mocks.requireAppUserContext }))
vi.mock('@/lib/coaching/directory', () => ({
  getTrainerDirectory: mocks.getTrainerDirectory,
  normalizeDirectoryFilters: mocks.normalizeDirectoryFilters,
}))
vi.mock('@/lib/coaching/clientSummary', () => ({ loadClientCoachingSummary: mocks.loadClientCoachingSummary }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import TrainersPage from '../page'

describe('TrainersPage', () => {
  it('loads the authenticated client summary and projects it into the real trainer directory', async () => {
    const supabase = { from: vi.fn() }
    mocks.requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    mocks.normalizeDirectoryFilters.mockReturnValue({})
    mocks.getTrainerDirectory.mockResolvedValue({
      trainers: [{
        userId: 'trainer-1', slug: 'ada-lovelace', professionalName: 'Ada Lovelace', professionalPhotoUrl: null,
        bio: 'Entrenadora de fuerza.', specialties: ['Fuerza'], modalities: ['online'], experienceSummary: 'Ocho años de experiencia.',
        generalLocation: 'La Habana', languages: ['Español'], verifiedAt: '2026-09-01T00:00:00.000Z', services: [],
      }],
      nextCursor: null,
      error: null,
    })
    mocks.loadClientCoachingSummary.mockResolvedValue({
      summary: {
        relationshipId: 'relationship-1', relationshipStatus: 'active', trainerUserId: 'trainer-1', trainerName: 'Ada Lovelace',
        trainerAvatarUrl: null, trainerSlug: 'ada-lovelace', serviceId: 'service-1', serviceName: 'Acompañamiento de fuerza',
        startedAt: '2026-09-01T10:00:00.000Z', trainingConsentActive: true, assignmentStatus: 'active',
      },
      error: null,
    })

    const html = renderToStaticMarkup(await TrainersPage({ searchParams: {} }))

    expect(mocks.loadClientCoachingSummary).toHaveBeenCalledWith(supabase, 'client-1')
    expect(html).toContain('Tu entrenador')
    expect(html).toContain('href="/coaching"')
  })
})

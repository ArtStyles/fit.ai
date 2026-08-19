import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import AdminTrainerApplicationPage from '../page'

const APPLICATION_ID = '11111111-1111-4111-8111-111111111111'
const { getApplicationMock, notFoundMock } = vi.hoisted(() => ({
  getApplicationMock: vi.fn(),
  notFoundMock: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))

vi.mock('next/navigation', async importOriginal => ({
  ...await importOriginal<typeof import('next/navigation')>(),
  notFound: notFoundMock,
}))
vi.mock('@/lib/auth/adminTrainers', () => ({
  getAdminTrainerApplication: getApplicationMock,
}))
vi.mock('@/lib/auth/server', () => ({
  requireAppUserContext: async () => ({ profile: { timezone: 'America/Havana' } }),
}))
vi.mock('@/lib/workouts/schedule', () => ({
  resolveUserTimeZone: () => 'America/Havana',
}))

// The client-heavy review body has exhaustive real-component coverage in
// trainerApplicationReview.test.tsx; this route test keeps the header and
// notFound branches real.
vi.mock('@/components/admin/TrainerApplicationReview', () => ({
  TrainerApplicationReview: () => <div>Revisión del expediente</div>,
}))

beforeEach(() => vi.clearAllMocks())

it('renders the private record with the route-local return link', async () => {
  getApplicationMock.mockResolvedValue({ professionalName: 'Ada Entrenadora' })

  const detailHtml = renderToStaticMarkup(
    await AdminTrainerApplicationPage({ params: { applicationId: APPLICATION_ID } }),
  )

  expect(detailHtml).toContain('Entrenadores')
  expect(detailHtml).toContain('Expediente privado')
  expect(detailHtml).toContain('Ada Entrenadora')
  expect(detailHtml).toContain('href="/admin/trainers"')
  expect(detailHtml).toContain('Volver a entrenadores')
})

it('preserves notFound for an unknown application', async () => {
  getApplicationMock.mockResolvedValue(null)

  await expect(AdminTrainerApplicationPage({ params: { applicationId: APPLICATION_ID } }))
    .rejects.toThrow('NEXT_NOT_FOUND')
  expect(notFoundMock).toHaveBeenCalledOnce()
})

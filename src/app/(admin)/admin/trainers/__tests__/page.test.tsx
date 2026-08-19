import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { AdminTrainerQueueItem } from '@/lib/auth/adminTrainers'
import AdminTrainersPage from '../page'

const APPLICATION_ID = '11111111-1111-4111-8111-111111111111'
const { listApplicationsMock } = vi.hoisted(() => ({
  listApplicationsMock: vi.fn(),
}))

vi.mock('react-dom', async importOriginal => ({
  ...await importOriginal<typeof import('react-dom')>(),
  useFormStatus: () => ({ pending: false }),
}))
vi.mock('@/lib/auth/adminTrainers', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/auth/adminTrainers')>(),
  listAdminTrainerApplications: listApplicationsMock,
}))
vi.mock('@/lib/auth/server', () => ({
  requireAppUserContext: async () => ({ profile: { timezone: 'America/Havana' } }),
}))
vi.mock('@/lib/workouts/schedule', () => ({
  resolveUserTimeZone: () => 'America/Havana',
}))

const application: AdminTrainerQueueItem = {
  id: APPLICATION_ID,
  professionalName: 'Ada Entrenadora',
  applicationDate: '2026-08-07T14:00:00.000Z',
  status: 'submitted',
  specialties: ['Fuerza', 'Movilidad'],
  applicationKind: 'initial',
}

it('keeps the real trainer queue inside its feature route', async () => {
  listApplicationsMock.mockResolvedValue([application])

  const queueHtml = renderToStaticMarkup(
    await AdminTrainersPage({ searchParams: { status: 'submitted' } }),
  )

  expect(queueHtml).toContain('Operaciones')
  expect(queueHtml).toContain('Cola de verificación profesional')
  expect(queueHtml).toContain('<option value="submitted" selected="">Enviada</option>')
  expect(queueHtml).toContain('1 solicitud en la cola')
  expect(queueHtml).toContain(`href="/admin/trainers/${APPLICATION_ID}"`)
  expect(queueHtml).toContain('min-h-11')
})

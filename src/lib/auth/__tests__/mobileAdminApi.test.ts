import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), users: vi.fn(), banner: vi.fn(), overview: vi.fn(),
  trainers: vi.fn(), detail: vi.fn(), count: vi.fn(),
  subscription: vi.fn(), suspend: vi.fn(), reactivate: vi.fn(), saveBanner: vi.fn(),
  start: vi.fn(), changes: vi.fn(), approve: vi.fn(), reject: vi.fn(),
  reinstate: vi.fn(), schedule: vi.fn(), outcome: vi.fn(),
}))

vi.mock('@/lib/mobile-api/http', async importActual => ({
  ...await importActual<typeof import('@/lib/mobile-api/http')>(),
  MobileApiError: class extends Error {
    constructor(public status: number, public code: string, message = code) { super(message) }
  },
  handleMobileApi: async (_request: Request, run: (context: unknown) => Promise<unknown>) => {
    try { return Response.json({ ok: true, data: await run({ user: { id: 'verified-admin' } }) }) }
    catch (error) {
      const failure = error as { status?: number; code?: string }
      return Response.json({ ok: false, error: { code: failure.code ?? 'forbidden' } }, { status: failure.status ?? 403 })
    }
  },
  mobileApiOptions: () => new Response(null, { status: 204 }),
}))
vi.mock('@/lib/auth/admin', () => ({
  requireAdminUserContext: mocks.requireAdmin, loadAdminUsers: mocks.users,
  loadAdminDashboardBanner: mocks.banner,
}))
vi.mock('@/lib/auth/adminOverview', () => ({ getAdminOverviewData: mocks.overview }))
vi.mock('@/lib/auth/adminTrainers', () => ({
  loadAdminTrainerApplications: mocks.trainers, getAdminTrainerApplication: mocks.detail,
  countAdminTrainerApplicationsRequiringAttention: mocks.count,
}))
vi.mock('@/app/actions/admin', () => ({
  setUserSubscription: mocks.subscription, suspendUser: mocks.suspend, reactivateUser: mocks.reactivate,
}))
vi.mock('@/app/actions/dashboardBanner', () => ({ saveDashboardBanner: mocks.saveBanner }))
vi.mock('@/app/actions/adminTrainers', () => ({
  startTrainerReview: mocks.start, requestTrainerChanges: mocks.changes,
  approveTrainerApplication: mocks.approve, rejectTrainerApplication: mocks.reject,
  reinstateTrainerProfile: mocks.reinstate, scheduleTrainerInterview: mocks.schedule,
  recordTrainerInterviewOutcome: mocks.outcome,
}))

import { POST } from '@/app/api/mobile/admin/route'

const service = { privateService: true }
const request = (payload: Record<string, unknown> | FormData) => new Request('https://vekira.test/api/mobile/admin', {
  method: 'POST',
  ...(payload instanceof FormData ? { body: payload } : {
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  }),
})

beforeEach(() => {
  vi.resetAllMocks()
  mocks.requireAdmin.mockResolvedValue({ user: { id: 'verified-admin', email: 'admin@example.test' }, service })
  mocks.count.mockResolvedValue(4)
  mocks.users.mockResolvedValue({ users: [], suspensionEnabled: true })
})

describe('mobile administration authorization and dispatch', () => {
  it.each([
    'shell', 'users', 'banner', 'overview', 'trainers', 'trainer-detail',
    'setUserSubscription', 'suspendUser', 'reactivateUser', 'saveDashboardBanner',
    'startTrainerReview', 'requestTrainerChanges', 'approveTrainerApplication',
    'rejectTrainerApplication', 'reinstateTrainerProfile', 'scheduleTrainerInterview',
    'recordTrainerInterviewOutcome',
  ])('rejects non-admin %s before any privileged loader or mutation', async operation => {
    mocks.requireAdmin.mockRejectedValue(new Error('Forbidden'))
    const response = await POST(request({ operation, userId: 'pretend-admin', applicationId: 'private-file' }))
    expect(response.status).toBe(403)
    for (const [name, fn] of Object.entries(mocks)) {
      if (name !== 'requireAdmin') expect(fn).not.toHaveBeenCalled()
    }
  })

  it('returns only the authorized shell identity and count, never the service context', async () => {
    const response = await POST(request({ operation: 'shell', userId: 'pretend-admin' }))
    expect(await response.json()).toEqual({ ok: true, data: { adminLabel: 'admin@example.test', pendingTrainerCount: 4 } })
    expect(mocks.count).toHaveBeenCalledWith(service)
  })

  it('loads accounts through the server context and ignores caller identity', async () => {
    await POST(request({ operation: 'users', userId: 'pretend-admin' }))
    expect(mocks.users).toHaveBeenCalledWith(service)
  })

  it('loads credential links only through the already protected application detail loader', async () => {
    mocks.detail.mockResolvedValue({ id: 'application', credentials: [{ url: 'https://signed.example.test/document' }] })
    const response = await POST(request({ operation: 'trainer-detail', applicationId: 'application' }))
    expect(mocks.detail).toHaveBeenCalledWith('application')
    expect(await response.json()).toMatchObject({ ok: true, data: { credentials: [{ url: 'https://signed.example.test/document' }] } })
  })

  it('forwards multipart image bytes intact to the established banner action', async () => {
    const form = new FormData()
    form.set('operation', 'saveDashboardBanner')
    form.set('title', 'Programa semanal')
    form.set('image', new File(['image-content'], 'banner.png', { type: 'image/png' }))
    await POST(request(form))
    const sent = mocks.saveBanner.mock.calls[0][0] as FormData
    expect(sent.get('title')).toBe('Programa semanal')
    expect(await (sent.get('image') as File).text()).toBe('image-content')
    expect(sent.has('operation')).toBe(false)
  })

  it('requires multipart for mutations and rejects arbitrary function names', async () => {
    expect((await POST(request({ operation: 'suspendUser' }))).status).toBe(400)
    expect((await POST(request({ operation: 'createServiceClient' }))).status).toBe(400)
    expect((await POST(request({ operation: 'constructor' }))).status).toBe(400)
    expect(mocks.suspend).not.toHaveBeenCalled()
  })

  it('uses the server clock for the overview instead of a submitted date', async () => {
    await POST(request({ operation: 'overview', timeZone: 'America/Havana', now: '1900-01-01T00:00:00Z' }))
    expect(mocks.overview).toHaveBeenCalledWith({ timeZone: 'America/Havana', now: expect.any(String) })
    expect(mocks.overview.mock.calls[0][0].now).not.toBe('1900-01-01T00:00:00Z')
  })
})

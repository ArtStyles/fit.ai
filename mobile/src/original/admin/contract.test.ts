import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../mobile-api', () => ({ mobileApi: vi.fn() }))
vi.mock('../router', () => ({
  refresh: vi.fn(), navigate: vi.fn(),
  RouteRedirect: class extends Error { constructor(public href: string) { super(href) } },
}))

import { mobileApi } from '../mobile-api'
import { refresh, navigate, RouteRedirect } from '../router'
import { listAdminUsers, getAdminDashboardBanner, getAdminShellData } from './auth'
import { getAdminOverviewData } from './overview'
import { listAdminTrainerApplications, getAdminTrainerApplication, normalizeAdminTrainerStatus } from './trainers'
import { setUserSubscription } from './actions'
import { saveDashboardBanner } from './banner-actions'
import { approveTrainerApplication } from './trainer-actions'

beforeEach(() => vi.resetAllMocks())

describe('original administration screens use the authenticated mobile API', () => {
  it('fetches private data without sending an actor identity or caching it in the account store', async () => {
    vi.mocked(mobileApi).mockResolvedValue({ users: [] })
    await listAdminUsers(); await getAdminDashboardBanner(); await getAdminShellData()
    await getAdminOverviewData({ timeZone: 'America/Havana', now: '2026-01-01T00:00:00Z' })
    await listAdminTrainerApplications('under_review')
    await getAdminTrainerApplication('application')
    expect(vi.mocked(mobileApi).mock.calls).toEqual([
      ['/api/mobile/admin', { operation: 'users' }],
      ['/api/mobile/admin', { operation: 'banner' }],
      ['/api/mobile/admin', { operation: 'shell' }],
      ['/api/mobile/admin', { operation: 'overview', timeZone: 'America/Havana' }],
      ['/api/mobile/admin', { operation: 'trainers', status: 'under_review' }],
      ['/api/mobile/admin', { operation: 'trainer-detail', applicationId: 'application' }],
    ])
  })

  it('preserves application validation feedback and refreshes only a confirmed decision', async () => {
    const form = new FormData(); form.set('applicationId', 'application')
    const invalid = { ok: false, error: 'Revisa la nota', fieldErrors: { publicNote: 'Obligatoria' } }
    vi.mocked(mobileApi).mockResolvedValueOnce(invalid)
    expect(await approveTrainerApplication(form)).toEqual(invalid)
    expect(refresh).not.toHaveBeenCalled()
    const result = { ok: true, applicationId: 'application', status: 'approved', transitioned: true }
    vi.mocked(mobileApi).mockResolvedValueOnce(result)
    expect(await approveTrainerApplication(form)).toEqual(result)
    expect(refresh).toHaveBeenCalledOnce()
    expect(form.has('operation')).toBe(false)
    const payload = vi.mocked(mobileApi).mock.calls[0][1] as FormData
    expect(payload.get('operation')).toBe('approveTrainerApplication')
    expect(payload.get('applicationId')).toBe('application')
  })

  it('retains the original multipart banner image', async () => {
    const form = new FormData(); const image = new File(['pixels'], 'promo.png', { type: 'image/png' })
    form.set('image', image); form.set('title', 'Programa semanal')
    await saveDashboardBanner(form)
    const payload = vi.mocked(mobileApi).mock.calls[0][1] as FormData
    expect(payload.get('operation')).toBe('saveDashboardBanner')
    expect(payload.get('image')).toBe(image)
    expect(form.has('operation')).toBe(false)
  })

  it('navigates server-action redirects inside the app without throwing into React forms', async () => {
    vi.mocked(mobileApi).mockRejectedValueOnce(new RouteRedirect('/admin/users?notice=admin_pro_granted'))
    await setUserSubscription(new FormData())
    expect(navigate).toHaveBeenCalledWith('/admin/users?notice=admin_pro_granted')
  })

  it('keeps unknown status filters out of the server request', async () => {
    expect(normalizeAdminTrainerStatus('forged-status')).toBeUndefined()
    await listAdminTrainerApplications('forged-status')
    expect(mobileApi).toHaveBeenCalledWith('/api/mobile/admin', { operation: 'trainers' })
  })
})

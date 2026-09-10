import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/lib/auth/server', () => ({ requireAppUserContext: mocks.context }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import { loadCompanion, leaveCompanion } from '../companions'

const viewerId = '10000000-0000-4000-8000-000000000001'
const linkId = '20000000-0000-4000-8000-000000000001'
const none = { viewerId, status: 'none', relationship: null, self: null, partner: null, greeting: null, nextGreetingAt: null, fetchedAt: '2026-09-10T12:00:00Z' }
beforeEach(() => { vi.clearAllMocks(); mocks.context.mockResolvedValue({ user: { id: viewerId }, supabase: { rpc: mocks.rpc } }); mocks.rpc.mockResolvedValue({ data: none, error: null }) })
describe('web companion actions', () => {
  it('requires the active app identity and only returns its state', async () => {
    expect(await loadCompanion()).toEqual({ ok: true, value: none })
    expect(mocks.context).toHaveBeenCalledOnce()
    expect(mocks.revalidate).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValue({ data: { ...none, viewerId: linkId }, error: null })
    expect((await loadCompanion()).ok).toBe(false)
  })
  it('refreshes the dashboard and bell after a confirmed unlink', async () => {
    expect(await leaveCompanion(linkId)).toEqual({ ok: true, value: none })
    expect(mocks.rpc).toHaveBeenCalledWith('leave_companion', { p_relationship_id: linkId })
    expect(mocks.revalidate.mock.calls.map(([path]) => path)).toEqual(['/companion', '/dashboard', '/notifications'])
  })
  it('does not call RPC without authenticated app context', async () => {
    mocks.context.mockRejectedValue(new Error('private context failure'))
    expect(await leaveCompanion(linkId)).toMatchObject({ ok: false })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(JSON.stringify(await loadCompanion())).not.toContain('private context')
  })
})

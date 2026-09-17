import { beforeEach, describe, expect, it, vi } from 'vitest'
const actions = vi.hoisted(() => ({ getConversations: vi.fn(), getMessages: vi.fn(), createConversation: vi.fn(), sendMessage: vi.fn(), deleteConversation: vi.fn() }))
vi.mock('@/app/actions/chat', () => actions)
vi.mock('@/lib/auth/server', () => ({ requireAppUserContext: async () => ({ user: { id: 'verified' } }) }))
vi.mock('@/lib/mobile-api/http', () => ({ handleMobileApi: async (_request: Request, handler: () => Promise<unknown>) => { try { return Response.json({ ok: true, data: await handler() }) } catch (error) { return Response.json({ ok: false }, { status: (error as { status?: number }).status ?? 500 }) } }, readMobileForm: (request: Request) => request.formData(), readMobileJson: (request: Request) => request.json(), mobileApiOptions: () => new Response(null, { status: 204 }), MobileApiError: class extends Error { constructor(public status: number, public code: string) { super(code) } } }))
import { POST } from '@/app/api/mobile/chat/route'
const request = (body: unknown) => new Request('https://vekira.test/api/mobile/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
beforeEach(() => { Object.values(actions).forEach(action => action.mockReset().mockResolvedValue({ success: true })) })
describe('mobile chat operations', () => {
  it('sends validated messages to the existing server AI action', async () => {
    const conversationId = '11111111-1111-4111-8111-111111111111'
    expect((await POST(request({ operation: 'send', conversationId, content: 'Mi entrenamiento' }))).status).toBe(200)
    expect(actions.sendMessage).toHaveBeenCalledWith(conversationId, 'Mi entrenamiento')
  })
  it('rejects unbounded messages, invalid IDs, contexts and forged identity fields', async () => {
    for (const body of [{ operation: 'send', conversationId: 'wrong', content: 'Hello' }, { operation: 'create', context: 'admin', title: 'X' }, { operation: 'list', userId: 'forged' }, { operation: 'send', conversationId: '11111111-1111-4111-8111-111111111111', content: 'a'.repeat(8001) }, { operation: 'constructor' }]) {
      expect((await POST(request(body))).status).toBe(400)
    }
    expect(actions.sendMessage).not.toHaveBeenCalled()
  })
})

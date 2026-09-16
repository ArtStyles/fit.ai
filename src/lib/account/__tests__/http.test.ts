import { describe, expect, it, vi } from 'vitest'
import { handleAccountDeletion } from '../http'

const endpoint = 'https://app.example.invalid/api/account/delete'
describe('bearer-only account endpoint', () => {
  it('rejects cookie-only and malformed requests without running deletion', async () => {
    const remove = vi.fn(async () => ({ ok: true, accountId: 'a' } as const))
    expect((await handleAccountDeletion(new Request(endpoint, { method: 'POST', headers: { cookie: 'forged=anything' }, body: '{}' }), remove)).status).toBe(401)
    expect((await handleAccountDeletion(new Request(endpoint, { method: 'POST', headers: { authorization: 'Bearer abc', 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmText: 'DELETE', userId: 'someone-else' }) }), remove)).status).toBe(400)
    expect(remove).not.toHaveBeenCalled()
  })
  it('passes only bearer and confirmation and returns a noncacheable acknowledgment', async () => {
    const remove = vi.fn(async () => ({ ok: true, accountId: 'verified-owner' } as const))
    const response = await handleAccountDeletion(new Request(endpoint, { method: 'POST', headers: { authorization: 'Bearer abc', 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmText: 'DELETE' }) }), remove)
    expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ ok: true, accountId: 'verified-owner' }); expect(remove).toHaveBeenCalledWith('DELETE', 'abc')
  })
})

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

  it('rejects an oversized declared body before reading it', async () => {
    const remove = vi.fn(async () => ({ ok: true, accountId: 'a' } as const))
    const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => { controller.enqueue(new TextEncoder().encode('{"confirmText":"DELETE"}')); controller.close() })
    const body = new ReadableStream<Uint8Array>({ pull }, { highWaterMark: 0 })
    const request = new Request(endpoint, { method: 'POST', headers: { authorization: 'Bearer abc', 'Content-Type': 'application/json', 'Content-Length': '1025' }, body, duplex: 'half' } as RequestInit)
    const response = await handleAccountDeletion(request, remove)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ ok: false, code: 'delete_confirm' })
    expect(pull).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it.each([undefined, '1'])('stops oversized streamed bodies when Content-Length is %s', async length => {
    const remove = vi.fn(async () => ({ ok: true, accountId: 'a' } as const))
    const cancel = vi.fn()
    let readChunks = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        readChunks++
        controller.enqueue(new Uint8Array(600).fill(32))
        if (readChunks === 5) controller.close()
      },
      cancel,
    }, { highWaterMark: 0 })
    const request = new Request(endpoint, { method: 'POST', headers: { authorization: 'Bearer abc', 'Content-Type': 'application/json', ...(length ? { 'Content-Length': length } : {}) }, body, duplex: 'half' } as RequestInit)
    const response = await handleAccountDeletion(request, remove)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ ok: false, code: 'delete_confirm' })
    expect(readChunks).toBe(2)
    expect(cancel).toHaveBeenCalledOnce()
    expect(remove).not.toHaveBeenCalled()
  })

  it('preserves existing invalid JSON and confirmation-length responses', async () => {
    const remove = vi.fn(async () => ({ ok: true, accountId: 'a' } as const))
    const request = (body: string) => new Request(endpoint, { method: 'POST', headers: { authorization: 'Bearer abc', 'Content-Type': 'application/json' }, body })
    const invalidJson = await handleAccountDeletion(request('{'), remove)
    expect(invalidJson.status).toBe(503)
    expect(await invalidJson.json()).toEqual({ ok: false, code: 'delete_failed' })
    const oversizedText = await handleAccountDeletion(request(JSON.stringify({ confirmText: 'D'.repeat(256) })), remove)
    expect(oversizedText.status).toBe(400)
    expect(await oversizedText.json()).toEqual({ ok: false, code: 'delete_confirm' })
    expect(remove).not.toHaveBeenCalled()
  })
})

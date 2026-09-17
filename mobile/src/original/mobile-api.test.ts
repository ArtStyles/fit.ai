import { describe, expect, it } from 'vitest'
import { requestMobileApi } from './mobile-api'

describe('mobile API account boundary', () => {
  it('does not send a request after the active account changes', async () => {
    let sent = false
    await expect(requestMobileApi({ url: 'https://vekira.test/api/mobile/chat', token: 'alice', payload: {},
      assertCurrent: async () => { throw new Error('changed') },
      fetcher: async () => { sent = true; return Response.json({ ok: true, data: 1 }) },
    })).rejects.toThrow('changed')
    expect(sent).toBe(false)
  })
  it('discards a response after logout or switching accounts', async () => {
    let checks = 0
    await expect(requestMobileApi({ url: 'https://vekira.test/api/mobile/chat', token: 'alice', payload: {},
      assertCurrent: async () => { if (++checks > 1) throw new Error('changed') },
      fetcher: async () => Response.json({ ok: true, data: { private: 'alice' } }),
    })).rejects.toThrow('changed')
  })
  it('sends captured bearer without cookies and returns server-confirmed data', async () => {
    const result = await requestMobileApi({ url: 'https://vekira.test/api/mobile/chat', token: 'alice', payload: { operation: 'list' },
      assertCurrent: async () => {}, fetcher: async (_url, options) => {
        expect(new Headers(options?.headers).get('authorization')).toBe('Bearer alice')
        expect(options?.credentials).toBe('omit')
        expect(options?.redirect).toBe('error')
        return Response.json({ ok: true, data: [1] })
      },
    })
    expect(result).toEqual([1])
  })
})

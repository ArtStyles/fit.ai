import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth }) }))

import { handleMobileApi, mobileApiOptions, readMobileJson } from '../http'
import { getMobileApiContext } from '../context'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-key')
  auth.getUser.mockImplementation(async (token: string) => ({ data: { user: token === 'bad' ? null : { id: token } }, error: null }))
})

const request = (token?: string) => new Request('https://vekira.test/api/mobile/chat', {
  method: 'POST', headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {}, body: '{}',
})

describe('mobile bearer API boundary', () => {
  it('bounds streamed JSON even without a content-length header', async () => {
    const chunks = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(128 * 1024 + 1)); controller.close() } })
    const large = new Request('https://vekira.test/api/mobile/chat', { method: 'POST', body: chunks, duplex: 'half' } as RequestInit)
    await expect(readMobileJson(large)).rejects.toMatchObject({ status: 413, code: 'request_too_large' })
  })
  it.each([undefined, 'bad'])('rejects %s before privileged work', async token => {
    let reached = false
    const response = await handleMobileApi(request(token), async () => { reached = true })
    expect(response.status).toBe(401)
    expect(reached).toBe(false)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('isolates concurrent verified identities and clears context outside requests', async () => {
    const responses = await Promise.all(['alice', 'bob'].map(token => handleMobileApi(request(token), async ({ user, client }) => {
      await Promise.resolve()
      return { user: user.id, context: getMobileApiContext()?.user.id, auth: (await client.auth.getUser()).data.user?.id }
    })))
    expect(await responses[0].json()).toEqual({ ok: true, data: { user: 'alice', context: 'alice', auth: 'alice' } })
    expect(await responses[1].json()).toEqual({ ok: true, data: { user: 'bob', context: 'bob', auth: 'bob' } })
    expect(getMobileApiContext()).toBeUndefined()
  })

  it('does not turn an admin denial redirect into a successful result', async () => {
    const response = await handleMobileApi(request('alice'), async () => { throw { digest: 'NEXT_REDIRECT;replace;/dashboard;307;' } })
    expect(response.status).toBe(403)
  })

  it('preserves action navigation without exposing external redirects', async () => {
    const response = await handleMobileApi(request('alice'), async () => { throw { digest: 'NEXT_REDIRECT;replace;/coach/profile?notice=saved;307;' } })
    expect(await response.json()).toEqual({ ok: true, redirect: '/coach/profile?notice=saved' })
    const unsafe = await handleMobileApi(request('alice'), async () => { throw { digest: 'NEXT_REDIRECT;replace;//evil.test;307;' } })
    expect(unsafe.status).toBe(500)
  })

  it('returns JSON errors without internal exception details', async () => {
    const response = await handleMobileApi(request('alice'), async () => { throw new Error('private database details') })
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('private database')
    expect(mobileApiOptions().status).toBe(204)
  })
})

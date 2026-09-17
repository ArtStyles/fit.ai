import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { isPublicPath, proxy } from '../proxy'

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn(() => { throw new Error('Portal must not require Supabase auth') }) }))

describe('download portal routing', () => {
  it.each(['/', '/es', '/en', '/es/privacidad', '/en/terms', '/recover-password', '/delete-account'])('keeps public route %s accessible without authentication', async path => {
    const response = await proxy(new NextRequest(`https://vekira.test${path}`, { headers: { cookie: 'sb-session=old-session' } }))
    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })
  it.each(['/dashboard', '/plan', '/session/abc', '/coach/apply', '/coach/profile', '/chat', '/admin', '/admin/users', '/login', '/register', '/onboarding', '/settings'])('redirects product route %s to the download', async path => {
    const response = await proxy(new NextRequest(`https://vekira.test${path}`))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://vekira.test/es#descargar')
  })
  it('uses a supported query locale or saved preference without trusting headers', async () => {
    const response = await proxy(new NextRequest('https://vekira.test/register?locale=en', { headers: { 'x-public-locale': 'pt' } }))
    expect(response.headers.get('location')).toBe('https://vekira.test/en#descargar')
    const saved = await proxy(new NextRequest('https://vekira.test/chat', { headers: { cookie: 'fitai-language=en' } }))
    expect(saved.headers.get('location')).toBe('https://vekira.test/en#descargar')
  })
  it('forwards/persists localized page language and strips all visitor identity headers', async () => {
    const response = await proxy(new NextRequest('https://vekira.test/en', { headers: { 'x-fitai-user-id': 'forged', 'x-fitai-user-email': 'forged@test', 'x-public-locale': 'pt' } }))
    expect(response.headers.get('x-middleware-request-x-fitai-user-id')).toBeNull()
    expect(response.headers.get('x-middleware-request-x-fitai-user-email')).toBeNull()
    expect(response.headers.get('x-middleware-request-x-public-locale')).toBe('en')
    expect(response.cookies.get('fitai-language')?.value).toBe('en')
  })
  it.each(['POST', 'OPTIONS'])('lets %s reach bearer APIs without cookie redirects', async method => {
    const response = await proxy(new NextRequest('https://vekira.test/api/account/delete', { method }))
    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })
  it('does not run legacy product Server Actions', async () => {
    const response = await proxy(new NextRequest('https://vekira.test/chat', { method: 'POST', headers: { 'next-action': 'old-id' } }))
    expect(response.status).toBe(410)
  })
  it('keeps the narrowly scoped account deletion sign-in available', async () => {
    const response = await proxy(new NextRequest('https://vekira.test/login?intent=delete-account'))
    expect(response.status).toBe(200)
  })
  it('does not treat arbitrary localized routes as public product access', () => {
    expect(isPublicPath('/en/admin')).toBe(false)
    expect(isPublicPath('/es/dashboard')).toBe(false)
    expect(isPublicPath('/es/privacidad')).toBe(true)
  })
})

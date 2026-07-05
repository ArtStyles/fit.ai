import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { isPublicPath, middleware } from '../middleware'

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}))

const mockedCreateServerClient = vi.mocked(createServerClient)

function mockSupabaseUser(user: { id: string; email?: string } | null) {
  mockedCreateServerClient.mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        })),
      })),
    })),
  } as never)
}

describe('public middleware routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('recognizes exact, auth, and localized public paths only', () => {
    expect(isPublicPath('/')).toBe(true)
    expect(isPublicPath('/auth/callback')).toBe(true)
    expect(isPublicPath('/auth/verify')).toBe(true)
    expect(isPublicPath('/es')).toBe(true)
    expect(isPublicPath('/en/faq')).toBe(true)
    expect(isPublicPath('/english')).toBe(false)
    expect(isPublicPath('/dashboard')).toBe(false)
  })

  it('forwards and persists the locale on a localized public request', async () => {
    mockSupabaseUser(null)

    const response = await middleware(new NextRequest('https://vekira.test/en'))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-request-x-public-locale')).toBe('en')
    expect(response.cookies.get('fitai-language')?.value).toBe('en')
  })

  it('allows authenticated users to visit localized public pages', async () => {
    mockSupabaseUser({ id: 'user-1', email: 'user@example.com' })

    const response = await middleware(new NextRequest('https://vekira.test/es'))

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-request-x-public-locale')).toBe('es')
  })

  it('retains the authenticated redirect on the neutral root', async () => {
    mockSupabaseUser({ id: 'user-1' })

    const response = await middleware(new NextRequest('https://vekira.test/'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://vekira.test/dashboard')
  })
})

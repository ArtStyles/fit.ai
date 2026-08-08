import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  getTrainerAccess: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  requireAppUserContext: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/headers', () => ({ cookies: () => ({ set: mocks.cookieSet }) }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/lib/auth/server', () => ({ requireAppUserContext: mocks.requireAppUserContext }))
vi.mock('@/lib/coaching/access', () => ({ getTrainerAccess: mocks.getTrainerAccess }))

import { setWorkspace } from '../workspace'

const context = {
  user: { id: 'trainer-user-1' },
  supabase: { marker: 'server-client' },
}

function workspaceForm(workspace: string): FormData {
  const formData = new FormData()
  formData.set('workspace', workspace)
  return formData
}

describe('setWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.redirect.mockImplementation(destination => {
      throw new Error(`redirect:${destination}`)
    })
    mocks.requireAppUserContext.mockResolvedValue(context)
  })

  it('checks the signed-in context before the active trainer profile and redirects an active trainer to coach', async () => {
    const order: string[] = []
    mocks.requireAppUserContext.mockImplementation(async () => {
      order.push('context')
      return context
    })
    mocks.getTrainerAccess.mockImplementation(async (userId, supabase) => {
      order.push(`trainer:${userId}:${supabase.marker}`)
      return { granted: true, profile: { id: 'trainer-profile-1', status: 'active' } }
    })
    vi.stubEnv('NODE_ENV', 'production')

    await expect(setWorkspace(workspaceForm('coach'))).rejects.toThrow('redirect:/coach')

    expect(order).toEqual(['context', 'trainer:trainer-user-1:server-client'])
    expect(mocks.cookieSet).toHaveBeenCalledWith('vekira_workspace', 'coach', {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
    vi.unstubAllEnvs()
  })

  it('normalizes an unauthorized coach request to personal before writing the cookie and redirecting', async () => {
    mocks.getTrainerAccess.mockResolvedValue({ granted: false, reason: 'inactive' })
    vi.stubEnv('NODE_ENV', 'development')

    await expect(setWorkspace(workspaceForm('coach'))).rejects.toThrow('redirect:/dashboard')

    expect(mocks.cookieSet).toHaveBeenCalledWith('vekira_workspace', 'personal', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
    expect(mocks.getTrainerAccess).toHaveBeenCalledWith('trainer-user-1', context.supabase)
    vi.unstubAllEnvs()
  })
})

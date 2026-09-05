import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  getTrainerAccess: vi.fn(),
  revalidatePath: vi.fn(),
  requireAppUserContext: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/headers', () => ({ cookies: () => ({ set: mocks.cookieSet }) }))
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
    mocks.requireAppUserContext.mockResolvedValue(context)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('writes the coach preference and returns its canonical destination', async () => {
    mocks.getTrainerAccess.mockResolvedValue({
      granted: true,
      profile: { id: 'trainer-profile-1', status: 'active' },
    })

    await expect(setWorkspace(workspaceForm('coach'))).resolves.toEqual({
      ok: true,
      workspace: 'coach',
      destination: '/coach',
    })
    expect(mocks.cookieSet).toHaveBeenCalledWith('vekira_workspace', 'coach', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('rejects malformed input before access lookup or cookie mutation', async () => {
    await expect(setWorkspace(workspaceForm('admin'))).resolves.toEqual({
      ok: false,
      code: 'invalid_workspace',
      error: 'El espacio solicitado no es válido.',
    })
    expect(mocks.getTrainerAccess).not.toHaveBeenCalled()
    expect(mocks.cookieSet).not.toHaveBeenCalled()
  })

  it('does not silently normalize unavailable coach access', async () => {
    mocks.getTrainerAccess.mockResolvedValue({ granted: false, reason: 'suspended' })

    await expect(setWorkspace(workspaceForm('coach'))).resolves.toEqual({
      ok: false,
      code: 'coach_unavailable',
      error: 'El espacio de entrenador ya no está disponible.',
    })
    expect(mocks.cookieSet).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('does not mutate the cookie when revalidation throws', async () => {
    mocks.getTrainerAccess.mockResolvedValue({
      granted: true,
      profile: { id: 'trainer-profile-1', status: 'active' },
    })
    mocks.revalidatePath.mockImplementationOnce(() => {
      throw new Error('revalidation unavailable')
    })

    await expect(setWorkspace(workspaceForm('personal'))).resolves.toEqual({
      ok: false,
      code: 'unexpected',
      error: 'No se pudo cambiar de espacio. Inténtalo nuevamente.',
    })
    expect(mocks.cookieSet).not.toHaveBeenCalled()
  })

  it('does not report success when the cookie API rejects', async () => {
    mocks.getTrainerAccess.mockResolvedValue({
      granted: true,
      profile: { id: 'trainer-profile-1', status: 'active' },
    })
    mocks.cookieSet.mockImplementationOnce(() => {
      throw new Error('cookie storage unavailable')
    })

    await expect(setWorkspace(workspaceForm('personal'))).resolves.toEqual({
      ok: false,
      code: 'unexpected',
      error: 'No se pudo cambiar de espacio. Inténtalo nuevamente.',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('allows authentication redirects to propagate', async () => {
    const authRedirect = new Error('NEXT_REDIRECT:/login')
    mocks.requireAppUserContext.mockRejectedValueOnce(authRedirect)

    await expect(setWorkspace(workspaceForm('personal'))).rejects.toBe(authRedirect)
    expect(mocks.cookieSet).not.toHaveBeenCalled()
  })

  it('checks the signed-in context before the active trainer profile and writes a secure production cookie', async () => {
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

    await expect(setWorkspace(workspaceForm('coach'))).resolves.toEqual({
      ok: true,
      workspace: 'coach',
      destination: '/coach',
    })

    expect(order).toEqual(['context', 'trainer:trainer-user-1:server-client'])
    expect(mocks.cookieSet).toHaveBeenCalledWith('vekira_workspace', 'coach', {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
})

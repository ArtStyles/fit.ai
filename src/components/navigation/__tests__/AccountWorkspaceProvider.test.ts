import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/app/actions/workspace', () => ({ setWorkspace: vi.fn() }))
vi.mock('@/app/(auth)/actions', () => ({ signOut: vi.fn() }))

import { executeWorkspaceTransition } from '../AccountWorkspaceProvider'

describe('executeWorkspaceTransition', () => {
  it('requests permission, exposes pending, commits, replaces, and refreshes in order', async () => {
    const order: string[] = []
    const outcome = await executeWorkspaceTransition('coach', 'personal', {
      requestIntent: target => {
        order.push('intent:' + target)
        return true
      },
      commitIntent: target => { order.push('commit:' + target) },
      action: async formData => {
        order.push('action:' + formData.get('workspace'))
        return { ok: true, workspace: 'coach', destination: '/coach' }
      },
      replace: destination => { order.push('replace:' + destination) },
      refresh: () => { order.push('refresh') },
      setPending: target => { order.push('pending:' + String(target)) },
    })

    expect(outcome).toEqual({ status: 'navigating' })
    expect(order).toEqual([
      'intent:coach',
      'pending:coach',
      'action:coach',
      'commit:coach',
      'replace:/coach',
      'refresh',
      'pending:null',
    ])
  })

  it('cancels before the server action', async () => {
    const action = vi.fn()
    await expect(executeWorkspaceTransition('coach', 'personal', {
      requestIntent: () => false,
      commitIntent: vi.fn(),
      action,
      replace: vi.fn(),
      refresh: vi.fn(),
      setPending: vi.fn(),
    })).resolves.toEqual({ status: 'cancelled' })
    expect(action).not.toHaveBeenCalled()
  })

  it('keeps errors recoverable and refreshes revoked access', async () => {
    const refresh = vi.fn()
    await expect(executeWorkspaceTransition('coach', 'personal', {
      requestIntent: () => true,
      commitIntent: vi.fn(),
      action: async () => ({
        ok: false,
        code: 'coach_unavailable',
        error: 'El espacio de entrenador ya no está disponible.',
      }),
      replace: vi.fn(),
      refresh,
      setPending: vi.fn(),
    })).resolves.toEqual({
      status: 'failed',
      code: 'coach_unavailable',
      error: 'El espacio de entrenador ya no está disponible.',
    })
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('surfaces invalid input without commit, navigation, or refresh', async () => {
    const commitIntent = vi.fn()
    const replace = vi.fn()
    const refresh = vi.fn()
    await expect(executeWorkspaceTransition('coach', 'personal', {
      requestIntent: () => true,
      commitIntent,
      action: async () => ({
        ok: false,
        code: 'invalid_workspace',
        error: 'El espacio solicitado no es válido.',
      }),
      replace,
      refresh,
      setPending: vi.fn(),
    })).resolves.toEqual({
      status: 'failed',
      code: 'invalid_workspace',
      error: 'El espacio solicitado no es válido.',
    })
    expect(commitIntent).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('turns a rejected network call into an unexpected failure', async () => {
    await expect(executeWorkspaceTransition('coach', 'personal', {
      requestIntent: () => true,
      commitIntent: vi.fn(),
      action: async () => { throw new Error('offline') },
      replace: vi.fn(),
      refresh: vi.fn(),
      setPending: vi.fn(),
    })).resolves.toEqual({
      status: 'failed',
      code: 'unexpected',
      error: 'No se pudo cambiar de espacio. Inténtalo nuevamente.',
    })
  })

  it('treats an absent action result as navigation already handled by Next', async () => {
    const commitIntent = vi.fn()
    const replace = vi.fn()
    const refresh = vi.fn()
    await expect(executeWorkspaceTransition('coach', 'personal', {
      requestIntent: () => true,
      commitIntent,
      action: async () => undefined,
      replace,
      refresh,
      setPending: vi.fn(),
    })).resolves.toEqual({ status: 'redirecting' })
    expect(commitIntent).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })
})

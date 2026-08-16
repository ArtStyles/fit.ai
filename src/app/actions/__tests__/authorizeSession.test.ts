import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { authorizationErrorMessage } from '@/lib/session/authorization'
import * as sessionAuthorizationActions from '../authorizeSession'

type ReleaseSessionAuthorization = (
  clientSessionId: string,
  workoutId: string,
) => Promise<{ success: boolean; error?: string }>

const createClientMock = vi.mocked(createClient)

function getReleaseSessionAuthorization(): ReleaseSessionAuthorization | undefined {
  return (sessionAuthorizationActions as typeof sessionAuthorizationActions & {
    releaseSessionAuthorization?: ReleaseSessionAuthorization
  }).releaseSessionAuthorization
}

describe('authorizationErrorMessage', () => {
  it.each([
    ['SESSION_PLAN_INACTIVE', 'Esta rutina ya no está disponible en tu plan activo.'],
    ['SESSION_WORKOUT_ALREADY_COMPLETED', 'Esta rutina ya fue completada.'],
    ['SESSION_DAILY_LIMIT_REACHED', 'Ya registraste una sesión hoy. Máximo una sesión por día.'],
    ['SESSION_AUTHORIZATION_EXPIRED', 'La autorización de esta sesión expiró. Inicia una nueva sesión.'],
  ])('maps %s to a safe source message', (rpcMessage, expected) => {
    expect(authorizationErrorMessage(`RPC failed: ${rpcMessage}`)).toBe(expected)
  })

  it('does not expose unexpected database details', () => {
    expect(authorizationErrorMessage('permission denied for relation private_table')).toBe(
      'No se pudo preparar la sesión. Inténtalo nuevamente.',
    )
  })
})

describe('releaseSessionAuthorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('releases the exact pending authorization for the signed-in user', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      rpc,
    } as never)

    const releaseSessionAuthorization = getReleaseSessionAuthorization()
    expect(releaseSessionAuthorization).toBeTypeOf('function')
    if (!releaseSessionAuthorization) return

    const result = await releaseSessionAuthorization(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    )

    expect(result).toEqual({ success: true })
    expect(rpc).toHaveBeenCalledWith('release_session_authorization', {
      p_client_session_id: '11111111-1111-4111-8111-111111111111',
      p_workout_id: '22222222-2222-4222-8222-222222222222',
    })
  })

  it('rejects invalid identifiers before contacting Supabase', async () => {
    const releaseSessionAuthorization = getReleaseSessionAuthorization()
    expect(releaseSessionAuthorization).toBeTypeOf('function')
    if (!releaseSessionAuthorization) return

    const result = await releaseSessionAuthorization('invalid', 'also-invalid')

    expect(result).toEqual({
      success: false,
      error: 'No se pudo descartar el entrenamiento. Inténtalo nuevamente.',
    })
    expect(createClientMock).not.toHaveBeenCalled()
  })
})

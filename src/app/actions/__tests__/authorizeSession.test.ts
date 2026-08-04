import { describe, expect, it } from 'vitest'
import { authorizationErrorMessage } from '@/lib/session/authorization'

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

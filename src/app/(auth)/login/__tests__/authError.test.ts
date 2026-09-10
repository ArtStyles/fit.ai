import { describe, expect, it } from 'vitest'
import { getLoginErrorMessage, isEmailNotConfirmedError } from '../authError'

describe('getLoginErrorMessage', () => {
  it.each([
    { code: 'offline', message: 'Conecta a internet para iniciar sesión.' },
    new TypeError('Failed to fetch'),
    new Error('Network request failed'),
    { name: 'AuthRetryableFetchError', message: 'Load failed' },
  ])('explains connectivity failures without blaming the credentials: %s', error => {
    const message = getLoginErrorMessage(error)
    expect(message).toMatch(/conexión a internet/i)
    expect(message).not.toMatch(/contraseña|tus datos|fetch|network|load failed/i)
  })

  it('keeps invalid credentials distinct from connectivity errors', () => {
    expect(getLoginErrorMessage({ message: 'Invalid login credentials' })).toBe('Correo o contraseña incorrectos.')
  })

  it('does not reveal internal database errors from account preparation', () => {
    expect(getLoginErrorMessage(new Error('Query: No available connection for database vekira_offline')))
      .not.toMatch(/query|database|vekira_offline|contraseña/i)
  })
})

describe('isEmailNotConfirmedError', () => {
  it('detecta el código estable de Supabase', () => {
    expect(
      isEmailNotConfirmedError({
        code: 'email_not_confirmed',
        message: 'Email confirmation required',
      }),
    ).toBe(true)
  })

  it('mantiene compatibilidad con el mensaje de Supabase', () => {
    expect(isEmailNotConfirmedError({ message: 'Email not confirmed' })).toBe(true)
  })

  it('no confunde credenciales incorrectas con una cuenta pendiente', () => {
    expect(isEmailNotConfirmedError({ message: 'Invalid login credentials' })).toBe(false)
  })
})

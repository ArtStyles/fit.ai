import { describe, expect, it } from 'vitest'
import { isEmailNotConfirmedError } from '../authError'

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

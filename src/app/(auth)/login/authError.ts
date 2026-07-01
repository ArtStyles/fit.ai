type AuthErrorLike = {
  code?: string
  message: string
}

/** Detecta una cuenta válida que todavía tiene pendiente confirmar su correo. */
export function isEmailNotConfirmedError(error: AuthErrorLike): boolean {
  return (
    error.code === 'email_not_confirmed' ||
    error.message.toLowerCase().includes('email not confirmed')
  )
}

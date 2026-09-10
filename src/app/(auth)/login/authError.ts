type AuthErrorLike = {
  code?: string
  message: string
}

/** Public login feedback for returned SDK errors and rejected requests. */
export function getLoginErrorMessage(error: unknown): string {
  const value = error && typeof error === 'object'
    ? error as { message?: unknown; name?: unknown; code?: unknown }
    : { message: error }
  const normalized = typeof value.message === 'string' ? value.message.toLowerCase() : ''

  if (value.code === 'offline' || value.name === 'AuthRetryableFetchError'
    || /conecta a internet|failed to fetch|fetch failed|network.*(?:failed|error)|networkerror|load failed/.test(normalized)) {
    return 'No hay conexión a internet. Revisa tu conexión e intenta iniciar sesión de nuevo.'
  }

  if (normalized.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (normalized.includes('email not confirmed')) return 'Confirma tu correo antes de iniciar sesión.'
  if (normalized.includes('too many requests') || normalized.includes('rate limit')) {
    return 'Demasiados intentos. Espera un momento e intenta de nuevo.'
  }
  return 'No se pudo iniciar sesión. Intenta de nuevo en un momento.'
}

/** Detecta una cuenta válida que todavía tiene pendiente confirmar su correo. */
export function isEmailNotConfirmedError(error: AuthErrorLike): boolean {
  return (
    error.code === 'email_not_confirmed' ||
    error.message.toLowerCase().includes('email not confirmed')
  )
}

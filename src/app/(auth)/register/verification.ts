/** Deja solo dígitos y recorta a 8 caracteres. */
export function normalizeCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, 8)
}

/** Devuelve un mensaje de error si el código no son exactamente 8 dígitos, o null si es válido. */
export function validateCode(code: string): string | null {
  return /^\d{8}$/.test(code) ? null : 'Ingresa el código de 8 dígitos.'
}

/** Traduce el error de `verifyOtp` a un mensaje para el usuario. */
export function getVerifyErrorMessage(message: string): string {
  const normalized = message.toLowerCase()

  if (normalized.includes('expired') || normalized.includes('invalid')) {
    return 'El código expiró o no es válido. Reenvía uno nuevo.'
  }

  if (normalized.includes('rate limit') || normalized.includes('too many')) {
    return 'Demasiados intentos. Espera un momento e intenta de nuevo.'
  }

  return 'No se pudo verificar el código. Intenta nuevamente.'
}

/** Traduce el error de `resend` a un mensaje para el usuario. */
export function getResendErrorMessage(message: string): string {
  const normalized = message.toLowerCase()

  if (
    normalized.includes('rate limit') ||
    normalized.includes('too many') ||
    normalized.includes('security purposes')
  ) {
    return 'Espera un momento antes de pedir otro código.'
  }

  return 'No se pudo reenviar el código. Intenta nuevamente.'
}

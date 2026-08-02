export interface SessionAuthorizationValidity {
  expiresAt: string
  consumedAt: string | null
  userMatches: boolean
  workoutMatches: boolean
}

export type SessionAuthorizationState = 'authorizing' | 'ready' | 'error'
export type SessionAuthorizationEvent = 'succeeded' | 'failed' | 'retry'

const AUTHORIZATION_ERROR_MESSAGES: Record<string, string> = {
  SESSION_PLAN_INACTIVE: 'Esta rutina ya no está disponible en tu plan activo.',
  SESSION_WORKOUT_NOT_FOUND: 'Esta rutina ya no está disponible en tu plan activo.',
  SESSION_WORKOUT_UNAVAILABLE: 'Esta rutina ya no está disponible en tu plan activo.',
  SESSION_WORKOUT_ALREADY_COMPLETED: 'Esta rutina ya fue completada.',
  SESSION_DAILY_LIMIT_REACHED: 'Ya registraste una sesión hoy. Máximo una sesión por día.',
  SESSION_AUTHORIZATION_EXPIRED: 'La autorización de esta sesión expiró. Inicia una nueva sesión.',
}

export function authorizationErrorMessage(message: string): string {
  const code = Object.keys(AUTHORIZATION_ERROR_MESSAGES)
    .find(candidate => message.includes(candidate))
  return code
    ? AUTHORIZATION_ERROR_MESSAGES[code]
    : 'No se pudo preparar la sesión. Inténtalo nuevamente.'
}

export function canMountSessionClient<
  T extends { allowed: boolean; workout?: unknown },
>(access: T): access is T & { workout: NonNullable<T['workout']> } {
  return access.workout !== undefined && access.workout !== null
}

export function nextSessionAuthorizationState(
  state: SessionAuthorizationState,
  event: SessionAuthorizationEvent,
): SessionAuthorizationState {
  if (state === 'ready') return 'ready'
  if (event === 'retry') return 'authorizing'
  if (state !== 'authorizing') return state
  return event === 'succeeded' ? 'ready' : 'error'
}

export function canUseAuthorization(
  authorization: SessionAuthorizationValidity,
  now = new Date(),
): boolean {
  const expiresAt = Date.parse(authorization.expiresAt)

  return authorization.userMatches &&
    authorization.workoutMatches &&
    authorization.consumedAt === null &&
    Number.isFinite(expiresAt) &&
    expiresAt > now.getTime()
}

export interface SessionAuthorizationValidity {
  expiresAt: string
  consumedAt: string | null
  userMatches: boolean
  workoutMatches: boolean
}

export type SessionAuthorizationState = 'authorizing' | 'ready' | 'error'
export type SessionAuthorizationEvent = 'succeeded' | 'failed' | 'retry'

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

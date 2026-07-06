import { validateUsername } from '@/lib/social/username'

const CHECK_ERROR = 'No pudimos comprobar la disponibilidad. Inténtalo de nuevo.'
const UPDATE_ERROR = 'No pudimos guardar el nombre de usuario. Inténtalo de nuevo.'

type UsernameCheckResult = { available: boolean; error?: string }
type UsernameUpdateResult = { ok: true } | { ok: false; error: string }

export type UsernameAvailabilityOutcome =
  | { status: 'available'; normalized: string }
  | { status: 'unavailable'; normalized: string; error: string }
  | { status: 'invalid'; error: string }
  | { status: 'stale' }
  | { status: 'error'; error: string }

export type UsernameCommitOutcome =
  | { status: 'saved'; normalized: string }
  | { status: 'rejected'; error: string }
  | { status: 'invalid'; error: string }
  | { status: 'stale' }
  | { status: 'error'; error: string }

function currentMatches(normalized: string, getCurrentRaw: () => string): boolean {
  const current = validateUsername(getCurrentRaw())
  return current.ok && current.value === normalized
}

export async function checkUsernameAvailability({
  raw,
  check,
  getCurrentRaw,
}: {
  raw: string
  check: (normalized: string) => Promise<UsernameCheckResult>
  getCurrentRaw: () => string
}): Promise<UsernameAvailabilityOutcome> {
  const validation = validateUsername(raw)
  if (!validation.ok) return { status: 'invalid', error: validation.error }

  try {
    const result = await check(validation.value)
    if (!currentMatches(validation.value, getCurrentRaw)) return { status: 'stale' }
    return result.available
      ? { status: 'available', normalized: validation.value }
      : { status: 'unavailable', normalized: validation.value, error: result.error ?? 'Ese nombre de usuario ya está en uso.' }
  } catch {
    if (!currentMatches(validation.value, getCurrentRaw)) return { status: 'stale' }
    return { status: 'error', error: CHECK_ERROR }
  }
}

export async function commitUsername({
  raw,
  update,
  getCurrentRaw,
  onSuccess,
}: {
  raw: string
  update: (normalized: string) => Promise<UsernameUpdateResult>
  getCurrentRaw: () => string
  onSuccess: () => void
}): Promise<UsernameCommitOutcome> {
  const validation = validateUsername(raw)
  if (!validation.ok) return { status: 'invalid', error: validation.error }

  let result: UsernameUpdateResult
  try {
    result = await update(validation.value)
  } catch {
    if (!currentMatches(validation.value, getCurrentRaw)) return { status: 'stale' }
    return { status: 'error', error: UPDATE_ERROR }
  }

  if (!currentMatches(validation.value, getCurrentRaw)) return { status: 'stale' }
  if (!result.ok) return { status: 'rejected', error: result.error }

  onSuccess()
  return { status: 'saved', normalized: validation.value }
}

import type { saveSession as saveSessionAction } from '@/app/actions/saveSession'
import type { ReadinessReviewInput } from '@/app/actions/readiness'
import { getReadinessReviewStatus } from '@/lib/training-engine'

const defaultReadiness: ReadinessReviewInput = {
  activityLevel: 'insufficiently_active', cardioPreferences: ['walking'],
  warningSymptoms: [], knownDisease: false, recentSurgery: false, medicallyCleared: false,
  limitations: [{ region: 'Rodilla', side: 'left', status: 'stable', movementsToAvoid: ['saltos'], clinicianCleared: true }],
}

export async function authorizeSessionStart(clientSessionId: string, workoutId: string) {
  const attempts = JSON.parse(localStorage.getItem('fixture-authorize-attempts') ?? '[]') as unknown[]
  attempts.push({ clientSessionId, workoutId })
  localStorage.setItem('fixture-authorize-attempts', JSON.stringify(attempts))
  const status = localStorage.getItem('fixture-readiness-status')
    ?? new URLSearchParams(location.search).get('readiness')
  if (status === 'pending') return { success: false as const, error: 'Completa tu preparación antes de entrenar.', readinessStatus: 'pending' as const }
  if (status === 'professional_clearance_required') return { success: false as const, error: 'Necesitas autorización profesional antes de entrenar.', readinessStatus: 'professional_clearance_required' as const }
  if (status === 'generic') return { success: false as const, error: 'No se pudo preparar la sesión. Inténtalo nuevamente.' }
  if (status === 'completed') return { success: false as const, error: 'Esta rutina ya fue completada.', authorizationAbsent: true as const }
  return { success: true as const }
}

export async function loadReadinessReview() {
  const saved = localStorage.getItem('fixture-readiness-answers')
  return { success: true, data: saved ? JSON.parse(saved) as ReadinessReviewInput : defaultReadiness }
}

export async function saveReadinessReview(input: ReadinessReviewInput) {
  const saves = JSON.parse(localStorage.getItem('fixture-readiness-saves') ?? '[]') as unknown[]
  saves.push(input)
  localStorage.setItem('fixture-readiness-saves', JSON.stringify(saves))
  if (localStorage.getItem('fixture-readiness-save-hold')) {
    await new Promise<void>(resolve => {
      (window as Window & { __RESOLVE_READINESS_SAVE__?: () => void }).__RESOLVE_READINESS_SAVE__ = resolve
    })
  }
  if (localStorage.getItem('fixture-readiness-save-fails')) return { success: false, error: 'No se pudo guardar la revisión.' }
  const status = getReadinessReviewStatus(input)
  localStorage.setItem('fixture-readiness-answers', JSON.stringify(input))
  localStorage.setItem('fixture-readiness-status', status)
  return { success: true, status }
}
export async function verifySessionBackupOwner() { return 'account-a' }
export async function releaseSessionAuthorization() { return { success: true as const } }
export async function setWorkspace() { return undefined }
export async function signOut() { return undefined }
export async function createPostFromSession() { return { success: false, error: 'Disabled in fixture' } }

export async function saveSession(payload: Parameters<typeof saveSessionAction>[0]) {
  const attempts = JSON.parse(localStorage.getItem('fixture-save-attempts') ?? '[]') as unknown[]
  attempts.push(payload)
  localStorage.setItem('fixture-save-attempts', JSON.stringify(attempts))
  // Simulate a committed server write whose first response is lost.
  const committed = JSON.parse(localStorage.getItem('fixture-committed') ?? '{}') as Record<string, string>
  committed[payload.clientSessionId] ??= 'progress-log-1'
  localStorage.setItem('fixture-committed', JSON.stringify(committed))
  if (!localStorage.getItem('fixture-network-restored')) throw new Error('Lost response')
  return { success: true as const, progressLogId: committed[payload.clientSessionId], prs: [], progressions: [] }
}

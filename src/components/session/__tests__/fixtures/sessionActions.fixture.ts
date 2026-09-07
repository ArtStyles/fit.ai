import type { saveSession as saveSessionAction } from '@/app/actions/saveSession'

export async function authorizeSessionStart() { return { success: true as const } }
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

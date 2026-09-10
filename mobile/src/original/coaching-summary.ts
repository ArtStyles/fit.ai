import { loadClientCoachingSummary as loadConnectedSummary, type ClientCoachingSummaryClient, type ClientCoachingSummaryResult } from '../../../src/lib/coaching/clientSummary'
import { createConnectedClient } from './bridge-client'
import { getAppStore } from './storage'
export type { ClientCoachingSummary, ClientCoachingSummaryResult, ClientCoachingSummaryClient } from '../../../src/lib/coaching/clientSummary'

const unavailable = (): ClientCoachingSummaryResult => ({ summary: null, error: 'No se pudo actualizar tu acompañamiento. Intenta de nuevo con conexión.' })

async function connectedSummary(owner: string): Promise<ClientCoachingSummaryResult> {
  // A slow connection must not hold the whole personal dashboard indefinitely.
  // The late operation only reads; persistence happens after this deadline.
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async () => loadConnectedSummary(await createConnectedClient(owner) as ClientCoachingSummaryClient, owner))(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Coaching summary timeout')), 8000) }),
    ])
  } finally { clearTimeout(timer) }
}

/** Coaching permissions are server state, not inferred from incomplete personal tables. */
export async function loadClientCoachingSummary(_client: ClientCoachingSummaryClient, owner: string): Promise<ClientCoachingSummaryResult> {
  try {
    const store = await getAppStore()
    const sessionVersion = store.sessionVersion()
    const state = await store.read()
    if (!state || state.accountId !== owner) return unavailable()
    if (!state.remoteUserId) return { summary: null, error: null }
    if (state.remoteUserId !== owner) return unavailable()

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const cached = await store.getAccountCache('coaching-summary', owner) as { version?: number; summary: ClientCoachingSummaryResult['summary'] } | null
      if (store.sessionVersion() !== sessionVersion) return unavailable()
      if (cached?.version === 1) return { summary: cached.summary, error: null }
      // Older APKs did not cache consents. Missing data is not a revoked grant.
      return state.tables.coaching_relationships?.some(row => ['active', 'paused_by_platform'].includes(row.status))
        ? { summary: null, error: 'Conecta a internet para actualizar el estado de tu acompañamiento.' }
        : { summary: null, error: null }
    }

    const result = await connectedSummary(owner)
    if (result.error) return result
    if (store.sessionVersion() !== sessionVersion) return unavailable()
    const current = await store.read()
    if (current?.accountId !== owner || current.remoteUserId !== owner) return unavailable()
    await store.setAccountCache('coaching-summary', { version: 1, summary: result.summary }, sessionVersion, owner)
    return result
  } catch { return unavailable() }
}

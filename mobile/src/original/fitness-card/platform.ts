import { createConnectedClient, remote } from '../bridge-client'
import { getAppStore } from '../storage'
import { ORIGINAL_STATE_CHANGED } from '../types'
import { projectLocalFitnessCard } from './projection'
import { loadConnectedFitnessEvidence } from '@/lib/fitness-card/remote-evidence'
import type { FitnessPlatform } from '@/lib/fitness-card/platform-types'

export async function openFitnessPlatform(): Promise<FitnessPlatform> {
  const store = await getAppStore()
  const version = store.sessionVersion()
  const initial = await store.read()
  if (!initial) throw new Error('Selecciona un perfil para abrir Fitness Card.')
  const ownerId = initial.accountId
  const profile = initial.tables.profiles.find(row => row.id === ownerId)
  let disposed = false
  const assertCurrent = async () => {
    const state = await store.read()
    if (disposed || store.sessionVersion() !== version || state?.accountId !== ownerId || state.remoteUserId !== initial.remoteUserId) throw new Error('La cuenta activa cambió. Vuelve a abrir Fitness Card.')
  }
  const getClient = async () => { await assertCurrent(); const client = await createConnectedClient(ownerId); await assertCurrent(); return client }
  return {
    identity: { userId: ownerId, name: String(profile?.full_name || 'Vekira'), username: profile?.username || null, avatarUrl: profile?.avatar_url || null },
    linked: initial.remoteUserId === ownerId, assertCurrent, getClient,
    evidence: async () => { await assertCurrent(); const current = await store.read(); await assertCurrent(); return projectLocalFitnessCard(current!) },
    sharedEvidence: async () => { const client = await getClient(); const state = await store.read(); await assertCurrent(); const result = await loadConnectedFitnessEvidence(client, ownerId, new Date(), state!); await assertCurrent(); return result },
    watch: listener => {
      let stopped = false
      const local = () => { void assertCurrent().then(() => { if (!stopped) listener('local') }, () => { if (!stopped) listener('account') }) }
      window.addEventListener(ORIGINAL_STATE_CHANGED, local)
      const channel = initial.remoteUserId === ownerId && remote ? remote.channel(`fitness-card:${ownerId}:${crypto.randomUUID()}`).on('postgres_changes', { event: '*', schema: 'public', table: 'fitness_card_updates', filter: `user_id=eq.${ownerId}` }, () => {
        void assertCurrent().then(() => { if (!stopped) listener('remote') }, () => { if (!stopped) listener('account') })
      }).subscribe() : null
      const auth = remote?.auth.onAuthStateChange((event, session) => { if (event === 'SIGNED_OUT' || (session && session.user.id !== ownerId)) { disposed = true; if (!stopped) listener('account') } })
      return () => { stopped = true; window.removeEventListener(ORIGINAL_STATE_CHANGED, local); auth?.data.subscription.unsubscribe(); if (channel) void remote?.removeChannel(channel) }
    },
    dispose: () => { disposed = true },
  }
}

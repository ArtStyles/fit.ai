'use client'

import { createClient as createRawClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { loadConnectedFitnessEvidence } from './remote-evidence'
import type { FitnessPlatform } from './platform-types'

export async function openFitnessPlatform(): Promise<FitnessPlatform> {
  const remote = createClient()
  const { data: { user }, error } = await remote.auth.getUser()
  if (error || !user) throw new Error('Inicia sesión para abrir tu Fitness Card.')
  const ownerId = user.id
  let disposed = false, changed = false
  const auth = remote.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || (session && session.user.id !== ownerId)) changed = true
  })
  const assertCurrent = async () => {
    if (disposed || changed) throw new Error('La cuenta activa cambió. Vuelve a abrir Fitness Card.')
    const { data, error: sessionError } = await remote.auth.getSession()
    if (sessionError || data.session?.user.id !== ownerId || disposed || changed) throw new Error('La cuenta activa cambió. Vuelve a abrir Fitness Card.')
  }
  try {
    const { data: profile, error: profileError } = await remote.from('profiles').select('full_name,username,avatar_url').eq('id', ownerId).single() as unknown as { data: { full_name: string | null; username: string | null; avatar_url: string | null } | null; error: unknown }
    if (profileError || !profile) throw new Error('No se pudo cargar tu perfil.')
    const getClient = async () => {
      await assertCurrent()
      if (!navigator.onLine) throw new Error('Conecta a internet para consultar las tarjetas compartidas.')
      const { data } = await remote.auth.getSession()
      const token = data.session!.access_token
      // A fixed token plus before/after guards prevents A's pending request using B's session.
      return createRawClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        accessToken: async () => token,
        global: { fetch: async (input, init) => { await assertCurrent(); const response = await fetch(input, { ...init, cache: 'no-store' }); await assertCurrent(); return response } },
      })
    }
    const evidence = async () => { const result = await loadConnectedFitnessEvidence(await getClient(), ownerId); await assertCurrent(); return result }
    return {
      identity: { userId: ownerId, name: profile.full_name || 'Vekira', username: profile.username, avatarUrl: profile.avatar_url },
      linked: true, assertCurrent, getClient, evidence, sharedEvidence: evidence,
      watch: listener => {
        let stopped = false
        const channel = remote.channel(`fitness-card:${ownerId}:${crypto.randomUUID()}`).on('postgres_changes', { event: '*', schema: 'public', table: 'fitness_card_updates', filter: `user_id=eq.${ownerId}` }, () => { if (!stopped) listener(changed ? 'account' : 'remote') }).subscribe()
        const subscription = remote.auth.onAuthStateChange((event, session) => { if (event === 'SIGNED_OUT' || (session && session.user.id !== ownerId)) { changed = true; listener('account') } })
        return () => { stopped = true; subscription.data.subscription.unsubscribe(); void remote.removeChannel(channel) }
      },
      dispose: () => { disposed = true; auth.data.subscription.unsubscribe() },
    }
  } catch (reason) { auth.data.subscription.unsubscribe(); throw reason }
}

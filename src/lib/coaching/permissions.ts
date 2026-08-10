import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'
import type { CoachingConsentScope } from './relationships'

type HasActiveCoachingScopeArgs = Database['public']['Functions']['has_active_coaching_scope']['Args']

export type CoachingScopeRpcClient = {
  rpc: (
    functionName: 'has_active_coaching_scope',
    args: HasActiveCoachingScopeArgs,
  ) => Promise<{ data: boolean | null; error: { message: string } | null }>
}

export async function hasActiveCoachingScope(
  trainerId: string,
  clientId: string,
  scope: CoachingConsentScope,
  rpcClient?: CoachingScopeRpcClient,
): Promise<boolean> {
  // Consent and trainer status are revocable, so every caller performs a new
  // database authorization check. This module intentionally keeps no cache.
  const args: HasActiveCoachingScopeArgs = {
    p_trainer_id: trainerId,
    p_client_id: clientId,
    p_scope: scope,
  }

  if (rpcClient) {
    const { data, error } = await rpcClient.rpc('has_active_coaching_scope', args)
    return error === null && data === true
  }

  const supabase = await createClient()
  const typedRpcClient = supabase as unknown as CoachingScopeRpcClient
  const { data, error } = await typedRpcClient.rpc('has_active_coaching_scope', args)

  return error === null && data === true
}

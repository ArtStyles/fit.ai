import type { SupabaseClient } from '@supabase/supabase-js'
import type { FitnessEvidence, FitnessIdentity } from './types'

export type FitnessPlatform = {
  identity: FitnessIdentity
  linked: boolean
  assertCurrent: () => Promise<void>
  getClient: () => Promise<SupabaseClient>
  evidence: () => Promise<FitnessEvidence>
  sharedEvidence: () => Promise<FitnessEvidence>
  watch: (changed: (kind: 'local' | 'remote' | 'account') => void) => () => void
  dispose: () => void
}

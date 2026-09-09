import { createClient } from '@supabase/supabase-js'
import type { MobileRepository } from '../domain/types'
import { createCloudWithGateway } from './sync'
import { createSupabaseGateway } from './supabase'
export type { MobileCloud, TrainerCard, CoachingOverview } from './types'

export function createMobileCloud(repository: MobileRepository) {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  let authStorageEnabled = true
  const storage = {
    getItem: (name: string) => authStorageEnabled ? localStorage.getItem(name) : null,
    setItem: (name: string, value: string) => { if (authStorageEnabled) localStorage.setItem(name, value) },
    removeItem: (name: string) => localStorage.removeItem(name),
  }
  const client = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'vekira-mobile-auth-v1', storage } }) : null
  return createCloudWithGateway(repository, client ? createSupabaseGateway(client, () => {
    authStorageEnabled = false
    localStorage.removeItem('vekira-mobile-auth-v1')
    localStorage.removeItem('vekira-mobile-auth-v1-code-verifier')
  }, () => { authStorageEnabled = true }) : null)
}

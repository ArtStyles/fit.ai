export type { Database } from './database'

// ── Domain types (grow as schema is defined) ──────────────────────────────────

export interface UserProfile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  subscription_tier: 'free' | 'pro'
  created_at: string
}

import manifest from '../../../public/exercises/catalog/v1/manifest.json'
import { mapCatalogV1ManifestToRows } from '@/lib/exercises/catalogV1Rows'
import type { CatalogV1Manifest } from '@/lib/exercises/visualCatalogV1'
import type { AppState, AppRow } from './types'

export async function bundledExercises(): Promise<AppRow[]> {
  const rows = mapCatalogV1ManifestToRows(manifest as unknown as CatalogV1Manifest, 'https://local.invalid')
  return Promise.all(rows.map(async (row, index) => {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`vekira:catalog:v1:${row.external_id}`))).slice(0, 16)
    bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128
    const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    const entry = manifest.exercises[index]
    const motion = 'motion' in entry ? entry.motion : undefined
    return { ...row, id, user_id: null, is_public: true, image_url: entry.assets.poster,
      motion_preview_url: row.motion_preview_url && motion?.status === 'visual-approved' ? motion.preview : null,
      created_at: new Date(0).toISOString() }
  }))
}

export async function newLocalState(): Promise<AppState> {
  const id = crypto.randomUUID()
  return {
    version: 1, accountId: id, remoteUserId: null, email: '', revision: 0, remoteRevision: null, lastSyncedRevision: 0,
    tables: {
      profiles: [{
        id, full_name: '', username: `local_${id.slice(0, 8)}`, avatar_url: null,
        language: 'es', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        onboarding_done: false, subscription_tier: 'free', is_admin: false,
        account_status: 'active', suspension_reason: null, suspended_at: null, suspended_until: null,
        is_private: true, age: null, date_of_birth: null, gender: null, height_cm: null, weight_kg: null,
        fitness_level: 'beginner', primary_goal: 'build_muscle', days_per_week: 3,
        session_duration_minutes: 45, gym_type: 'full_gym', available_equipment: [], preferred_workout_days: [1, 3, 5],
        cardio_preferences: [], injuries: null, movement_limitations: [], readiness_status: 'pending',
        readiness_screening: {}, last_check_in_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }],
      exercises: await bundledExercises(), workout_plans: [], workouts: [], workout_exercises: [],
      progress_logs: [], exercise_logs: [], measurements: [],
      trainer_profiles: [], trainer_client_relationships: [], trainer_plan_assignments: [],
      product_notifications: [], dashboard_banners: [],
    },
  }
}

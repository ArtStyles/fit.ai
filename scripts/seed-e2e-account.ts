import { basename } from 'node:path'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

type Environment = Record<string, string | undefined>

export type E2ESeedConfig = {
  supabaseUrl: string
  serviceRoleKey: string
  email: string
  password: string
}

export interface E2EAccountStore {
  removePlanGenerationEvents(userId: string): Promise<void>
  removeWorkouts(userId: string): Promise<void>
  removeWorkoutPlans(userId: string): Promise<void>
  resetProfile(userId: string): Promise<void>
}

const PROFILE_RESET = {
  username: null,
  full_name: null,
  height_cm: null,
  weight_kg: null,
  date_of_birth: null,
  gender: null,
  fitness_level: null,
  primary_goal: null,
  onboarding_done: false,
  days_per_week: null,
  session_duration_minutes: null,
  gym_type: null,
  available_equipment: [],
  injuries: null,
  preferred_workout_days: null,
  cardio_preferences: [],
  activity_level: 'insufficiently_active',
  readiness_status: 'pending',
  readiness_answers: {},
  movement_limitations: [],
  readiness_version: null,
  readiness_completed_at: null,
  last_check_in_at: null,
  language: 'es',
  subscription_tier: 'free',
} as const

function requireValue(env: Environment, name: string): string {
  const value = env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function requireE2EConfig(env: Environment): E2ESeedConfig {
  const supabaseUrl = requireValue(env, 'NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = requireValue(env, 'SUPABASE_SERVICE_ROLE_KEY')
  const email = requireValue(env, 'E2E_USER_EMAIL').trim().toLowerCase()
  const password = requireValue(env, 'E2E_USER_PASSWORD')

  if (!email.endsWith('@example.test')) {
    throw new Error('E2E_USER_EMAIL must end in @example.test')
  }
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('E2E_USER_PASSWORD must contain at least 8 characters, a letter, and a number')
  }

  return { supabaseUrl, serviceRoleKey, email, password }
}

function assertQuery(error: { message: string } | null, operation: string): void {
  if (error) throw new Error(`${operation} failed: ${error.message}`)
}

function createAccountStore(supabase: SupabaseClient): E2EAccountStore {
  return {
    async removePlanGenerationEvents(userId) {
      const { error } = await supabase.from('plan_generation_events').delete().eq('user_id', userId)
      assertQuery(error, 'Resetting plan generation events')
    },
    async removeWorkouts(userId) {
      // workout_exercises are removed through the workout ON DELETE CASCADE FK.
      const { error } = await supabase.from('workouts').delete().eq('user_id', userId)
      assertQuery(error, 'Resetting workouts')
    },
    async removeWorkoutPlans(userId) {
      const { error } = await supabase.from('workout_plans').delete().eq('user_id', userId)
      assertQuery(error, 'Resetting workout plans')
    },
    async resetProfile(userId) {
      const { error } = await supabase.from('profiles').upsert({ id: userId, ...PROFILE_RESET })
      assertQuery(error, 'Resetting onboarding profile')
    },
  }
}

export async function resetE2EAccount(store: E2EAccountStore, userId: string): Promise<void> {
  // Events reference plans with ON DELETE SET NULL, so remove the account-scoped
  // event rows first. Workouts are removed before their parent plans so no
  // account-owned orphan workouts remain.
  await store.removePlanGenerationEvents(userId)
  await store.removeWorkouts(userId)
  await store.removeWorkoutPlans(userId)
  await store.resetProfile(userId)
}

async function findUserByEmail(supabase: SupabaseClient, email: string): Promise<User | null> {
  const perPage = 200
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    assertQuery(error, 'Listing E2E auth users')
    const match = data.users.find(user => user.email?.toLowerCase() === email)
    if (match) return match
    if (data.users.length < perPage) return null
  }
}

export async function seedE2EAccount(config: E2ESeedConfig): Promise<string> {
  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const existing = await findUserByEmail(supabase, config.email)

  const authResult = existing
    ? await supabase.auth.admin.updateUserById(existing.id, {
        password: config.password,
        email_confirm: true,
        user_metadata: { preferred_language: 'es' },
      })
    : await supabase.auth.admin.createUser({
        email: config.email,
        password: config.password,
        email_confirm: true,
        user_metadata: { preferred_language: 'es' },
      })

  assertQuery(authResult.error, existing ? 'Updating E2E auth user' : 'Creating E2E auth user')
  if (!authResult.data.user) throw new Error('Supabase did not return the E2E auth user')

  await resetE2EAccount(createAccountStore(supabase), authResult.data.user.id)
  return authResult.data.user.id
}

async function main(): Promise<void> {
  await seedE2EAccount(requireE2EConfig(process.env))
  console.log('E2E account seeded and isolated account data reset.')
}

if (process.argv[1] && /^seed-e2e-account\.(?:ts|js)$/.test(basename(process.argv[1]))) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Unknown E2E seed failure')
    process.exitCode = 1
  })
}

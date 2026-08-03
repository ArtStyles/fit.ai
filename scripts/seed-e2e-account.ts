import { basename } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type Environment = Record<string, string | undefined>

export type E2ESeedConfig = {
  supabaseUrl: string
  projectRef: string
  serviceRoleKey: string
  runId: string
  email: string
  password: string
}

export interface E2EAccountAdmin {
  findUserByEmail(email: string): Promise<{ id: string } | null>
  createUser(config: E2ESeedConfig): Promise<{ id: string }>
  updateUser(userId: string, config: E2ESeedConfig): Promise<void>
  removeSessionAuthorizations(userId: string): Promise<void>
  removePlanGenerationEvents(userId: string): Promise<void>
  removeProgressLogs(userId: string): Promise<void>
  removeWorkouts(userId: string): Promise<void>
  removeWorkoutPlans(userId: string): Promise<void>
  resetProfile(userId: string): Promise<void>
  deleteAuthUser(userId: string): Promise<void>
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
  const appSupabaseUrl = requireValue(env, 'NEXT_PUBLIC_SUPABASE_URL')
  const supabaseUrl = requireValue(env, 'E2E_SUPABASE_URL')
  const projectRef = requireValue(env, 'E2E_SUPABASE_PROJECT_REF').trim().toLowerCase()
  const serviceRoleKey = requireValue(env, 'SUPABASE_SERVICE_ROLE_KEY')
  const rawRunId = requireValue(env, 'E2E_RUN_ID')
  const email = requireValue(env, 'E2E_USER_EMAIL').trim().toLowerCase()
  const password = requireValue(env, 'E2E_USER_PASSWORD')

  let target: URL
  try {
    target = new URL(supabaseUrl)
  } catch {
    throw new Error('E2E_SUPABASE_URL must be a valid URL')
  }
  if (
    target.protocol !== 'https:' ||
    target.hostname !== `${projectRef}.supabase.co` ||
    target.pathname !== '/' ||
    target.search ||
    target.hash
  ) {
    throw new Error('E2E_SUPABASE_PROJECT_REF must match the E2E_SUPABASE_URL host')
  }
  if (new URL(appSupabaseUrl).origin !== target.origin) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must equal E2E_SUPABASE_URL')
  }

  const runId = rawRunId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!runId) throw new Error('E2E_RUN_ID must contain at least one letter or number')
  if (runId.length > 48) throw new Error('E2E_RUN_ID must sanitize to 48 characters or fewer')
  const expectedEmail = `e2e-${runId}@example.test`
  if (email !== expectedEmail) {
    throw new Error(`E2E_USER_EMAIL must equal ${expectedEmail}`)
  }
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('E2E_USER_PASSWORD must contain at least 8 characters, a letter, and a number')
  }

  return { supabaseUrl: target.origin, projectRef, serviceRoleKey, runId, email, password }
}

function assertQuery(error: { message: string } | null, operation: string): void {
  if (error) throw new Error(`${operation} failed: ${error.message}`)
}

const TRANSIENT_RETRY_ATTEMPTS = 3

function transientDelay(attempt: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, attempt * 500))
}

function isTransientSupabaseError(error: unknown): boolean {
  const cause = error instanceof Error && 'cause' in error
    ? (error as Error & { cause?: unknown }).cause
    : null
  const message = [
    error instanceof Error ? error.message : String(error),
    cause instanceof Error ? cause.message : '',
    typeof cause === 'object' && cause && 'code' in cause
      ? String((cause as { code?: unknown }).code)
      : '',
  ].join(' ')

  return /fetch failed|connect timeout|und_err_connect_timeout|econnreset|etimedout|network/i.test(message)
}

async function retryTransientSupabase<T>(operation: string, action: () => Promise<T>): Promise<T> {
  let lastError: unknown

  for (let attempt = 1; attempt <= TRANSIENT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await action()
    } catch (error) {
      lastError = error
      if (!isTransientSupabaseError(error) || attempt === TRANSIENT_RETRY_ATTEMPTS) throw error
      await transientDelay(attempt)
    }
  }

  throw lastError ?? new Error(`${operation} failed`)
}

async function findUserByEmail(supabase: SupabaseClient, email: string): Promise<{ id: string } | null> {
  const perPage = 200
  for (let page = 1; ; page += 1) {
    const data = await retryTransientSupabase('Listing E2E auth users', async () => {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
      assertQuery(error, 'Listing E2E auth users')
      return data
    })
    const match = data.users.find(user => user.email?.toLowerCase() === email)
    if (match) return { id: match.id }
    if (data.users.length < perPage) return null
  }
}

export function createE2EAccountAdmin(config: E2ESeedConfig): E2EAccountAdmin {
  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return {
    findUserByEmail: email => findUserByEmail(supabase, email),
    async createUser(seedConfig) {
      const data = await retryTransientSupabase('Creating E2E auth user', async () => {
        const { data, error } = await supabase.auth.admin.createUser({
          email: seedConfig.email,
          password: seedConfig.password,
          email_confirm: true,
          user_metadata: { preferred_language: 'es', e2e_run_id: seedConfig.runId },
        })
        assertQuery(error, 'Creating E2E auth user')
        return data
      })
      if (!data.user) throw new Error('Supabase did not return the E2E auth user')
      return { id: data.user.id }
    },
    async updateUser(userId, seedConfig) {
      await retryTransientSupabase('Updating E2E auth user', async () => {
        const { error } = await supabase.auth.admin.updateUserById(userId, {
          password: seedConfig.password,
          email_confirm: true,
          user_metadata: { preferred_language: 'es', e2e_run_id: seedConfig.runId },
        })
        assertQuery(error, 'Updating E2E auth user')
      })
    },
    async removeSessionAuthorizations(userId) {
      await retryTransientSupabase('Resetting session authorizations', async () => {
        const { error } = await supabase.from('session_authorizations').delete().eq('user_id', userId)
        assertQuery(error, 'Resetting session authorizations')
      })
    },
    async removePlanGenerationEvents(userId) {
      await retryTransientSupabase('Resetting plan generation events', async () => {
        const { error } = await supabase.from('plan_generation_events').delete().eq('user_id', userId)
        assertQuery(error, 'Resetting plan generation events')
      })
    },
    async removeProgressLogs(userId) {
      await retryTransientSupabase('Resetting progress logs', async () => {
        const { error } = await supabase.from('progress_logs').delete().eq('user_id', userId)
        assertQuery(error, 'Resetting progress logs')
      })
    },
    async removeWorkouts(userId) {
      // workout_exercises are removed through the workout ON DELETE CASCADE FK.
      await retryTransientSupabase('Resetting workouts', async () => {
        const { error } = await supabase.from('workouts').delete().eq('user_id', userId)
        assertQuery(error, 'Resetting workouts')
      })
    },
    async removeWorkoutPlans(userId) {
      await retryTransientSupabase('Resetting workout plans', async () => {
        const { error } = await supabase.from('workout_plans').delete().eq('user_id', userId)
        assertQuery(error, 'Resetting workout plans')
      })
    },
    async resetProfile(userId) {
      await retryTransientSupabase('Resetting onboarding profile', async () => {
        const { error } = await supabase.from('profiles').upsert({ id: userId, ...PROFILE_RESET })
        assertQuery(error, 'Resetting onboarding profile')
      })
    },
    async deleteAuthUser(userId) {
      await retryTransientSupabase('Deleting E2E auth user', async () => {
        const { error } = await supabase.auth.admin.deleteUser(userId)
        assertQuery(error, 'Deleting E2E auth user')
      })
    },
  }
}

type ResetStore = Pick<E2EAccountAdmin,
  'removeSessionAuthorizations' | 'removePlanGenerationEvents' | 'removeProgressLogs' | 'removeWorkouts' | 'removeWorkoutPlans' | 'resetProfile'>

export async function resetE2EAccount(store: ResetStore, userId: string): Promise<void> {
  // Authorization leases reference workouts/plans and are ephemeral fixture
  // state, so remove them first. Events reference plans with ON DELETE SET
  // NULL. Progress logs are removed before workouts so no
  // workout_id fields are nulled into stale same-day sessions. Workouts are
  // removed before their parent plans so no account-owned orphan workouts
  // remain.
  await store.removeSessionAuthorizations(userId)
  await store.removePlanGenerationEvents(userId)
  await store.removeProgressLogs(userId)
  await store.removeWorkouts(userId)
  await store.removeWorkoutPlans(userId)
  await store.resetProfile(userId)
}

export async function seedE2EAccount(
  config: E2ESeedConfig,
  admin = createE2EAccountAdmin(config),
): Promise<string> {
  const existing = await admin.findUserByEmail(config.email)
  const user = existing ?? await admin.createUser(config)
  if (existing) await admin.updateUser(existing.id, config)
  await resetE2EAccount(admin, user.id)
  return user.id
}

export async function cleanupE2EAccount(
  config: E2ESeedConfig,
  admin = createE2EAccountAdmin(config),
): Promise<boolean> {
  const user = await admin.findUserByEmail(config.email)
  if (!user) return false
  await resetE2EAccount(admin, user.id)
  await admin.deleteAuthUser(user.id)
  return true
}

export async function cleanupE2EAccountFromEnvironment(
  env: Environment,
  connect: (config: E2ESeedConfig) => E2EAccountAdmin = createE2EAccountAdmin,
): Promise<boolean> {
  const config = requireE2EConfig(env)
  return cleanupE2EAccount(config, connect(config))
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

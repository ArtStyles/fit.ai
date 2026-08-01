import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  requireE2EConfig,
  seedE2EAccount,
  type E2ESeedConfig,
} from '../../../scripts/seed-e2e-account'

type CoreLanguage = 'es' | 'en'

export type CoreProductFixture = {
  userId: string
  planId: string
  workoutId: string
  exerciseId: string
}

type QueryError = { message?: string } | null

function assertNoError(error: QueryError, operation: string): void {
  if (error) throw new Error(`${operation} failed: ${error.message ?? 'unknown error'}`)
}

const TRANSIENT_RETRY_ATTEMPTS = 3
const E2E_TIME_ZONE = 'America/Havana'
const ISO_WEEKDAY_BY_SHORT_NAME: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
}

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

function isoTodayForE2ETimeZone(): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: E2E_TIME_ZONE,
    weekday: 'short',
  }).format(new Date())

  const isoWeekday = ISO_WEEKDAY_BY_SHORT_NAME[weekday]
  if (!isoWeekday) {
    throw new Error(`Unable to resolve E2E ISO weekday for ${weekday}`)
  }
  return isoWeekday
}

function adminClient(config: E2ESeedConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function firstPublicStrengthExercise(supabase: SupabaseClient): Promise<{
  id: string
  name: string
  name_es: string | null
}> {
  const data = await retryTransientSupabase('Loading a public E2E exercise', async () => {
    const { data, error } = await supabase
      .from('exercises')
      .select('id, name, name_es')
      .eq('is_public', true)
      .eq('exercise_type', 'strength')
      .order('name')
      .limit(1)
      .maybeSingle()

    assertNoError(error, 'Loading a public E2E exercise')
    return data
  })
  if (!data) {
    throw new Error('E2E core fixture requires at least one public strength exercise seeded')
  }
  return data as { id: string; name: string; name_es: string | null }
}

async function clearProgressLogs(supabase: SupabaseClient, userId: string): Promise<void> {
  await retryTransientSupabase('Clearing E2E progress logs', async () => {
    const { error } = await supabase.from('progress_logs').delete().eq('user_id', userId)
    assertNoError(error, 'Clearing E2E progress logs')
  })
}

async function updateCoreProfile(
  supabase: SupabaseClient,
  userId: string,
  runId: string,
  language: CoreLanguage,
): Promise<void> {
  const username = `e2e_${runId.replace(/[^a-z0-9]+/g, '_').slice(0, 42)}`
  await retryTransientSupabase('Updating E2E core profile', async () => {
    const { error } = await supabase
      .from('profiles')
      .update({
        username,
        full_name: 'Vekira Demo',
        height_cm: 175,
        weight_kg: 70,
        date_of_birth: '1996-01-01',
        gender: 'other',
        fitness_level: 'beginner',
        primary_goal: 'stay_active',
        onboarding_done: true,
        days_per_week: 3,
        session_duration_minutes: 30,
        gym_type: 'home_no_equipment',
        available_equipment: [],
        preferred_workout_days: [isoTodayForE2ETimeZone()],
        cardio_preferences: ['walking'],
        activity_level: 'regularly_active',
        readiness_status: 'cleared',
        readiness_answers: {},
        movement_limitations: [],
        readiness_version: 'e2e-core-product-v1',
        readiness_completed_at: new Date().toISOString(),
        last_check_in_at: new Date().toISOString(),
        language,
        timezone: E2E_TIME_ZONE,
        subscription_tier: 'free',
      })
      .eq('id', userId)

    assertNoError(error, 'Updating E2E core profile')
  })
}

export async function seedCoreProductFixture(language: CoreLanguage = 'es'): Promise<CoreProductFixture> {
  const config = requireE2EConfig(process.env)
  const userId = await seedE2EAccount(config)
  const supabase = adminClient(config)
  await clearProgressLogs(supabase, userId)
  await updateCoreProfile(supabase, userId, config.runId, language)

  const exercise = await firstPublicStrengthExercise(supabase)
  const today = isoTodayForE2ETimeZone()
  const planId = randomUUID()
  const workoutId = randomUUID()

  await retryTransientSupabase('Creating E2E active plan', async () => {
    const { error } = await supabase.from('workout_plans').insert({
    id: planId,
    user_id: userId,
    name: 'E2E Evidence Week',
    description: 'Stable core-product acceptance plan.',
    goal: 'Stay active',
    duration_weeks: 1,
    days_per_week: 3,
    difficulty: 'beginner',
    is_active: true,
    generated_by_ai: false,
    ai_notes: 'Plan estable para validar el flujo principal.',
    week_number: 1,
    plan_context: 'first_plan',
    source_type: 'engine',
    generation_metadata: { source: 'core-product-e2e' },
    })
    assertNoError(error, 'Creating E2E active plan')
  })

  await retryTransientSupabase('Creating E2E workout', async () => {
    const { error } = await supabase.from('workouts').insert({
    id: workoutId,
    plan_id: planId,
    user_id: userId,
    name: 'E2E Full Body',
    focus: 'Piernas · Core',
    day_of_week: today,
    order_in_plan: 1,
    estimated_duration_minutes: 30,
    notes: 'Stable workout for browser acceptance.',
    })
    assertNoError(error, 'Creating E2E workout')
  })

  await retryTransientSupabase('Creating E2E workout exercise', async () => {
    const { error } = await supabase.from('workout_exercises').insert({
    id: randomUUID(),
    workout_id: workoutId,
    exercise_id: exercise.id,
    order_index: 1,
    sets: 2,
    reps: 10,
    duration_seconds: null,
    rest_seconds: 45,
    weight_kg: 40,
    notes: 'Registra una técnica controlada.',
    target_rpe: 7,
    weight_suggestion_basis: 'estimated_from_profile',
    })
    assertNoError(error, 'Creating E2E workout exercise')
  })

  return { userId, planId, workoutId, exerciseId: exercise.id }
}

async function createProgressLogFixture(
  supabase: SupabaseClient,
  fixture: CoreProductFixture,
  progressLogId: string,
  completedAt: string,
): Promise<void> {
  await retryTransientSupabase('Creating E2E progress log', async () => {
    const { error } = await supabase.from('progress_logs').insert({
      id: progressLogId,
      user_id: fixture.userId,
      workout_id: fixture.workoutId,
      completed_at: completedAt,
      duration_minutes: 28,
      mood_rating: 4,
    })
    assertNoError(error, 'Creating E2E progress log')
  })
}

async function createExerciseLogFixture(
  supabase: SupabaseClient,
  fixture: CoreProductFixture,
  progressLogId: string,
): Promise<void> {
  await retryTransientSupabase('Creating E2E exercise log', async () => {
    const { error } = await supabase.from('exercise_logs').insert({
      id: randomUUID(),
      progress_log_id: progressLogId,
      exercise_id: fixture.exerciseId,
      sets_completed: 2,
      reps_completed: [10, 9],
      weights_kg: [35, 35],
      rpe_values: [7, 8],
    })
    assertNoError(error, 'Creating E2E exercise log')
  })
}

export async function seedCoreProgressHistory(
  fixture: CoreProductFixture,
): Promise<{ progressLogId: string }> {
  const config = requireE2EConfig(process.env)
  const supabase = adminClient(config)
  const progressLogId = randomUUID()
  const completedAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  await createProgressLogFixture(supabase, fixture, progressLogId, completedAt)
  await createExerciseLogFixture(supabase, fixture, progressLogId)

  return { progressLogId }
}

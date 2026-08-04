import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  canMountSessionClient,
  canUseAuthorization,
  nextSessionAuthorizationState,
} from '../authorization'

const migration = readFileSync(
  new URL('../../../../supabase/migrations/038_session_authorizations.sql', import.meta.url),
  'utf8',
)
const contextMigration = readFileSync(
  new URL('../../../../supabase/migrations/036_completed_session_context.sql', import.meta.url),
  'utf8',
)
const databaseTypes = readFileSync(new URL('../../../types/database.ts', import.meta.url), 'utf8')
const sessionClient = readFileSync(
  new URL('../../../app/(app)/session/[workoutId]/SessionClient.tsx', import.meta.url),
  'utf8',
)

describe('session authorization validity', () => {
  const now = new Date('2026-08-02T12:00:00.000Z')
  const future = '2026-08-02T12:00:01.000Z'
  const past = '2026-08-02T11:59:59.000Z'

  it('accepts only an unconsumed matching authorization before its expiry', () => {
    expect(canUseAuthorization({
      expiresAt: future,
      consumedAt: null,
      userMatches: true,
      workoutMatches: true,
    }, now)).toBe(true)

    expect(canUseAuthorization({
      expiresAt: past,
      consumedAt: null,
      userMatches: true,
      workoutMatches: true,
    }, now)).toBe(false)

    expect(canUseAuthorization({
      expiresAt: future,
      consumedAt: now.toISOString(),
      userMatches: true,
      workoutMatches: true,
    }, now)).toBe(false)
  })

  it.each([
    { userMatches: false, workoutMatches: true },
    { userMatches: true, workoutMatches: false },
  ])('rejects a mismatched owner or workout', matches => {
    expect(canUseAuthorization({
      expiresAt: future,
      consumedAt: null,
      ...matches,
    }, now)).toBe(false)
  })
})

describe('client authorization state', () => {
  it('moves through retryable authorization states without treating an error as ready', () => {
    expect(nextSessionAuthorizationState('authorizing', 'succeeded')).toBe('ready')
    expect(nextSessionAuthorizationState('authorizing', 'failed')).toBe('error')
    expect(nextSessionAuthorizationState('error', 'retry')).toBe('authorizing')
    expect(nextSessionAuthorizationState('ready', 'failed')).toBe('ready')
  })

  it('mounts recovery UI for an owned inactive workout but not a missing workout', () => {
    expect(canMountSessionClient({ allowed: false, workout: { id: 'workout-old' } })).toBe(true)
    expect(canMountSessionClient({ allowed: false })).toBe(false)
    expect(canMountSessionClient({ allowed: true, workout: { id: 'workout-current' } })).toBe(true)
  })
})

describe('session authorization migration', () => {
  it('adds an own-row authorization table without destructive history operations', () => {
    expect(migration).toContain('CREATE TABLE public.session_authorizations')
    expect(migration).toMatch(/client_session_id UUID PRIMARY KEY/i)
    expect(migration).toMatch(/CREATE POLICY[\s\S]+auth\.uid\(\) = user_id/i)
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b/i)
    expect(migration).not.toMatch(/ALTER TABLE public\.(?:progress_logs|exercise_logs)[\s\S]+(?:DROP|NOT NULL)/i)
  })

  it('lets account and fixture cleanup cascade only ephemeral authorization leases', () => {
    expect(migration).toMatch(/workout_id UUID NOT NULL[\s\S]+REFERENCES public\.workouts\(id\) ON DELETE CASCADE/i)
    expect(migration).toMatch(/plan_id UUID NOT NULL[\s\S]+REFERENCES public\.workout_plans\(id\) ON DELETE CASCADE/i)
  })

  it('issues an exact server-side twelve-hour authorization under the plan lock', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.authorize_session_start')
    expect(migration).toContain("v_created_at + INTERVAL '12 hours'")
    expect(migration).toMatch(/pg_advisory_xact_lock[\s\S]+is_active = TRUE/i)
    expect(migration).toMatch(/jsonb_build_object\([\s\S]+'workout'[\s\S]+'plan'[\s\S]+'exercises'/i)
    expect(migration).toMatch(/consumed_at IS NOT NULL[\s\S]+progress_logs[\s\S]+RETURN v_existing\.session_context_snapshot/i)
  })

  it('reserves one user/day slot and treats consumed claims as daily evidence', () => {
    const authorize = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.authorize_session_start'),
      migration.indexOf('CREATE OR REPLACE FUNCTION public.save_session_log_atomic_v2'),
    )

    expect(migration).toMatch(/released_at TIMESTAMPTZ/i)
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX[\s\S]+\(user_id, policy_date\)[\s\S]+consumed_at IS NULL[\s\S]+released_at IS NULL/i,
    )
    expect(authorize).toMatch(
      /UPDATE public\.session_authorizations[\s\S]+SET released_at = v_created_at[\s\S]+expires_at <= v_created_at/i,
    )
    expect(authorize).toMatch(
      /policy_date = \(v_created_at AT TIME ZONE v_time_zone\)::DATE[\s\S]+consumed_at IS NOT NULL[\s\S]+SESSION_DAILY_LIMIT_REACHED/i,
    )
    expect(authorize).toMatch(
      /policy_date = \(v_created_at AT TIME ZONE v_time_zone\)::DATE[\s\S]+consumed_at IS NULL[\s\S]+released_at IS NULL[\s\S]+SESSION_DAILY_LIMIT_REACHED/i,
    )
  })

  it('locks and consumes authorization in the same atomic save as the winning rows', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.save_session_log_atomic_v2')
    expect(migration).toMatch(/session_authorizations[\s\S]+FOR UPDATE/i)
    expect(migration).toMatch(/IF v_inserted THEN[\s\S]+INSERT INTO public\.exercise_logs/i)
    expect(migration).toMatch(/IF v_inserted THEN[\s\S]+UPDATE public\.session_authorizations[\s\S]+consumed_at = NOW\(\)/i)
    expect(migration).toContain('session_context_snapshot')
    expect(migration).toContain('RETURN QUERY SELECT v_progress_log_id, v_inserted, v_result_snapshot')
  })

  it('rejects null IDs and uses null-safe exact workout binding', () => {
    expect(migration).toMatch(/save_session_log_atomic_v2[\s\S]+p_client_session_id IS NULL[\s\S]+p_workout_id IS NULL/i)
    expect(migration).toMatch(/v_authorization\.workout_id IS DISTINCT FROM p_workout_id/i)
    expect(migration).not.toMatch(/v_authorization\.workout_id\s*<>\s*p_workout_id/i)
    expect(migration).toMatch(/v_progress_workout_id IS DISTINCT FROM p_workout_id/i)
  })

  it('serializes daily saves before the authorization row and rechecks evidence without plan state', () => {
    const saveV2 = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.save_session_log_atomic_v2'))
    const advisory = saveV2.indexOf('pg_advisory_xact_lock')
    const authorizationLock = saveV2.indexOf('FROM public.session_authorizations')
    const progressInsert = saveV2.indexOf('INSERT INTO public.progress_logs')

    expect(advisory).toBeGreaterThan(0)
    expect(authorizationLock).toBeGreaterThan(advisory)
    expect(saveV2.indexOf('SESSION_DAILY_LIMIT_REACHED')).toBeGreaterThan(authorizationLock)
    expect(saveV2.indexOf('SESSION_WORKOUT_ALREADY_COMPLETED')).toBeGreaterThan(authorizationLock)
    expect(progressInsert).toBeGreaterThan(saveV2.indexOf('SESSION_DAILY_LIMIT_REACHED'))
    expect(saveV2).toContain('client_session_id IS DISTINCT FROM p_client_session_id')
    expect(saveV2).not.toMatch(/workout_plans|is_active\s*=\s*TRUE/i)
  })

  it('freezes the complete server-side calendar policy when authorization is issued', () => {
    expect(migration).toMatch(/policy_timezone TEXT NOT NULL/i)
    expect(migration).toMatch(/policy_date DATE NOT NULL/i)
    expect(migration).toMatch(/policy_day_start TIMESTAMPTZ NOT NULL/i)
    expect(migration).toMatch(/policy_day_end TIMESTAMPTZ NOT NULL/i)
    expect(migration).toMatch(/workout_window_start TIMESTAMPTZ NOT NULL/i)
    expect(migration).toMatch(/CHECK \(policy_day_start < policy_day_end\)/i)
    expect(migration).toMatch(/CHECK \(workout_window_start <= policy_day_start\)/i)

    const authorize = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.authorize_session_start'),
      migration.indexOf('CREATE OR REPLACE FUNCTION public.save_session_log_atomic_v2'),
    )
    expect(authorize).toMatch(/policy_timezone,[\s\S]+policy_date,[\s\S]+policy_day_start,[\s\S]+policy_day_end,[\s\S]+workout_window_start/i)
    expect(authorize).toMatch(/v_time_zone,[\s\S]+\(v_created_at AT TIME ZONE v_time_zone\)::DATE,[\s\S]+v_today_start,[\s\S]+v_today_end,[\s\S]+v_window_start/i)
  })

  it('uses only frozen authorization policy for a new save', () => {
    const saveV2 = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.save_session_log_atomic_v2'))
    expect(saveV2).not.toMatch(/FROM public\.profiles|FROM public\.workouts|pg_timezone_names/i)
    expect(saveV2).toMatch(/completed_at >= v_authorization\.workout_window_start[\s\S]+completed_at < v_authorization\.policy_day_end/i)
    expect(saveV2).toMatch(/completed_at >= v_authorization\.policy_day_start[\s\S]+completed_at < v_authorization\.policy_day_end/i)
    expect(saveV2).toMatch(/FROM public\.session_authorizations[\s\S]+user_id = v_user_id[\s\S]+policy_date = v_authorization\.policy_date[\s\S]+client_session_id IS DISTINCT FROM p_client_session_id[\s\S]+consumed_at IS NOT NULL/i)
    expect(saveV2).not.toMatch(/workout_id IS NOT NULL/i)
  })

  it('freezes every persisted exercise row in context without changing result snapshots', () => {
    const saveV2 = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.save_session_log_atomic_v2'))
    const snapshotBuild = saveV2.slice(
      saveV2.indexOf('Keep the workout/plan metadata'),
      saveV2.indexOf('Recover a save that committed'),
    )

    expect(saveV2).toMatch(/jsonb_to_recordset\(COALESCE\(p_exercise_logs/i)
    expect(snapshotBuild).toMatch(/jsonb_array_elements\([\s\S]+session_context_snapshot->'exercises'/i)
    expect(snapshotBuild).not.toMatch(/DISTINCT ON\s*\(item\.exercise_id\)/i)
    expect(snapshotBuild).toMatch(/jsonb_agg\(actual\.exercise_context ORDER BY actual\.ordinality\)/i)
    expect(snapshotBuild).not.toMatch(/WHERE item\.sets_completed/i)
    expect(snapshotBuild).toMatch(/JOIN public\.exercises AS exercise ON exercise\.id = item\.exercise_id/i)
    expect(snapshotBuild).toMatch(/jsonb_build_object\([\s\S]+'exerciseId', exercise\.id/i)
    expect(snapshotBuild).toMatch(/'muscleGroups', COALESCE\(exercise\.muscle_groups, ARRAY\[\]::TEXT\[\]\)/i)
    expect(snapshotBuild).toMatch(/'isCompound', COALESCE\(exercise\.is_compound, FALSE\)/i)
    expect(saveV2).toMatch(/jsonb_set\([\s\S]+session_context_snapshot[\s\S]+'\{exercises\}'/i)
    expect(saveV2).toMatch(/session_context_snapshot,[\s\S]+v_session_context_snapshot/i)
    expect(saveV2).toMatch(/session_result_snapshot,[\s\S]+p_result_snapshot/i)
  })

  it('makes completed evidence non-deletable over REST and snapshots write-once', () => {
    expect(contextMigration).toMatch(/ADD COLUMN session_detail_backup JSONB/i)
    expect(contextMigration).toMatch(
      /OLD\.session_context_snapshot IS NOT NULL[\s\S]+NEW\.session_context_snapshot IS DISTINCT FROM OLD\.session_context_snapshot[\s\S]+SESSION_CONTEXT_SNAPSHOT_IMMUTABLE/i,
    )
    expect(contextMigration).toMatch(
      /OLD\.session_result_snapshot IS NOT NULL[\s\S]+NEW\.session_result_snapshot IS DISTINCT FROM OLD\.session_result_snapshot[\s\S]+SESSION_RESULT_SNAPSHOT_IMMUTABLE/i,
    )
    expect(contextMigration).toMatch(
      /OLD\.session_detail_backup IS NOT NULL[\s\S]+NEW\.session_detail_backup IS DISTINCT FROM OLD\.session_detail_backup[\s\S]+SESSION_DETAIL_BACKUP_IMMUTABLE/i,
    )
    expect(contextMigration).toMatch(
      /NEW\.completed_at IS DISTINCT FROM OLD\.completed_at[\s\S]+SESSION_EVIDENCE_IMMUTABLE/i,
    )
    expect(contextMigration).toMatch(
      /CREATE TRIGGER trg_completed_session_snapshot_immutability[\s\S]+BEFORE UPDATE ON public\.progress_logs/i,
    )
    expect(contextMigration).toMatch(
      /CREATE TRIGGER trg_exercise_log_immutability[\s\S]+BEFORE UPDATE ON public\.exercise_logs/i,
    )
    expect(contextMigration).toMatch(
      /REVOKE ALL ON TABLE public\.progress_logs, public\.exercise_logs FROM anon, authenticated/i,
    )
    expect(contextMigration).toMatch(/GRANT SELECT, INSERT, UPDATE ON TABLE public\.progress_logs TO authenticated/i)
    expect(contextMigration).toMatch(/GRANT SELECT, INSERT ON TABLE public\.exercise_logs TO authenticated/i)
    expect(contextMigration).not.toMatch(/CREATE POLICY[^;]+(?:progress_logs|exercise_logs)[\s\S]+FOR DELETE/i)
    expect(contextMigration).not.toMatch(/CREATE POLICY "exercise_logs: own update"/i)
  })

  it('validates completion timestamps without using them to choose the daily slot', () => {
    const saveV2 = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.save_session_log_atomic_v2'))
    expect(saveV2).toMatch(/p_completed_at IS NULL[\s\S]+SESSION_COMPLETED_AT_INVALID/i)
    expect(saveV2).toMatch(/p_completed_at < v_authorization\.created_at - INTERVAL '15 minutes'/i)
    expect(saveV2).toMatch(/p_completed_at > LEAST\([\s\S]+v_authorization\.expires_at[\s\S]+v_save_at \+ INTERVAL '5 minutes'/i)
    const validationEnd = saveV2.indexOf('END IF;', saveV2.indexOf('SESSION_COMPLETED_AT_INVALID')) + 7
    const slotChecks = saveV2.slice(validationEnd, saveV2.indexOf('INSERT INTO public.progress_logs'))
    expect(slotChecks).not.toMatch(/p_completed_at/)
  })

  it('reconciles an exact preexisting progress row without replaying details', () => {
    const saveV2 = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.save_session_log_atomic_v2'))
    expect(saveV2).toMatch(/IF NOT v_inserted THEN[\s\S]+session_context_snapshot = COALESCE\([\s\S]+v_session_context_snapshot/i)
    expect(saveV2).toMatch(/UPDATE public\.session_authorizations[\s\S]+consumed_at = COALESCE\(consumed_at, NOW\(\)\)/i)
    expect(saveV2).toMatch(/IF v_inserted THEN[\s\S]+INSERT INTO public\.exercise_logs/i)
    const exactRecovery = saveV2.indexOf('Recover a save that committed through a legacy client')
    const exactReturn = saveV2.indexOf('RETURN QUERY SELECT v_progress_log_id, FALSE', exactRecovery)
    expect(saveV2.indexOf('IF v_authorization.expires_at <=', exactReturn)).toBeGreaterThan(exactReturn)
  })

  it('publishes the authorization table and both RPC contracts in database types', () => {
    expect(databaseTypes).toContain('session_authorizations:')
    expect(databaseTypes).toContain('authorize_session_start:')
    expect(databaseTypes).toContain('save_session_log_atomic_v2:')
    expect(databaseTypes).toMatch(/session_authorizations:[\s\S]+policy_timezone: string[\s\S]+policy_date: string[\s\S]+policy_day_start: string[\s\S]+policy_day_end: string[\s\S]+workout_window_start: string/i)
  })

  it('translates safe authorization errors at the client boundary', () => {
    expect(sessionClient).toContain('setAuthorizationError(t(result.error))')
  })
})

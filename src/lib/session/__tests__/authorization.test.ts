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

  it('issues an exact server-side twelve-hour authorization under the plan lock', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.authorize_session_start')
    expect(migration).toContain("v_created_at + INTERVAL '12 hours'")
    expect(migration).toMatch(/pg_advisory_xact_lock[\s\S]+is_active = TRUE/i)
    expect(migration).toMatch(/jsonb_build_object\([\s\S]+'workout'[\s\S]+'plan'[\s\S]+'exercises'/i)
    expect(migration).toMatch(/consumed_at IS NOT NULL[\s\S]+progress_logs[\s\S]+RETURN v_existing\.session_context_snapshot/i)
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

  it('anchors the daily policy window to the server-issued authorization day', () => {
    const saveV2 = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.save_session_log_atomic_v2'))
    expect(saveV2).toMatch(/v_policy_at\s+TIMESTAMPTZ/i)
    expect(saveV2).toMatch(/v_policy_at\s*:=\s*v_authorization\.created_at/i)
    expect(saveV2).toMatch(/v_policy_at AT TIME ZONE v_time_zone/i)
  })

  it('reconciles an exact preexisting progress row without replaying details', () => {
    const saveV2 = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.save_session_log_atomic_v2'))
    expect(saveV2).toMatch(/IF NOT v_inserted THEN[\s\S]+session_context_snapshot = COALESCE\([\s\S]+v_authorization\.session_context_snapshot/i)
    expect(saveV2).toMatch(/UPDATE public\.session_authorizations[\s\S]+consumed_at = COALESCE\(consumed_at, NOW\(\)\)/i)
    expect(saveV2).toMatch(/IF v_inserted THEN[\s\S]+INSERT INTO public\.exercise_logs/i)
  })

  it('publishes the authorization table and both RPC contracts in database types', () => {
    expect(databaseTypes).toContain('session_authorizations:')
    expect(databaseTypes).toContain('authorize_session_start:')
    expect(databaseTypes).toContain('save_session_log_atomic_v2:')
  })

  it('translates safe authorization errors at the client boundary', () => {
    expect(sessionClient).toContain('setAuthorizationError(t(result.error))')
  })
})

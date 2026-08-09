import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../../../supabase/migrations/044_trainer_insights.sql', import.meta.url),
  'utf8',
)
const databaseTypes = readFileSync(new URL('../../../types/database.ts', import.meta.url), 'utf8')

describe('trainer insights migration', () => {
  it('exposes summary and detail only through definer RPCs with a fixed search path', () => {
    for (const functionName of ['get_coach_clients_summary', 'get_coach_client_insights']) {
      expect(migration).toMatch(new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${functionName}\\([\\s\\S]+?SECURITY DEFINER[\\s\\S]+?SET search_path = public, pg_temp`,
        'i',
      ))
      expect(migration).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${functionName}`, 'i'))
      expect(databaseTypes).toContain(`${functionName}: {`)
    }
  })

  it('guards the detail before sensitive reads and returns one generic access error', () => {
    const rpc = migration.match(/CREATE OR REPLACE FUNCTION public\.get_coach_client_insights\([\s\S]+?END;\n\$\$;/i)?.[0]
    expect(rpc).toBeDefined()

    const scopeGuard = rpc!.indexOf("has_active_coaching_scope(v_trainer_id, p_client_id, 'training_profile')")
    const sensitiveRead = rpc!.indexOf('FROM public.progress_logs')
    expect(scopeGuard).toBeGreaterThanOrEqual(0)
    expect(sensitiveRead).toBeGreaterThan(scopeGuard)
    expect(rpc).toMatch(/RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COACH_CLIENT_INSIGHTS_UNAVAILABLE'/i)
  })

  it('limits insight ranges, projects the versioned payload and never reads measurements', () => {
    const rpc = migration.match(/CREATE OR REPLACE FUNCTION public\.get_coach_client_insights\([\s\S]+?END;\n\$\$;/i)?.[0]
    expect(rpc).toBeDefined()
    expect(rpc).toMatch(/p_to_date - p_from_date >= 180/i)
    expect(rpc).toMatch(/'schemaVersion', 1/i)
    expect(rpc).toMatch(/'measurements', NULL/i)
    expect(rpc).not.toMatch(/(?:FROM|JOIN)\s+public\.measurements\b/i)
    expect(rpc).not.toMatch(/SELECT\s+\*/i)
    expect(rpc).toMatch(/session_context_snapshot/i)
  })

  it('anchors professional evidence to a consumed authorization instead of a progress-log snapshot', () => {
    const rpc = migration.match(/CREATE OR REPLACE FUNCTION public\.get_coach_client_insights\([\s\S]+?END;\n\$\$;/i)?.[0]
    expect(rpc).toBeDefined()
    expect(rpc).toMatch(/JOIN public\.session_authorizations AS session_authorization[\s\S]+session_authorization\.client_session_id = progress_log\.client_session_id[\s\S]+session_authorization\.user_id = progress_log\.user_id[\s\S]+session_authorization\.consumed_at IS NOT NULL[\s\S]+session_authorization\.released_at IS NULL/i)
    expect(rpc).toMatch(/workout\.plan_id = plan\.id[\s\S]+plan\.prescription_locked = TRUE[\s\S]+version\.materialized_plan_id = plan\.id/i)
    expect(rpc).toMatch(/progress_log\.workout_id IS NULL OR progress_log\.workout_id = session_authorization\.workout_id/i)
    expect(rpc).not.toMatch(/progress_log\.session_context_snapshot->'plan'->>'trainerAssignmentVersionId'/i)
  })

  it('adds narrowly scoped lookup indexes without granting coaches direct sensitive-table access', () => {
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS coaching_relationships_trainer_active_started_idx/i)
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS coaching_consents_active_scope_lookup_idx/i)
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS trainer_assignment_versions_assignment_effective_idx/i)
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS progress_logs_user_completed_insights_idx/i)

    for (const table of ['profiles', 'progress_logs', 'exercise_logs', 'measurements']) {
      expect(migration).not.toMatch(new RegExp(`GRANT .* ON TABLE public\\.${table} TO authenticated`, 'i'))
      expect(migration).not.toMatch(new RegExp(`CREATE POLICY [\\s\\S]{0,1200}coach[\\s\\S]{0,1200}ON public\\.${table}`, 'i'))
    }
  })
})

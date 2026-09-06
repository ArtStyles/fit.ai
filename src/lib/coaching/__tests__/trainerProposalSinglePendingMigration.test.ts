import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationUrl = new URL(
  '../../../../supabase/migrations/059_trainer_assignment_single_pending.sql',
  import.meta.url,
)
const migration = existsSync(migrationUrl)
  ? readFileSync(migrationUrl, 'utf8').replace(/\r\n?/g, '\n')
  : ''
const tapUrl = new URL(
  '../../../../supabase/tests/059_trainer_assignment_single_pending_test.sql',
  import.meta.url,
)
const tap = existsSync(tapUrl) ? readFileSync(tapUrl, 'utf8').replace(/\r\n?/g, '\n') : ''
const runner = readFileSync(
  new URL('../../../../scripts/test-trainer-programming-db.mjs', import.meta.url),
  'utf8',
).replace(/\r\n?/g, '\n')
const readme = readFileSync(new URL('../../../../README.md', import.meta.url), 'utf8')
const runbook = readFileSync(
  new URL('../../../../docs/operations/trainer-marketplace-runbook.md', import.meta.url),
  'utf8',
)
const pilotChecklist = readFileSync(
  new URL('../../../../docs/operations/trainer-pilot-checklist.md', import.meta.url),
  'utf8',
)

function proposalRpc(source: string): string {
  return source.match(
    /CREATE OR REPLACE FUNCTION public\.propose_trainer_assignment\([\s\S]+?END;\n\$\$;/i,
  )?.[0] ?? ''
}

describe('trainer assignment single-pending migration', () => {
  it('serializes by client, preserves exact-key retries, then rejects other pending or active assignments', () => {
    const rpc = proposalRpc(migration)
    const clientLock = rpc.indexOf('pg_advisory_xact_lock(hashtextextended(v_client_user_id::TEXT, 0))')
    const trainerLock = rpc.indexOf('pg_advisory_xact_lock(hashtextextended(v_trainer_user_id::TEXT, 0))')
    const exactRetry = rpc.indexOf('assignment.proposal_idempotency_key = BTRIM(p_idempotency_key)')
    const retryReturn = rpc.indexOf('RETURN QUERY SELECT v_assignment_id, v_assignment_version_id, v_workout_plan_id;', exactRetry)
    const activeGuard = rpc.indexOf("assignment.status = 'active'", retryReturn)
    const proposedGuard = rpc.indexOf("assignment.status = 'proposed'", retryReturn)

    expect(rpc).not.toBe('')
    expect(clientLock).toBeGreaterThanOrEqual(0)
    expect(trainerLock).toBeGreaterThan(clientLock)
    expect(exactRetry).toBeGreaterThan(trainerLock)
    expect(retryReturn).toBeGreaterThan(exactRetry)
    expect(activeGuard).toBeGreaterThan(retryReturn)
    expect(proposedGuard).toBeGreaterThan(retryReturn)
    expect(rpc).toContain("RAISE EXCEPTION 'TRAINER_ASSIGNMENT_ACTIVE_EXISTS'")
    expect(rpc).toContain("RAISE EXCEPTION 'TRAINER_ASSIGNMENT_PROPOSAL_EXISTS'")
  })

  it('retains the RPC security boundary and advances the professional preflight marker', () => {
    expect(migration).toMatch(/LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public, pg_temp/i)
    expect(migration).toContain('ALTER FUNCTION public.propose_trainer_assignment(UUID, UUID, TEXT, TEXT) OWNER TO postgres')
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.propose_trainer_assignment(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role CASCADE')
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.propose_trainer_assignment(UUID, UUID, TEXT, TEXT) TO authenticated, service_role')
    expect(migration).toMatch(/procedure\.oid = 'public\.propose_trainer_assignment\(uuid,uuid,text,text\)'::REGPROCEDURE[\s\S]+procedure\.prosecdef[\s\S]+procedure\.proconfig = ARRAY\['search_path=public, pg_temp'\]::TEXT\[\][\s\S]+owner_role\.rolname = 'postgres'/i)
    expect(migration).toMatch(/RETURN 59;/)
  })

  it('ships sequential and concurrent behavioral coverage with exact durable side-effect counts', () => {
    expect(tap).toContain('TRAINER_ASSIGNMENT_PROPOSAL_EXISTS')
    expect(tap).toContain('same-key retry returns the original assignment, version, and plan')
    for (const label of [
      'one pending assignment remains',
      'one assignment version remains',
      'one professional plan remains',
      'one proposed audit remains',
      'one proposed notification remains',
    ]) expect(tap).toContain(label)

    expect(runner).toContain('differentKeyProposalRaceSql')
    expect(runner).toContain('proposal_different_key_a')
    expect(runner).toContain('proposal_different_key_b')
    expect(runner).toContain('TRAINER_ASSIGNMENT_PROPOSAL_EXISTS')
    for (const table of [
      'trainer_plan_assignments',
      'trainer_assignment_versions',
      'workout_plans',
      'workouts',
      'workout_exercises',
      'professional_audit_logs',
      'product_notifications',
    ]) expect(runner).toContain(`FROM public.${table}`)
  })

  it('runs and documents 059 after every historical migration that can restore an older preflight', () => {
    expect(runner).toMatch(/058_training_profile_consent_regrant\.sql[\s\S]+059_trainer_assignment_single_pending\.sql/i)
    expect(runner).toContain("runPsql(readMigration('059_trainer_assignment_single_pending.sql'), 'reapplying migration 059 for rerunnability')")
    expect(runner).toMatch(/reapplying migration 058 against durable consent evidence[\s\S]+restoring migration 059 after historical 058 rerun/i)
    expect(runner).toContain('running 059 trainer assignment single-pending pgTAP suite')
    expect(runner).toContain('PASS: trainer migrations 040-051, 053, 056-059 behavior and rerunnability passed')
    expect(readme).toContain('trainer_security_preflight() = 59')
    expect(runbook).toContain('040–059')
    expect(pilotChecklist).toContain('040–059')
  })
})

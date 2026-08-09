import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../../../supabase/migrations/045_trainer_hardening.sql', import.meta.url),
  'utf8',
)

describe('trainer security migration marker', () => {
  it('exposes a read-only authenticated 045 preflight that validates every required routine', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.trainer_security_preflight\(\)[\s\S]+?RETURNS INTEGER[\s\S]+?LANGUAGE plpgsql[\s\S]+?STABLE[\s\S]+?SET search_path = public, pg_temp/i)
    for (const signature of [
      'prepare_trainer_credential_removal(uuid,uuid)',
      'accept_coaching_request(uuid,uuid)',
      'end_coaching_relationship(uuid,text,uuid)',
      'propose_trainer_assignment(uuid,uuid,text,text)',
      'accept_trainer_assignment(uuid,text)',
      'publish_trainer_assignment_revision(uuid,uuid,text,text)',
      'get_coach_client_insights(uuid,date,date)',
    ]) expect(migration).toContain(`to_regprocedure('public.${signature}')`)
    expect(migration).toMatch(/RAISE EXCEPTION 'TRAINER_SECURITY_SCHEMA_INCOMPLETE'/i)
    expect(migration).toMatch(/RETURN 45/i)
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.trainer_security_preflight\(\) FROM PUBLIC, anon/i)
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.trainer_security_preflight\(\) TO authenticated, service_role/i)
  })
})

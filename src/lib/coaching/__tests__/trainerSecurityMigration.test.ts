import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../../../supabase/migrations/045_trainer_hardening.sql', import.meta.url),
  'utf8',
)

describe('trainer security migration marker', () => {
  it('exposes a read-only authenticated 045 preflight with a fixed search path', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.trainer_security_preflight\(\)[\s\S]+?RETURNS INTEGER[\s\S]+?LANGUAGE sql[\s\S]+?STABLE[\s\S]+?SET search_path = public, pg_temp[\s\S]+?SELECT 45/i)
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.trainer_security_preflight\(\) FROM PUBLIC, anon/i)
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.trainer_security_preflight\(\) TO authenticated, service_role/i)
  })
})

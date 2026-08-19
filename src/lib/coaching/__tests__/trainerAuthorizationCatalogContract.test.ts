import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const authorizationCatalog = readFileSync(
  new URL('../../../../supabase/tests/trainer_authorization_test.sql', import.meta.url),
  'utf8',
)

describe('trainer authorization catalog contract', () => {
  it('keeps the pg_temp rule global and scopes the inherited search path exception by exact signature', () => {
    const globalGate = authorizationCatalog.match(
      /SELECT ok\(NOT EXISTS \([\s\S]+?'every effective public SECURITY DEFINER function pins a trusted search_path except the two reviewed 048 trigger functions'\s*\);/i,
    )?.[0]

    expect(globalGate).toBeDefined()
    expect(globalGate).toMatch(/'public\.guard_profile_weight_derived\(\)'::regprocedure/i)
    expect(globalGate).toMatch(/'public\.sync_profile_weight_from_measurements\(\)'::regprocedure/i)
    expect(globalGate).not.toContain("OR setting = 'search_path=pg_catalog, public'")
  })

  it('exhaustively fixes the two inherited search path exceptions as trigger functions', () => {
    const exceptionInventory = authorizationCatalog.match(
      /SELECT set_eq\([\s\S]+?'only the two reviewed 048 trigger functions use the inherited pg_catalog public search_path'\s*\);/i,
    )?.[0]

    expect(exceptionInventory).toBeDefined()
    expect(exceptionInventory).toContain("('guard_profile_weight_derived()|trigger')")
    expect(exceptionInventory).toContain("('sync_profile_weight_from_measurements()|trigger')")
    expect(exceptionInventory).toMatch(/pg_get_function_result\(function\.oid\)/i)
  })

  it('describes the reviewed anonymous trigger grants without claiming authenticated-service-only exposure', () => {
    expect(authorizationCatalog).toContain(
      'effective function ACLs expose only the reviewed API-role entry points, including inherited anonymous trigger grants',
    )
    expect(authorizationCatalog).not.toContain(
      'effective function ACLs expose only the reviewed authenticated/service entry points',
    )
  })
})

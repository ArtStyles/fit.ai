import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationNames = [
  '040_trainer_foundations.sql',
  '041_trainer_verification.sql',
  '042_trainer_relationships.sql',
  '043_trainer_programming.sql',
  '044_trainer_insights.sql',
  '045_trainer_hardening.sql',
] as const

const migrations = migrationNames.map(name => readFileSync(
  new URL(`../../../../supabase/migrations/${name}`, import.meta.url),
  'utf8',
))
const history = migrations.join('\n')
const hardening = migrations.at(-1) ?? ''

type IndexContract = {
  name: string
  table: string
  keys: RegExp
  predicate?: RegExp
}

const establishedContracts: IndexContract[] = [
  { name: 'trainer_profiles_status_created_idx', table: 'trainer_profiles', keys: /status\s*,\s*created_at\s+DESC\s*,\s*id\s+DESC/i },
  { name: 'trainer_service_offerings_profile_active_idx', table: 'trainer_service_offerings', keys: /trainer_profile_id\s*,\s*is_active\s*,\s*created_at\s+DESC\s*,\s*id\s+DESC/i },
  { name: 'coaching_requests_trainer_pending_created_idx', table: 'coaching_requests', keys: /trainer_user_id\s*,\s*created_at\s+DESC\s*,\s*id\s+DESC/i, predicate: /status\s*=\s*'pending'/i },
  { name: 'coaching_relationships_trainer_status_idx', table: 'coaching_relationships', keys: /trainer_user_id\s*,\s*status\s*,\s*created_at\s+DESC\s*,\s*id\s+DESC/i },
  { name: 'coaching_relationships_client_status_idx', table: 'coaching_relationships', keys: /client_user_id\s*,\s*status\s*,\s*created_at\s+DESC\s*,\s*id\s+DESC/i },
  { name: 'coaching_consents_active_scope_lookup_idx', table: 'coaching_consents', keys: /relationship_id\s*,\s*scope\s*,\s*granted_at\s+DESC\s*,\s*id\s+DESC/i, predicate: /revoked_at\s+IS\s+NULL/i },
  { name: 'trainer_assignment_versions_assignment_effective_idx', table: 'trainer_assignment_versions', keys: /assignment_id\s*,\s*effective_from\s+DESC\s*,\s*effective_to\s*,\s*id\s+DESC/i },
  { name: 'product_notifications_user_unread_idx', table: 'product_notifications', keys: /user_id\s*,\s*created_at\s+DESC/i, predicate: /read_at\s+IS\s+NULL/i },
  { name: 'progress_logs_user_completed_insights_idx', table: 'progress_logs', keys: /user_id\s*,\s*completed_at\s+DESC\s*,\s*id\s+DESC/i },
]

const finalContracts: IndexContract[] = [
  { name: 'workouts_plan_schedule_idx', table: 'workouts', keys: /plan_id\s*,\s*day_of_week\s*,\s*order_in_plan\s*,\s*id/i },
]

function indexStatement(sql: string, name: string) {
  return sql.match(new RegExp(
    `CREATE\\s+(?:UNIQUE\\s+)?INDEX(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${name}\\b[\\s\\S]*?;`,
    'i',
  ))?.[0]
}

function expectIndex(sql: string, contract: IndexContract) {
  const statement = indexStatement(sql, contract.name)
  expect(statement, `${contract.name} must exist`).toBeDefined()
  expect(statement, `${contract.name} must target ${contract.table}`).toMatch(
    new RegExp(`ON\\s+public\\.${contract.table}\\s*\\(`, 'i'),
  )
  expect(statement, `${contract.name} must preserve its key order`).toMatch(contract.keys)
  if (contract.predicate) expect(statement, `${contract.name} must preserve its predicate`).toMatch(contract.predicate)
}

describe('trainer marketplace hardening indexes', () => {
  it('preserves the established indexes used by requests, relationships, consent and insight evidence', () => {
    for (const contract of establishedContracts) expectIndex(history, contract)
    expect(history).toMatch(/slug\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i)
  })

  it('adds only rerunnable final indexes for measured product query gaps', () => {
    for (const contract of finalContracts) {
      expectIndex(hardening, contract)
      expect(indexStatement(hardening, contract.name)).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS/i)
    }
  })

  it('materializes normalized client timezones once per relationship in the measured summary RPC', () => {
    const summaryRpc = hardening.match(/CREATE OR REPLACE FUNCTION public\.get_coach_clients_summary\([\s\S]+?END;\n\$\$;/i)?.[0]
    expect(summaryRpc).toBeDefined()
    expect(summaryRpc).toMatch(/normalized_client_timezones\s+AS\s+MATERIALIZED/i)
    expect(summaryRpc).toMatch(/pg_catalog\.pg_timezone_names/i)
    expect(summaryRpc).toMatch(/JOIN normalized_client_timezones AS client_timezone[\s\S]+client_timezone\.relationship_id = relationship\.id/i)
    expect(summaryRpc).toMatch(/locked_trainer_account\s+AS\s+MATERIALIZED[\s\S]+FOR SHARE OF trainer_account/i)
    expect(summaryRpc).toMatch(/locked_trainer_authority\s+AS\s+MATERIALIZED[\s\S]+FOR SHARE OF trainer_profile/i)
    expect(summaryRpc).toMatch(/locked_client_accounts\s+AS\s+MATERIALIZED[\s\S]+JOIN LATERAL\s*\([\s\S]+FROM public\.profiles AS client_account[\s\S]+client_account\.id = scope\.client_user_id[\s\S]+LIMIT 1[\s\S]+FOR SHARE OF client_account/i)
    expect(summaryRpc).toMatch(/locked_client_scopes\s+AS\s+MATERIALIZED[\s\S]+relationship\.trainer_user_id = v_trainer_id[\s\S]+training_consent\.scope = 'training_profile'[\s\S]+FOR SHARE OF relationship, training_consent/i)
    expect(summaryRpc).toMatch(/RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COACH_CLIENT_INSIGHTS_UNAVAILABLE'/i)
    expect(summaryRpc).toMatch(/SECURITY DEFINER[\s\S]+SET search_path = public, pg_temp/i)
    expect(hardening).toMatch(/ALTER FUNCTION public\.get_coach_clients_summary\(\) OWNER TO postgres/i)
    expect(hardening).toMatch(/REVOKE ALL ON FUNCTION public\.get_coach_clients_summary\(\) FROM PUBLIC, anon, authenticated, service_role/i)
    expect(hardening).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_coach_clients_summary\(\) TO authenticated/i)
  })

  it('forces the measured detail workout projection through the plan schedule index', () => {
    const detailRpc = hardening.match(/CREATE OR REPLACE FUNCTION public\.get_coach_client_insights\([\s\S]+?END;\n\$\$;/i)?.[0]
    expect(detailRpc).toBeDefined()
    expect(detailRpc).toMatch(/LEFT JOIN LATERAL\s*\([\s\S]+FROM public\.workouts AS indexed_workout[\s\S]+indexed_workout\.plan_id = version\.materialized_plan_id[\s\S]+LIMIT 1[\s\S]+\) AS materialized_workout ON TRUE/i)
    expect(detailRpc).toMatch(/indexed_workout\.day_of_week\s*=\s*NULLIF\(workout\.value->>'dayOfWeek', ''\)::INTEGER\s*-\s*1/i)
    expect(detailRpc).toMatch(/SECURITY DEFINER[\s\S]+SET search_path = public, pg_temp/i)
    expect(detailRpc).toMatch(/JOIN public\.coaching_consents AS training_consent[\s\S]+training_consent\.scope = 'training_profile'[\s\S]+training_consent\.revoked_at IS NULL/i)
    expect(detailRpc).toMatch(/trainer_profile\.status = 'active'[\s\S]+trainer_account\.account_status = 'active'[\s\S]+client_account\.account_status = 'active'/i)
    expect(detailRpc).toMatch(/FOR SHARE OF relationship, trainer_profile, trainer_account, client_account, training_consent/i)
    expect(detailRpc).toMatch(/p_to_date - p_from_date >= 180/i)
    expect(detailRpc).toMatch(/'measurements', NULL/i)
    expect(detailRpc).not.toMatch(/(?:FROM|JOIN)\s+public\.measurements\b/i)
    expect(detailRpc).toMatch(/plan\.prescription_locked = TRUE/i)
    expect(detailRpc).toMatch(/assignment\.status = 'active'/i)
    expect(detailRpc).toMatch(/version\.status IN \('active', 'superseded'\)/i)
    expect(detailRpc).toMatch(/ORDER BY version\.effective_from ASC, version\.version_number ASC,[\s\S]+NULLIF\(workout\.value->>'dayOfWeek', ''\)::INTEGER,[\s\S]+NULLIF\(workout\.value->>'orderInPlan', ''\)::INTEGER/i)
    expect(hardening).toMatch(/ALTER FUNCTION public\.get_coach_client_insights\(UUID, DATE, DATE\) OWNER TO postgres/i)
    expect(hardening).toMatch(/REVOKE ALL ON FUNCTION public\.get_coach_client_insights\(UUID, DATE, DATE\) FROM PUBLIC, anon, authenticated, service_role/i)
    expect(hardening).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_coach_client_insights\(UUID, DATE, DATE\) TO authenticated/i)
  })
})

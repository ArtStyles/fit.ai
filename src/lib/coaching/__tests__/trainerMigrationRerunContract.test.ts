import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationNames: Record<number, string> = {
  40: 'trainer_foundations',
  41: 'trainer_verification',
  42: 'trainer_relationships',
  43: 'trainer_programming',
  44: 'trainer_insights',
  45: 'trainer_hardening',
}

const migration = (number: number) => readFileSync(
  new URL(`../../../../supabase/migrations/0${number}_${migrationNames[number]}.sql`, import.meta.url),
  'utf8',
)

const isoRepair = readFileSync(
  new URL('../../../../supabase/migrations/049_trainer_iso_weekday_repair.sql', import.meta.url),
  'utf8',
)
const declineMigrationUrl = new URL('../../../../supabase/migrations/057_trainer_assignment_decline.sql', import.meta.url)
const declineMigration = existsSync(declineMigrationUrl) ? readFileSync(declineMigrationUrl, 'utf8') : ''
const declineTapUrl = new URL('../../../../supabase/tests/057_trainer_assignment_decline_test.sql', import.meta.url)
const declineTap = existsSync(declineTapUrl) ? readFileSync(declineTapUrl, 'utf8') : ''
const trainerRunner = readFileSync(
  new URL('../../../../scripts/test-trainer-programming-db.mjs', import.meta.url),
  'utf8',
)
const trainerProgrammingTest = readFileSync(
  new URL('../../../../supabase/tests/043_trainer_programming_test.sql', import.meta.url),
  'utf8',
)
const migrationFiles = readdirSync(
  new URL('../../../../supabase/migrations/', import.meta.url),
).filter((file) => /^\d{3}_.*\.sql$/.test(file)).sort()
const nonInstallableMigrationFiles = new Set([
  '004_rollback.sql',
  '005_rollback.sql',
])
const installableMigrationFilesFor = (files: string[]) => files.filter(
  (file) => /^\d{3}_.*\.sql$/.test(file) && !nonInstallableMigrationFiles.has(file),
)
const duplicateMigrationPrefixes = (files: string[]) => {
  const prefixes = installableMigrationFilesFor(files).map((file) => file.slice(0, 3))
  return Array.from(new Set(
    prefixes.filter((prefix, index) => prefixes.indexOf(prefix) !== index),
  ))
}
const releaseMigrationFiles = migrationFiles.filter((file) => /^(?:04\d|05[0-7])_/.test(file))
const readme = readFileSync(new URL('../../../../README.md', import.meta.url), 'utf8')
const envExample = readFileSync(new URL('../../../../.env.example', import.meta.url), 'utf8')
const runbook = readFileSync(new URL('../../../../docs/operations/trainer-marketplace-runbook.md', import.meta.url), 'utf8')
const pilotChecklist = readFileSync(new URL('../../../../docs/operations/trainer-pilot-checklist.md', import.meta.url), 'utf8')

describe('trainer migration rerun contract', () => {
  it('assigns every production migration a unique numeric prefix', () => {
    expect(duplicateMigrationPrefixes(migrationFiles)).toEqual([])
  })

  it('checks every installable SQL prefix while excluding only the two rollback utilities', () => {
    expect(duplicateMigrationPrefixes([
      '004_ai_plan_fields.sql',
      '004_rollback.sql',
      '005_ai_usage_logs.sql',
      '005_rollback.sql',
      '039_first_installable.sql',
      '039_second_installable.sql',
      '040_trainer_foundations.sql',
      '050_first_installable.sql',
      '050_second_installable.sql',
    ])).toEqual(['039', '050'])
  })

  it('keeps the production migrations in the exact 040-057 order', () => {
    expect(releaseMigrationFiles).toEqual([
      '040_trainer_foundations.sql',
      '041_trainer_verification.sql',
      '042_trainer_relationships.sql',
      '043_trainer_programming.sql',
      '044_trainer_insights.sql',
      '045_trainer_hardening.sql',
      '046_release_session_authorization.sql',
      '047_product_notification_preferences_insert.sql',
      '048_profile_weight_measurement_sync.sql',
      '049_trainer_iso_weekday_repair.sql',
      '050_product_events_conversion_funnel.sql',
      '051_workout_adjustment_atomic.sql',
      '052_notification_attention_dismissals.sql',
      '053_trainer_draft_rpc_json_repair.sql',
      '054_product_notification_archiving.sql',
      '055_atomic_notification_attention_dismissal.sql',
      '056_trainer_template_exercise_batch_append.sql',
      '057_trainer_assignment_decline.sql',
    ])
  })

  it('documents migrations 051, 053, 056, and 057 plus the explicit history-continuity E2E gate', () => {
    expect(readme).toContain('051_workout_adjustment_atomic.sql')
    expect(readme).toContain('053_trainer_draft_rpc_json_repair.sql')
    expect(readme).toContain('056_trainer_template_exercise_batch_append.sql')
    expect(readme).toContain('057_trainer_assignment_decline.sql')
    expect(readme).toContain('pnpm exec playwright test tests/e2e/training-evidence.spec.ts --grep "completed evidence survives"')
    expect(readme).not.toContain('No hay pruebas end-to-end')
    expect(envExample).toContain('E2E_HISTORY_CONTINUITY_ENABLED=true')
    expect(runbook).toContain('040–057')
    expect(runbook).toContain('trainer_security_preflight() = 57')
    expect(pilotChecklist).toContain('040–057')
    expect(pilotChecklist).toContain('trainer_security_preflight() = 57')
    expect(`${runbook}\n${pilotChecklist}`).not.toMatch(/040[–-]050/)
  })

  it('guards every named index in migrations 040-045', () => {
    for (const number of [40, 41, 42, 43, 44, 45]) {
      expect(migration(number)).not.toMatch(/CREATE (?:UNIQUE )?INDEX (?!IF NOT EXISTS)/i)
    }
  })

  it('guards the verification source-profile foreign key before adding it', () => {
    expect(migration(41)).toMatch(
      /DROP CONSTRAINT IF EXISTS trainer_applications_source_profile_fk;\s*ALTER TABLE public\.trainer_applications\s+ADD CONSTRAINT trainer_applications_source_profile_fk/i,
    )
  })

  it('limits the legacy workout-plan backfill to rows without professional identity', () => {
    const sql = migration(43)
    const backfill = sql.match(/-- Explicitly backfill old rows[\s\S]+?ALTER TABLE public\.workout_plans\s+DROP CONSTRAINT IF EXISTS workout_plans_source_type_check/i)?.[0]
    expect(backfill).toBeDefined()
    expect(backfill).toMatch(/source_type <> 'trainer_assigned'/i)
    expect(backfill).toMatch(/trainer_relationship_id IS NULL/i)
    expect(backfill).toMatch(/trainer_assignment_id IS NULL/i)
    expect(backfill).toMatch(/trainer_assignment_version_id IS NULL/i)
  })

  it('reapplies every production trainer routine through the decline boundary', () => {
    expect(isoRepair).toMatch(/RETURN 49/i)
    expect(trainerRunner).toMatch(/043_trainer_programming\.sql[\s\S]+045_trainer_hardening\.sql[\s\S]+046_release_session_authorization\.sql[\s\S]+047_product_notification_preferences_insert\.sql[\s\S]+048_profile_weight_measurement_sync\.sql[\s\S]+049_trainer_iso_weekday_repair\.sql[\s\S]+050_product_events_conversion_funnel\.sql[\s\S]+051_workout_adjustment_atomic\.sql[\s\S]+053_trainer_draft_rpc_json_repair\.sql[\s\S]+056_trainer_template_exercise_batch_append\.sql[\s\S]+057_trainer_assignment_decline\.sql/i)
    expect(trainerRunner).toMatch(/trainerMigrationFiles\.map\(readMigration\)[\s\S]+reapplying trainer migrations 040-051, 053, 056, 057/i)
  })

  it('keeps 056 historical checks before applying and racing the rerunnable 057 boundary', () => {
    expect(declineMigration).toMatch(/^BEGIN;[\s\S]+COMMIT;\s*$/i)
    expect(declineMigration).toContain('ADD COLUMN IF NOT EXISTS decline_idempotency_key TEXT')
    expect(declineMigration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS trainer_plan_assignments_decline_idempotency_unique')
    expect(trainerRunner).toMatch(/running 056 trainer template exercise batch append pgTAP suite[\s\S]+applying migration 057[\s\S]+reapplying migration 057[\s\S]+running 057 trainer assignment decline pgTAP suite/i)
    expect(trainerRunner).toMatch(/running 057 trainer assignment decline pgTAP suite[\s\S]+runPsql\(acceptVsDeclineRaceSql, 'running committed accept-versus-decline race'\)[\s\S]+runPsql\(sameKeyDeclineRaceSql, 'running committed same-key concurrent decline race'\)/i)
  })

  it('replays whole history before decline evidence and reruns only 057 over the durable decline fixture', () => {
    const execution = trainerRunner.slice(trainerRunner.indexOf('let started = false'))
    const wholeHistoryReplay = execution.indexOf('trainerMigrationFiles.map(readMigration)')
    const acceptVsDeclineRace = execution.indexOf('runPsql(acceptVsDeclineRaceSql')
    const sameKeyDeclineRace = execution.indexOf('runPsql(sameKeyDeclineRaceSql')
    const declineSnapshot = execution.indexOf("runPsql(trainerDeclineRerunSnapshotSql, 'capturing durable 057 decline state')")
    const declineOnlyReplay = execution.indexOf("runPsql(readMigration('057_trainer_assignment_decline.sql'), 'reapplying migration 057 against durable decline evidence')")
    const declineVerification = execution.indexOf("runPsql(trainerDeclineRerunVerifySql, 'verifying migration 057 rerun preserves declined evidence')")

    expect(wholeHistoryReplay).toBeGreaterThan(-1)
    expect(wholeHistoryReplay).toBeLessThan(acceptVsDeclineRace)
    expect(wholeHistoryReplay).toBeLessThan(sameKeyDeclineRace)
    expect(declineSnapshot).toBeGreaterThan(sameKeyDeclineRace)
    expect(declineOnlyReplay).toBeGreaterThan(declineSnapshot)
    expect(declineVerification).toBeGreaterThan(declineOnlyReplay)
    expect(execution.slice(sameKeyDeclineRace)).not.toContain('trainerMigrationFiles.map(readMigration)')
  })

  it('pins the exact decline check, index catalog identity, and audit allowlist in preflight and pgTAP tamper coverage', () => {
    const expectedCheck = '((decline_idempotency_key IS NULL) OR ((char_length(btrim(decline_idempotency_key)) >= 1) AND (char_length(btrim(decline_idempotency_key)) <= 200)))'

    expect(declineMigration).toContain('constraint_row.convalidated')
    expect(declineMigration).toContain(expectedCheck)
    expect(declineMigration).toContain('index_definition.indnkeyatts = 2')
    expect(declineMigration).toContain('index_definition.indnatts = 2')
    expect(declineMigration).toContain('index_definition.indexprs IS NULL')
    expect(declineMigration).toContain('index_definition.indkey[0] = client_column.attnum')
    expect(declineMigration).toContain('index_definition.indkey[1] = decline_column.attnum')
    for (const flag of ['indisunique', 'indisvalid', 'indisready', 'indislive']) {
      expect(declineMigration).toContain(`index_definition.${flag}`)
    }
    expect(declineMigration).toContain("pg_get_expr(index_definition.indpred, index_definition.indrelid) = '(decline_idempotency_key IS NOT NULL)'")
    expect(declineMigration).toContain("is_professional_audit_event_allowed('trainer_plan_assignment', 'declined')")

    expect(declineTap).toContain(expectedCheck)
    expect(declineTap).toContain('AND convalidated')
    expect(declineTap).toContain('index_definition.indexprs IS NULL')
    expect(declineTap).toContain('CHECK (TRUE)')
    expect(declineTap).toContain('decline_idempotency_key IS NULL')
    expect(declineTap).toContain('downgraded audit allowlist')
  })

  it('proves the elevated preflight keeps its fixed API boundary for authenticated and anonymous roles', () => {
    const preflightAclLabel = "'preflight is postgres-owned SECURITY DEFINER with exact search path and least-privilege ACLs'"
    const preflightAclEnd = declineTap.indexOf(preflightAclLabel)
    const preflightAclStart = declineTap.lastIndexOf('SELECT ok(', preflightAclEnd)
    const preflightAclAssertion = declineTap.slice(preflightAclStart, preflightAclEnd + preflightAclLabel.length)

    expect(declineMigration).toMatch(/CREATE OR REPLACE FUNCTION public\.trainer_security_preflight\(\)[\s\S]+?SECURITY DEFINER[\s\S]+?SET search_path = public, pg_temp/i)
    expect(declineMigration).toContain('ALTER FUNCTION public.trainer_security_preflight() OWNER TO postgres')
    expect(declineMigration).toContain('REVOKE ALL ON FUNCTION public.trainer_security_preflight() FROM PUBLIC, anon')
    expect(declineMigration).toContain('GRANT EXECUTE ON FUNCTION public.trainer_security_preflight() TO authenticated, service_role')

    expect(preflightAclStart).toBeGreaterThan(-1)
    expect(preflightAclAssertion).toContain("procedure.oid = 'public.trainer_security_preflight()'::REGPROCEDURE")
    expect(preflightAclAssertion).toContain('procedure.prosecdef')
    expect(preflightAclAssertion).toContain("procedure.proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]")
    expect(preflightAclAssertion).toContain("owner_role.rolname = 'postgres'")
    expect(preflightAclAssertion).toContain('expanded_acl.grantee = 0')
    expect(preflightAclAssertion).toContain("has_function_privilege('authenticated', 'public.trainer_security_preflight()', 'EXECUTE')")
    expect(preflightAclAssertion).toContain("has_function_privilege('service_role', 'public.trainer_security_preflight()', 'EXECUTE')")
    expect(preflightAclAssertion).toContain("NOT has_function_privilege('anon', 'public.trainer_security_preflight()', 'EXECUTE')")
    expect(declineTap).toMatch(/SET LOCAL ROLE authenticated;\s*SELECT is\(\s*public\.trainer_security_preflight\(\),\s*57,[\s\S]+?\);\s*RESET ROLE;/i)
    expect(declineTap).toMatch(/SET LOCAL ROLE anon;[\s\S]+?SELECT throws_ok\(\s*\$\$SELECT public\.trainer_security_preflight\(\)\$\$,[\s\S]+?'permission denied for function trainer_security_preflight'[\s\S]+?RESET ROLE;/i)
    expect(declineTap).toMatch(/RESET ROLE;\s*SELECT set_config\('request.jwt.claim.sub', '', TRUE\);\s*SELECT set_config\('request.jwt.claim.role', '', TRUE\);/i)
  })

  it('compares proposal and revision materializations to canonical snapshot order/day pairs', () => {
    for (const rpcPath of ['proposal', 'revision']) {
      const assertion = trainerProgrammingTest.match(
        new RegExp(`-- ISO_IDENTITY_ASSERTION: ${rpcPath}[\\s\\S]+?'${rpcPath} materializes canonical snapshot order/day pairs'\\s*\\);`, 'i'),
      )?.[0]

      expect(assertion, `${rpcPath} must preserve snapshot workout identity`).toBeDefined()
      expect(assertion).toMatch(/jsonb_build_array\(workout\.order_in_plan, workout\.day_of_week\)/i)
      expect(assertion).toMatch(/jsonb_array_elements\(version\.snapshot->'workouts'\)/i)
      expect(assertion).toMatch(/snapshot_workout\.value->>'orderInPlan'/i)
      expect(assertion).toMatch(/snapshot_workout\.value->>'dayOfWeek'/i)
      expect(assertion).not.toMatch(/ORDER BY workout\.day_of_week/i)
    }
  })
})

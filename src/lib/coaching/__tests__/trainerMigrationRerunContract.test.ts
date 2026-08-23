import { readdirSync, readFileSync } from 'node:fs'
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
const releaseMigrationFiles = migrationFiles.filter((file) => /^(?:04\d|05[0-3])_/.test(file))
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

  it('keeps the production migrations in the exact 040-053 order', () => {
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
    ])
  })

  it('documents migrations 051 and 053 plus the explicit history-continuity E2E gate', () => {
    expect(readme).toContain('051_workout_adjustment_atomic.sql')
    expect(readme).toContain('053_trainer_draft_rpc_json_repair.sql')
    expect(readme).toContain('pnpm exec playwright test tests/e2e/training-evidence.spec.ts --grep "completed evidence survives"')
    expect(readme).not.toContain('No hay pruebas end-to-end')
    expect(envExample).toContain('E2E_HISTORY_CONTINUITY_ENABLED=true')
    expect(runbook).toContain('040–053')
    expect(pilotChecklist).toContain('040–053')
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

  it('reapplies the ISO repair after every historical trainer routine', () => {
    expect(isoRepair).toMatch(/RETURN 49/i)
    expect(trainerRunner).toMatch(/043_trainer_programming\.sql[\s\S]+045_trainer_hardening\.sql[\s\S]+046_release_session_authorization\.sql[\s\S]+047_product_notification_preferences_insert\.sql[\s\S]+048_profile_weight_measurement_sync\.sql[\s\S]+049_trainer_iso_weekday_repair\.sql[\s\S]+050_product_events_conversion_funnel\.sql[\s\S]+051_workout_adjustment_atomic\.sql[\s\S]+053_trainer_draft_rpc_json_repair\.sql/i)
    expect(trainerRunner).toMatch(/trainerMigrationFiles\.map\(readMigration\)[\s\S]+reapplying trainer migrations 040-053/i)
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

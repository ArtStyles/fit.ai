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
const releaseMigrationFiles = migrationFiles.filter((file) => /^0(?:4\d)_/.test(file))

describe('trainer migration rerun contract', () => {
  it('assigns every production migration a unique numeric prefix', () => {
    const prefixes = releaseMigrationFiles.map((file) => file.slice(0, 3))
    const duplicatePrefixes = Array.from(new Set(
      prefixes.filter((prefix, index) => prefixes.indexOf(prefix) !== index),
    ))

    expect(duplicatePrefixes).toEqual([])
  })

  it('keeps the production migrations in the exact 040-049 order', () => {
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
    ])
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
    expect(trainerRunner).toMatch(/043_trainer_programming\.sql[\s\S]+045_trainer_hardening\.sql[\s\S]+046_release_session_authorization\.sql[\s\S]+047_product_notification_preferences_insert\.sql[\s\S]+048_profile_weight_measurement_sync\.sql[\s\S]+049_trainer_iso_weekday_repair\.sql/i)
    expect(trainerRunner).toMatch(/trainerMigrationFiles\.map\(readMigration\)[\s\S]+reapplying migrations 040-049/i)
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

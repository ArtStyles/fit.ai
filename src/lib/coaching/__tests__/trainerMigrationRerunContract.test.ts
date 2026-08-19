import { readFileSync } from 'node:fs'
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
  new URL('../../../../supabase/migrations/047_trainer_iso_weekday_repair.sql', import.meta.url),
  'utf8',
)
const trainerRunner = readFileSync(
  new URL('../../../../scripts/test-trainer-programming-db.mjs', import.meta.url),
  'utf8',
)

describe('trainer migration rerun contract', () => {
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
    expect(isoRepair).toMatch(/RETURN 47/i)
    expect(trainerRunner).toMatch(/043_trainer_programming\.sql[\s\S]+045_trainer_hardening\.sql[\s\S]+046_release_session_authorization\.sql[\s\S]+047_trainer_iso_weekday_repair\.sql/i)
    expect(trainerRunner).toMatch(/migrationPaths\.slice\(3\)[\s\S]+reapplying migrations 040-047/i)
  })
})

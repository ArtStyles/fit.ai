import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../../../supabase/migrations/047_trainer_iso_weekday_repair.sql', import.meta.url),
  'utf8',
).replace(/\r\n?/g, '\n')

function routine(name: string) {
  const body = migration.match(
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]+?\\n\\$\\$;`, 'i'),
  )?.[0]
  expect(body, `${name} must be replaced by migration 047`).toBeDefined()
  return body!
}

describe('trainer ISO weekday repair migration', () => {
  it('is transactional and repairs only professional materializations from snapshot order', () => {
    expect(migration).toMatch(/^BEGIN;/m)
    expect(migration).toMatch(/LOCK TABLE[\s\S]+trainer_plan_assignments[\s\S]+trainer_assignment_versions[\s\S]+workout_plans[\s\S]+workouts[\s\S]+SHARE ROW EXCLUSIVE/i)
    expect(migration).toMatch(/source_type = 'trainer_assigned'/i)
    expect(migration).toMatch(/order_in_plan[\s\S]+orderInPlan/i)
    expect(migration).toMatch(/IS DISTINCT FROM[\s\S]+expected_day_of_week/i)
    expect(migration).toContain('TRAINER_ISO_WEEKDAY_REPAIR_PREFLIGHT_FAILED')
    expect(migration).toMatch(/COMMIT;\s*$/)
  })

  it('removes the shift from both materializers and both final insight projections', () => {
    for (const name of [
      'propose_trainer_assignment',
      'publish_trainer_assignment_revision',
      'get_coach_clients_summary',
      'get_coach_client_insights',
    ]) {
      const body = routine(name)
      expect(body).not.toMatch(/dayOfWeek[^\n]*-\s*1/i)
    }
    expect(routine('propose_trainer_assignment')).toMatch(/NULLIF\(v_workout->>'dayOfWeek', ''\)::INTEGER/)
    expect(routine('publish_trainer_assignment_revision')).toMatch(/NULLIF\(v_workout->>'dayOfWeek', ''\)::INTEGER/)
  })

  it('installs an ISO snapshot guard with closed direct execution', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.enforce_trainer_workout_iso_schedule\(\)/i)
    expect(migration).toContain('TRAINER_PRESCRIPTION_SCHEDULE_MISMATCH')
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE OF plan_id, day_of_week, order_in_plan ON public\.workouts/i)
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.enforce_trainer_workout_iso_schedule\(\) FROM PUBLIC, anon, authenticated, service_role/i)
  })

  it('advances the catalog preflight only after checking 046 and the ISO guard', () => {
    const preflight = routine('trainer_security_preflight')
    expect(preflight).toContain("to_regprocedure('public.release_session_authorization(uuid,uuid)')")
    expect(preflight).toContain("to_regprocedure('public.enforce_trainer_workout_iso_schedule()')")
    expect(preflight).toContain('trg_enforce_trainer_workout_iso_schedule')
    expect(preflight).toMatch(/RETURN 47/)
  })
})

import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const runnerUrl = new URL('../test-trainer-security-db.mjs', import.meta.url)
const relationshipsRunnerUrl = new URL('../test-trainer-relationships-db.mjs', import.meta.url)
const sqlUrl = new URL('../../supabase/tests/trainer_security_test.sql', import.meta.url)

describe('trainer security database harness', () => {
  it('runs a fresh Docker database three times and never prints connection secrets', async () => {
    const source = await readFile(runnerUrl, 'utf8')

    expect(source).toMatch(/SECURITY_RACE_REPEATS.*\?\?\s*'3'/)
    expect(source).toContain("'--security'")
    expect(source).toContain("spawnSync(process.execPath")
    expect(source).not.toMatch(/POSTGRES_PASSWORD.*process\.stdout|serviceRoleKey|anonKey/i)
  })

  it('uses independent dblink sessions for all five races and checks all nine IDOR effects', async () => {
    const source = await readFile(sqlUrl, 'utf8')

    for (const race of [
      'two_trainer_accept',
      'idempotent_proposal',
      'accept_publish_suspend',
      'revision_n_plus_one',
      'end_read_evidence',
    ]) {
      expect(source).toContain(`security_${race}_a`)
      expect(source).toContain(`security_${race}_b`)
    }
    expect(source).toContain('dblink_send_query')
    expect(source).toContain('dblink_get_result')
    expect(source).toMatch(/wait_event_type\s*=\s*'Lock'/)
    expect(source.match(/wait_for_security_lock\(/g)?.length).toBeGreaterThanOrEqual(4)
    expect(source).toContain("request.jwt.claim.sub = '76000000-0000-4000-8000-000000000003'")
    expect(source).toContain('permission denied for function suspend_account_and_professional')

    for (const id of [
      'applicationId', 'credentialId', 'requestId', 'relationshipId', 'clientId',
      'templateId', 'assignmentId', 'planId', 'progressLogId',
    ]) expect(source).toContain(`IDOR:${id}`)

    for (const dependency of [
      'trainer_assignment_versions', 'workouts', 'workout_exercises',
      'coaching_consents', 'product_notifications', 'professional_audit_logs',
    ]) expect(source).toMatch(new RegExp(`'${dependency}'\\s*,`))
  })

  it('proves both two-trainer accept backends are lock-waiting before releasing them', async () => {
    const source = await readFile(relationshipsRunnerUrl, 'utf8')
    expect(source).toContain('acceptance_actor_pids')
    expect(source).toContain("wait_event_type = 'Lock'")
    expect(source).toContain('pid = ANY(acceptance_actor_pids)')
    const dispatch = source.indexOf("dblink_send_query('accept_b'")
    const observed = source.indexOf('expected two blocked acceptance actors')
    const released = source.indexOf("pg_advisory_unlock(hashtextextended('93000000-0000-4000-8000-000000000003'")
    expect(dispatch).toBeGreaterThan(-1)
    expect(observed).toBeGreaterThan(dispatch)
    expect(released).toBeGreaterThan(observed)
  })

  it('waits for exact accept/publish PIDs before invoking the database half of suspension', async () => {
    const source = await readFile(sqlUrl, 'utf8')
    expect(source).toContain('security_accept_publish_pids')
    expect(source).toContain('security_accept_publish_suspend_db_boundary')
    const observed = source.indexOf('wait_for_security_lock(ARRAY(SELECT pid FROM security_accept_publish_pids), 2)')
    const suspended = source.indexOf("dblink_exec('security_accept_publish_suspend_db_boundary', $$DO", observed)
    const released = source.indexOf("pg_advisory_unlock(hashtextextended('76000000-0000-4000-8000-000000000002'", observed)
    expect(observed).toBeGreaterThan(-1)
    expect(suspended).toBeGreaterThan(observed)
    expect(released).toBeGreaterThan(suspended)
  })

  it('reapplies trainer migrations through 059 after a locked professional fixture and compares an immutable snapshot', async () => {
    const source = await readFile(new URL('../test-trainer-programming-db.mjs', import.meta.url), 'utf8')
    const seeded = source.indexOf('seeding rerun preservation fixture')
    const rerun = source.indexOf('reapplying trainer migrations 040-051, 053, 056-059 after locked professional data')
    const verified = source.indexOf('verifying rerun preservation snapshot')
    const historicalConversion = source.indexOf('seeding pre-050 conversion history')
    const migration050 = source.indexOf('applying migration 050 conversion funnel events')
    const conversionFixture = source.indexOf('seeding committed conversion rerun fixture')
    const conversionRerun = source.indexOf('reapplying migration 050 against committed conversion rows')
    const conversionVerified = source.indexOf('verifying conversion rows after migration 050 rerun')

    expect(source).toContain('trainer_migration_rerun_snapshot')
    expect(source).toContain("'application_status', application.status")
    expect(source).toContain("snapshot->'trainer'->>'application_status' <> 'approved'")
    expect(source).toContain('prescription_locked')
    expect(source).toContain('professional_audit_logs')
    for (const snapshotKey of [
      'accounts',
      'application',
      'trainer_profile',
      'service',
      'request',
      'relationship',
      'consents',
      'exercise',
      'template',
      'template_workouts',
      'template_exercises',
      'assignment',
      'versions',
      'plans',
      'workouts',
      'workout_exercises',
      'session_authorizations',
      'progress_logs',
      'exercise_logs',
      'product_notifications',
      'professional_audits',
      'admin_audits',
    ]) expect(source).toContain(`'${snapshotKey}'`)
    expect(source).toContain("'body_measurements', 'body-measurements-v1'")
    expect(source).toContain('capture_trainer_migration_rerun_snapshot')
    expect(seeded).toBeGreaterThan(-1)
    expect(rerun).toBeGreaterThan(seeded)
    expect(verified).toBeGreaterThan(rerun)
    expect(historicalConversion).toBeGreaterThan(-1)
    expect(migration050).toBeGreaterThan(historicalConversion)
    expect(conversionFixture).toBeGreaterThan(rerun)
    expect(conversionRerun).toBeGreaterThan(conversionFixture)
    expect(conversionVerified).toBeGreaterThan(conversionRerun)
  })
})

import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const runnerUrl = new URL('../test-trainer-security-db.mjs', import.meta.url)
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
})

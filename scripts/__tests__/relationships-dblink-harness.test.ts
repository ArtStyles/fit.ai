import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const harnessUrl = new URL('../test-trainer-relationships-db.mjs', import.meta.url)

describe('relationships database race harness', () => {
  it('uses two dblink connections and condition-based result collection for concurrent accepts', async () => {
    const source = await readFile(harnessUrl, 'utf8')

    expect(source).toContain('CREATE EXTENSION IF NOT EXISTS dblink')
    expect(source).toContain("dblink_send_query('accept_a'")
    expect(source).toContain("dblink_send_query('accept_b'")
    expect(source).toContain("dblink_get_result('accept_a', false)")
    expect(source).toContain("dblink_get_result('accept_b', false)")
    expect(source).toContain('COACHING_ACTIVE_RELATIONSHIP_EXISTS')
  })

  it('exercises real suspension races against accept and resume without sleep-based timing', async () => {
    const source = await readFile(harnessUrl, 'utf8')

    expect(source).toContain("dblink_send_query('suspend_accept_trainer'")
    expect(source).toContain("dblink_send_query('suspend_accept_admin'")
    expect(source).toContain("dblink_send_query('suspend_resume_client'")
    expect(source).toContain("dblink_send_query('suspend_resume_admin'")
    expect(source).toContain('COACHING_SUSPEND_ACCEPT_ACTIVE_STATE')
    expect(source).toContain('COACHING_SUSPEND_RESUME_ACTIVE_STATE')
    expect(source).not.toMatch(/pg_sleep|setTimeout/)
  })
})

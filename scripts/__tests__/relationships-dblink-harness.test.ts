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
})

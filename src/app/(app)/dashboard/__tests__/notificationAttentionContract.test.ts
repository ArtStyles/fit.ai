import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8')

describe('dashboard notification attention contract', () => {
  it('uses a head-only unread notification count and combines it with the existing dashboard notice', () => {
    expect(page).toContain(".from('product_notifications')")
    expect(page).toContain(".select('id', { count: 'exact', head: true })")
    expect(page).toContain(".is('read_at', null)")
    expect(page).toContain(".is('dismissed_at', null)")
    expect(page).toContain('dashboard.noticePlacement === \'hub\' || hasUnreadProductNotifications')
    expect(page).not.toContain(".select('id, type, title, body, url, read_at, created_at')")
  })
})

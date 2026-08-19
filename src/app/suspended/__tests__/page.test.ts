import { describe, expect, it } from 'vitest'
import { formatSuspensionDeadline } from '@/lib/time/suspension'

describe('suspended account deadline', () => {
  it('formats the deadline in the suspended profile time zone', () => {
    expect(formatSuspensionDeadline('2026-08-20T02:30:00.000Z', 'America/Havana')).toContain('19 de agosto')
    expect(formatSuspensionDeadline('2026-08-20T02:30:00.000Z', 'Asia/Tokyo')).toContain('20 de agosto')
  })
})

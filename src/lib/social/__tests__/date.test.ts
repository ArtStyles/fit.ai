import { describe, expect, it } from 'vitest'
import { formatPostDate, formatPostDateTime } from '../date'

describe('social post dates', () => {
  it('formats a stable publication date', () => {
    const value = formatPostDate('2026-07-02T14:30:00.000Z')
    expect(value).toContain('2026')
    expect(value).toContain('2')
  })

  it('uses the profile timezone at a UTC day boundary', () => {
    const instant = '2026-08-20T03:30:00.000Z'

    expect(formatPostDate(instant, 'en-US', 'America/Havana')).toBe('Aug 19, 2026')
    expect(formatPostDate(instant, 'en-US', 'UTC')).toBe('Aug 20, 2026')
    expect(formatPostDateTime(instant, 'en-US', 'America/Havana'))
      .not.toBe(formatPostDateTime(instant, 'en-US', 'UTC'))
  })

  it('returns an empty label for invalid dates', () => {
    expect(formatPostDate('invalid')).toBe('')
    expect(formatPostDateTime('invalid')).toBe('')
  })
})

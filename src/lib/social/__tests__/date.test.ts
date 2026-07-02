import { describe, expect, it } from 'vitest'
import { formatPostDate, formatPostDateTime } from '../date'

describe('social post dates', () => {
  it('formats a stable publication date', () => {
    const value = formatPostDate('2026-07-02T14:30:00.000Z')
    expect(value).toContain('2026')
    expect(value).toContain('2')
  })

  it('returns an empty label for invalid dates', () => {
    expect(formatPostDate('invalid')).toBe('')
    expect(formatPostDateTime('invalid')).toBe('')
  })
})

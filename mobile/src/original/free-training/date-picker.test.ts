import { describe, expect, it } from 'vitest'
import { datePickerCells, moveDateFocus, shiftDateMonth } from './date-picker'

describe('training date calendar civil navigation', () => {
  it('starts weeks on Monday and marks dates after the civil limit unavailable', () => {
    const cells = datePickerCells('2026-09-11', '2026-09-11')
    expect(cells[0].date).toBeNull()
    expect(cells[1].date).toBe('2026-09-01')
    expect(cells.find(cell => cell.date === '2026-09-11')).toMatchObject({ isToday: true, isFuture: false })
    expect(cells.find(cell => cell.date === '2026-09-12')?.isFuture).toBe(true)
    expect(cells.length % 7).toBe(0)
  })
  it('changes months without overflowing month-end or losing leap days', () => {
    expect(shiftDateMonth('2024-01-31', 1)).toBe('2024-02-29')
    expect(shiftDateMonth('2025-01-31', 1)).toBe('2025-02-28')
    expect(shiftDateMonth('2024-02-29', 12)).toBe('2025-02-28')
    expect(shiftDateMonth('2026-01-01', -1)).toBe('2025-12-01')
    expect(datePickerCells('2024-02-01', '2026-09-11').filter(cell => cell.date)).toHaveLength(29)
  })
  it('moves keyboard focus across months and weeks while never exceeding today', () => {
    const max = '2026-09-11'
    expect(moveDateFocus('2026-09-01', 'ArrowLeft', max)).toBe('2026-08-31')
    expect(moveDateFocus('2026-09-11', 'ArrowRight', max)).toBe(max)
    expect(moveDateFocus('2026-09-08', 'Home', max)).toBe('2026-09-07')
    expect(moveDateFocus('2026-09-08', 'End', max)).toBe(max)
    expect(moveDateFocus('2026-08-31', 'PageDown', max)).toBe(max)
    expect(moveDateFocus('2026-03-31', 'PageUp', max)).toBe('2026-02-28')
    expect(moveDateFocus('2026-09-08', 'Tab', max)).toBeNull()
  })
})

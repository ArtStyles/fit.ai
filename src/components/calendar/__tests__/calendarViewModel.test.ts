import { describe, expect, it } from 'vitest'
import { buildCalendarMonthView, type CalendarSessionSummary } from '../calendarViewModel'

const sessions: CalendarSessionSummary[] = [
  { id: 'a', date: '2026-08-12', completedAt: '2026-08-12T10:00:00Z', workoutName: 'Push', focus: 'Pecho', durationMin: 40, sets: 8, volumeKg: 1000 },
  { id: 'b', date: '2026-08-12', completedAt: '2026-08-12T18:00:00Z', workoutName: 'Core', focus: null, durationMin: 20, sets: 4, volumeKg: 200 },
  { id: 'c', date: '2026-07-30', completedAt: '2026-07-30T10:00:00Z', workoutName: 'Legs', focus: 'Piernas', durationMin: 50, sets: 10, volumeKg: 1800 },
]

describe('calendar month view', () => {
  it('keeps all sessions from the selected day and derives visible-month metrics', () => {
    const view = buildCalendarMonthView(sessions, 2026, 8, '2026-08-12')

    expect(view.selectedSessions.map(session => session.id)).toEqual(['b', 'a'])
    expect(view.trainedDays).toBe(1)
    expect(view.sessionCount).toBe(2)
    expect(view.frequency).toBe(0.3)
  })
})

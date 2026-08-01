import type { CalendarSessionSummary } from '@/lib/calendar/aggregate'

export type { CalendarSessionSummary } from '@/lib/calendar/aggregate'

export function buildCalendarMonthView(
  sessions: CalendarSessionSummary[],
  year: number,
  month: number,
  selectedDate: string,
) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const monthSessions = sessions.filter(session => session.date.startsWith(prefix))
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const calendarWeeks = Math.ceil((firstWeekday + daysInMonth) / 7)

  return {
    monthSessions,
    trainedDays: new Set(monthSessions.map(session => session.date)).size,
    sessionCount: monthSessions.length,
    frequency: Math.round((monthSessions.length / calendarWeeks) * 10) / 10,
    selectedSessions: monthSessions
      .filter(session => session.date === selectedDate)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
  }
}

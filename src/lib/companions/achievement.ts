import type { CompanionSnapshot, CompanionWeek } from './types'

const DAY_MS = 86_400_000

function completedCurrentWeek(week: CompanionWeek, nowMs: number): boolean {
  if (!Number.isInteger(week.goal) || !week.goal || week.goal < 0 || !Number.isInteger(week.completedSessions) || week.completedSessions < week.goal) return false
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: week.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(nowMs)
    const part = (name: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === name)?.value
    const today = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00Z`)
    const monday = today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY_MS
    return week.weekStart === new Date(monday).toISOString().slice(0, 10)
      && week.weekEnd === new Date(monday + 6 * DAY_MS).toISOString().slice(0, 10)
  } catch {
    return false
  }
}

/** Celebrate synchronized individual goals only for the same current week. */
export function hasSharedWeeklyAchievement(snapshot: CompanionSnapshot | null, nowMs = Date.now()): boolean {
  if (!snapshot || snapshot.status !== 'active' || !snapshot.relationship || !snapshot.self || !snapshot.partner) return false
  const { self, partner } = snapshot
  return self.weekStart === partner.weekStart && self.weekEnd === partner.weekEnd
    && completedCurrentWeek(self, nowMs) && completedCurrentWeek(partner, nowMs)
}

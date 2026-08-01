import { shiftDateStr } from '@/lib/calendar/aggregate'

export type EvidenceSession = {
  id: string
  workoutId: string | null
  date: string
  completedAt: string
  volumeKg: number
}

export type EvidenceSessionGroup<T extends EvidenceSession = EvidenceSession> = {
  key: string
  sessions: T[]
}

export function findPreviousComparableSession<T extends EvidenceSession>(
  sessions: T[],
  current: T,
): T | null {
  if (!current.workoutId) return null

  return [...sessions]
    .filter(item => item.workoutId === current.workoutId && item.completedAt < current.completedAt)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0] ?? null
}

export function sessionsInMonth<T extends EvidenceSession>(
  sessions: T[],
  year: number,
  month: number,
): T[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return sessions.filter(session => session.date.startsWith(prefix))
}

export function groupEvidenceSessions<T extends EvidenceSession>(
  sessions: T[],
  todayStr: string,
): EvidenceSessionGroup<T>[] {
  const [year, month, day] = todayStr.split('-').map(Number)
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
  const weekStart = shiftDateStr(todayStr, -weekday)
  const groups = new Map<string, T[]>()

  for (const session of [...sessions].sort((a, b) => b.completedAt.localeCompare(a.completedAt))) {
    const key = session.date >= weekStart ? 'current-week' : session.date.slice(0, 7)
    groups.set(key, [...(groups.get(key) ?? []), session])
  }

  return Array.from(groups, ([key, items]) => ({ key, sessions: items }))
}

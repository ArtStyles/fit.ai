export type DashboardHistoryLog = {
  id: string
  workout_id: string | null
  completed_at: string
  duration_minutes: number | null
  session_context_snapshot?: unknown
}

export function buildDashboardFallbackHistory<T extends DashboardHistoryLog>(
  recentLogs: T[],
  weekStart: Date,
): {
  allRecentLogs: T[]
  weekLogs: T[]
  hasCompletedSessions: boolean
} {
  return {
    allRecentLogs: recentLogs,
    weekLogs: recentLogs.filter(log => log.completed_at >= weekStart.toISOString()),
    hasCompletedSessions: recentLogs.length > 0,
  }
}

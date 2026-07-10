import type { AnalyticsEventName } from './events'

const COMPLETED_SESSION_COUNT_KEY = 'vekira:analytics:completed-session-count'
const TRACKED_PROGRESS_LOGS_KEY = 'vekira:analytics:tracked-progress-logs'
const MAX_TRACKED_PROGRESS_LOGS = 100

function milestoneForCount(count: number): AnalyticsEventName | null {
  if (count === 1) return 'first_session_completed'
  if (count === 2) return 'second_session_completed'
  return null
}

function parseTrackedProgressLogs(raw: string | null): string[] {
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : []
  } catch {
    return []
  }
}

export function recordSessionCompletionMilestone(
  progressLogId: string,
  storage: Storage = window.localStorage,
): AnalyticsEventName | null {
  if (!progressLogId.trim()) return null

  try {
    const trackedLogs = parseTrackedProgressLogs(storage.getItem(TRACKED_PROGRESS_LOGS_KEY))
    if (trackedLogs.includes(progressLogId)) return null

    const nextCount = Math.max(0, Number(storage.getItem(COMPLETED_SESSION_COUNT_KEY)) || 0) + 1
    const nextTrackedLogs = [progressLogId, ...trackedLogs].slice(0, MAX_TRACKED_PROGRESS_LOGS)

    storage.setItem(COMPLETED_SESSION_COUNT_KEY, String(nextCount))
    storage.setItem(TRACKED_PROGRESS_LOGS_KEY, JSON.stringify(nextTrackedLogs))

    return milestoneForCount(nextCount)
  } catch {
    return null
  }
}

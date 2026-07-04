/** Weekly adherence and effort summary consumed by deterministic regeneration. */

export interface WeeklySummary {
  scheduledSessions: number
  completedSessions: number
  /** 0..1 — completed sessions / scheduled sessions. */
  adherenceRatio: number
  avgRpe: number | null
  skippedExercises: { name: string; count: number; lastReason: string | null }[]
}

export interface WeeklyExerciseRow {
  exerciseName: string | null
  rpeValues: (number | null)[] | null
  note: string | null
}

function parseSkipReason(note: string | null): string | null {
  if (!note) return null
  const match = note.match(/^Saltado:\s*(.+?)\.?$/)
  return match ? match[1] : null
}

export function buildWeeklySummary(params: {
  scheduledSessions: number
  completedSessions: number
  exerciseRows: WeeklyExerciseRow[]
}): WeeklySummary {
  const { scheduledSessions, completedSessions, exerciseRows } = params
  const rpeValues = exerciseRows
    .flatMap(row => row.rpeValues ?? [])
    .filter((rpe): rpe is number => typeof rpe === 'number' && rpe >= 1 && rpe <= 10)
  const avgRpe = rpeValues.length > 0
    ? Math.round((rpeValues.reduce((sum, rpe) => sum + rpe, 0) / rpeValues.length) * 10) / 10
    : null

  const skippedByName = new Map<string, { count: number; lastReason: string | null }>()
  for (const row of exerciseRows) {
    const reason = parseSkipReason(row.note)
    if (reason === null || !row.exerciseName) continue
    const entry = skippedByName.get(row.exerciseName) ?? { count: 0, lastReason: null }
    entry.count += 1
    entry.lastReason = reason
    skippedByName.set(row.exerciseName, entry)
  }

  return {
    scheduledSessions,
    completedSessions,
    adherenceRatio: scheduledSessions > 0 ? completedSessions / scheduledSessions : 0,
    avgRpe,
    skippedExercises: Array.from(skippedByName.entries()).map(([name, entry]) => ({
      name,
      count: entry.count,
      lastReason: entry.lastReason,
    })),
  }
}

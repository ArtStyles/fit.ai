import { describe, expect, it } from 'vitest'
import { loadCompleteProgressHistory } from './historyPagination'

describe('progress history pagination', () => {
  it('loads every stable page of sessions and every related exercise row in bounded ID batches', async () => {
    const sourceLogs = Array.from({ length: 301 }, (_, index) => ({
      id: `log-${String(index).padStart(3, '0')}`,
      completed_at: index < 2 ? '2026-09-10T12:00:00.000Z' : '2026-09-09T12:00:00.000Z',
    }))
    const sourceExercises = sourceLogs.flatMap(log => Array.from({ length: 11 }, (_, index) => ({
      id: `${log.id}-exercise-${String(index).padStart(2, '0')}`,
      progress_log_id: log.id,
    })))
    const logRanges: Array<[number, number]> = []
    const exerciseRequests: Array<{ ids: string[]; range: [number, number] }> = []

    const result = await loadCompleteProgressHistory({
      loadLogPage: async (from, to) => {
        logRanges.push([from, to])
        return { data: sourceLogs.slice(from, to + 1), error: null }
      },
      loadExercisePage: async (logIds, from, to) => {
        exerciseRequests.push({ ids: [...logIds], range: [from, to] })
        const selected = sourceExercises.filter(row => logIds.includes(row.progress_log_id))
        return { data: selected.slice(from, to + 1), error: null }
      },
    })

    expect(result.logs).toHaveLength(301)
    expect(result.logs[300]?.id).toBe('log-300')
    expect(result.exerciseLogs).toHaveLength(3311)
    expect(result.exerciseLogs.at(-1)?.id).toBe('log-300-exercise-10')
    expect(logRanges).toEqual([[0, 299], [300, 599]])
    expect(exerciseRequests.every(request => request.ids.length <= 100)).toBe(true)
    expect(exerciseRequests.filter(request => request.ids[0] === 'log-000').map(request => request.range)).toEqual([
      [0, 299],
      [300, 599],
      [600, 899],
      [900, 1199],
    ])
  })
})

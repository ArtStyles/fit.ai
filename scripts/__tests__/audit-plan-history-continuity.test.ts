import { describe, expect, it } from 'vitest'
import { auditHistoryContinuity, summarizeHistoryContinuity } from '../audit-plan-history-continuity'

describe('summarizeHistoryContinuity', () => {
  it('counts linked, detached, and snapshot-backed history without exposing identities', () => {
    const summary = summarizeHistoryContinuity({
      logs: [
        { id: 'log-linked', user_id: 'user-a', workout_id: 'workout-linked', session_context_snapshot: null },
        { id: 'log-orphan', user_id: 'user-a', workout_id: null, session_context_snapshot: null },
        { id: 'log-missing-workout', user_id: 'user-b', workout_id: 'workout-missing', session_context_snapshot: { version: 1 } },
        { id: 'log-snapshot', user_id: 'user-c', workout_id: 'workout-linked', session_context_snapshot: { version: 1 } },
      ],
      workouts: [{ id: 'workout-linked' }],
      exerciseLogs: [
        { id: 'exercise-linked', progress_log_id: 'log-linked' },
        { id: 'exercise-orphan-1', progress_log_id: 'log-orphan' },
        { id: 'exercise-orphan-2', progress_log_id: 'log-orphan' },
        { id: 'exercise-missing', progress_log_id: 'log-missing-workout' },
      ],
    })

    expect(summary).toEqual({
      progressLogs: 4,
      detachedLogs: 2,
      detachedLogsWithExerciseRows: 2,
      contextSnapshots: 2,
      affectedUsers: 2,
    })
    expect(JSON.stringify(summary)).not.toContain('user-')
    expect(JSON.stringify(summary)).not.toContain('log-')
  })

  it('does not treat duplicate exercise rows as additional detached sessions', () => {
    expect(summarizeHistoryContinuity({
      logs: [{ id: 'log-orphan', user_id: 'user-a', workout_id: null, session_context_snapshot: null }],
      workouts: [],
      exerciseLogs: [
        { id: 'exercise-orphan-1', progress_log_id: 'log-orphan' },
        { id: 'exercise-orphan-2', progress_log_id: 'log-orphan' },
      ],
    })).toMatchObject({ detachedLogs: 1, detachedLogsWithExerciseRows: 1, affectedUsers: 1 })
  })

  it('reads paginated rows through a read-only interface and prints only aggregates', async () => {
    const calls: string[] = []
    const output: string[] = []
    await auditHistoryContinuity({
      progressLogs: async offset => {
        calls.push(`progress:${offset}`)
        return offset === 0
          ? [{ id: 'log-orphan', user_id: 'user-a', workout_id: null, session_context_snapshot: null }]
          : []
      },
      workouts: async offset => {
        calls.push(`workouts:${offset}`)
        return offset === 0 ? [{ id: 'workout-linked' }] : []
      },
      exerciseLogs: async offset => {
        calls.push(`exercise:${offset}`)
        return offset === 0 ? [{ id: 'exercise-orphan', progress_log_id: 'log-orphan' }] : []
      },
    }, value => output.push(value), 1)

    expect(calls.sort()).toEqual([
      'exercise:0', 'exercise:1',
      'progress:0', 'progress:1',
      'workouts:0', 'workouts:1',
    ])
    expect(output).toEqual([JSON.stringify({
      progressLogs: 1,
      detachedLogs: 1,
      detachedLogsWithExerciseRows: 1,
      contextSnapshots: 0,
      affectedUsers: 1,
    })])
    expect(output.join('\n')).not.toContain('user-a')
    expect(output.join('\n')).not.toContain('log-orphan')
  })
})

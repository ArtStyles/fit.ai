import { describe, expect, it } from 'vitest'
import { readFreeTrainingDetail } from '@/lib/session/freeTrainingEvidence'
import { buildHistoryEvidence } from '@/components/history/historyViewModel'
import { buildProgressSnapshot } from '@/components/progress/progressViewModel'
import { buildCalendarSessionPayload } from '@/lib/calendar/aggregate'

describe('free training evidence in existing journeys', () => {
  it('keeps missing duration and attendance metadata available to the calendar', () => {
    const calendar = buildCalendarSessionPayload([{
      id: 'free', workout_id: null, completed_at: '2026-09-11T12:00:00Z', duration_minutes: null,
      session_context_snapshot: null, workout: null, mobile_session_kind: 'free', mobile_free_training: { detailLevel: 'attendance' },
    }], [], 'UTC')
    expect(calendar.sessions[0]).toMatchObject({ detailLevel: 'attendance', durationRecorded: false })
    expect(calendar.days[0].sessions).toBe(1)
  })
  it('only identifies explicit free workout evidence and treats damaged metadata as incomplete', () => {
    expect(readFreeTrainingDetail({})).toBeNull()
    expect(readFreeTrainingDetail({ mobile_free_training: { detailLevel: 'complete' } })).toBeNull()
    expect(readFreeTrainingDetail({ mobile_session_kind: 'free' })).toBe('attendance')
    expect(readFreeTrainingDetail({ mobile_session_kind: 'free', mobile_free_training: { detailLevel: 'partial' } })).toBe('partial')
  })

  it('does not describe a partially logged workout as a volume regression', () => {
    const evidence = buildHistoryEvidence({
      todayStr: '2026-09-11',
      sessions: [
        { id: 'a', workoutId: null, date: '2026-09-10', completedAt: '2026-09-10T12:00:00Z', workoutName: 'Torso', focus: null, durationMinutes: 0, detailLevel: 'complete' },
        { id: 'b', workoutId: null, date: '2026-09-11', completedAt: '2026-09-11T12:00:00Z', workoutName: 'Torso', focus: null, durationMinutes: 0, detailLevel: 'partial' },
      ],
      exercises: [
        { progressLogId: 'a', exerciseId: 'bench', weightsKg: [60, 60], repsCompleted: [8, 8], rpeValues: [], setsCompleted: 2 },
        { progressLogId: 'b', exerciseId: 'bench', weightsKg: [60], repsCompleted: [8], rpeValues: [], setsCompleted: 1 },
      ],
    })
    expect(evidence.rows.find(row => row.id === 'b')?.signal).toBeNull()
    expect(evidence.rows.find(row => row.id === 'b')?.detailLevel).toBe('partial')
  })

  it('flags incomplete records in both comparable periods without fabricating workload', () => {
    const snapshot = buildProgressSnapshot({ todayStr: '2026-09-11', weeks: 1, days: [], records: [], exercisePoints: [], sessions: [
      { id: 'a', completedAt: '2026-09-10T12:00:00Z', date: '2026-09-10', durationMinutes: 0, volumeKg: 0, detailLevel: 'attendance' },
      { id: 'b', completedAt: '2026-09-01T12:00:00Z', date: '2026-09-01', durationMinutes: 0, volumeKg: 500, detailLevel: 'partial' },
    ] })
    expect(snapshot.incompleteSessionCount).toBe(1)
    expect(snapshot.comparisonHasIncompleteEvidence).toBe(true)
    expect(snapshot.volumeKg).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import { readFreeTrainingDetail } from '@/lib/session/freeTrainingEvidence'
import { buildHistoryEvidence } from '@/components/history/historyViewModel'
import { buildProgressSnapshot } from '@/components/progress/progressViewModel'
import { buildCalendarSessionPayload } from '@/lib/calendar/aggregate'
import { readImportedTrainingDate, readImportedTrainingSets, readImportedTrainingSource } from '@/lib/session/importedTrainingEvidence'

describe('free training evidence in existing journeys', () => {
  it('reads only a valid FitNotes date without reinterpreting a storage anchor as workout time', () => {
    const source = { mobile_session_kind: 'imported', mobile_import: { version: 1, source: 'fitnotes', date: '2026-03-08' } }
    expect(readImportedTrainingDate(source)).toBe('2026-03-08')
    expect(readImportedTrainingDate({ ...source, mobile_session_kind: 'free' })).toBeNull()
    expect(readImportedTrainingDate({ ...source, mobile_import: { ...source.mobile_import, source: 'hevy' } })).toBeNull()
    expect(readImportedTrainingDate({ ...source, mobile_import: { ...source.mobile_import, date: '2026-02-30' } })).toBeNull()
    const calendar = buildCalendarSessionPayload([{ ...source, id: 'fitnotes', completed_at: '2026-03-08T16:00:00Z', duration_minutes: null, workout_id: null, workout: null, session_context_snapshot: null }], [], 'America/Havana')
    expect(calendar.sessions[0].dateOnly).toBe('2026-03-08')
  })
  it('keeps missing imported duration and volume unavailable while counting all recorded sets', () => {
    const calendar = buildCalendarSessionPayload([{
      id: 'imported', workout_id: null, completed_at: '2026-09-11T12:00:00Z', duration_minutes: null,
      session_context_snapshot: null, workout: null, mobile_session_kind: 'imported',
    }], [{ progress_log_id: 'imported', weights_kg: [null], reps_completed: [8], sets_completed: 1 }], 'UTC')
    expect(calendar.sessions[0]).toMatchObject({ durationRecorded: false, volumeRecorded: false, sets: 1 })
    expect(calendar.days[0]).toMatchObject({ sessions: 1, durationRecorded: false, volumeRecorded: false })
    expect(readFreeTrainingDetail({ mobile_session_kind: 'imported' })).toBeNull()
  })

  it('reads repeated imported exercise blocks in source order with exact nullable measures', () => {
    const first = { reps: null, weightKg: null, durationSeconds: 45, distanceMeters: 100, rpe: null, kind: 'warmup', notes: 'Inicio' }
    const second = { ...first, durationSeconds: 30, kind: 'normal', notes: '' }
    const source = { mobile_session_kind: 'imported', mobile_import: { version: 1, source: 'hevy', exercises: [
      { key: 'a', exerciseId: 'walk', sets: [first] }, { key: 'b', exerciseId: 'walk', sets: [second] },
    ] } }
    expect(readImportedTrainingSource(source)).toBe('Hevy')
    expect(readImportedTrainingSets(source, 'walk', 2)).toEqual([first, second])
    expect(readImportedTrainingSets(source, 'walk', 1)).toBeNull()
    expect(readImportedTrainingSets(source, 'other', 2)).toBeNull()
    expect(readImportedTrainingSets({ ...source, mobile_session_kind: 'free' }, 'walk', 2)).toBeNull()
    expect(readImportedTrainingSets({ mobile_session_kind: 'imported' }, 'walk', 2)).toBeNull()
    expect(readImportedTrainingSets({ ...source, mobile_import: { ...source.mobile_import, exercises: [{ key: 'a', exerciseId: 'walk', sets: [{ ...first, weightKg: -1 }] }] } }, 'walk', 1)).toBeNull()
  })
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

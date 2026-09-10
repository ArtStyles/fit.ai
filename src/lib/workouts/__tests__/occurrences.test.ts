import { describe, expect, it } from 'vitest'
import { addCivilDays, resolveOccurrences, occurrenceCompleted, getOccurrenceWindow, isCivilDate, buildSchedulePresentation, loadLocalWorkoutSchedule } from '../occurrences'

const workout = { id: 'a', day_of_week: 1 }
const move = { workout_id: 'a', source_date: '2026-09-14', target_date: '2026-09-15' }
describe('dated workout occurrences', () => {
  it('moves one Monday and preserves the next weekly occurrence', () => {
    expect(resolveOccurrences([workout], [move], '2026-09-14', '2026-09-21')).toEqual([
      { workoutId: 'a', sourceDate: '2026-09-14', scheduledDate: '2026-09-15' },
      { workoutId: 'a', sourceDate: '2026-09-21', scheduledDate: '2026-09-21' },
    ])
  })
  it('includes a moved source outside the requested range and crosses years', () => {
    expect(addCivilDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(resolveOccurrences([{ id: 'a', day_of_week: 7 }], [{ ...move, source_date: '2026-09-13', target_date: '2026-09-14' }], '2026-09-14', '2026-09-14')[0]?.sourceDate).toBe('2026-09-13')
    expect(isCivilDate('2026-02-30')).toBe(false)
    expect(isCivilDate('2026-2-01')).toBe(false)
  })
  it('uses exact source identity for new logs and bounded legacy recovery', () => {
    const occurrence = { workoutId: 'a', sourceDate: '2026-09-14', scheduledDate: '2026-09-15' }
    expect(occurrenceCompleted(occurrence, [{ workout_id: 'a', occurrence_source_date: '2026-09-14', completed_at: '2026-09-15T12:00:00Z' }], 'UTC')).toBe(true)
    expect(occurrenceCompleted(occurrence, [{ workout_id: 'a', occurrence_source_date: '2026-09-07', completed_at: '2026-09-15T12:00:00Z' }], 'UTC')).toBe(false)
    expect(occurrenceCompleted(occurrence, [{ workout_id: 'a', completed_at: '2026-09-17T12:00:00Z' }], 'UTC')).toBe(true)
    expect(occurrenceCompleted(occurrence, [{ workout_id: 'a', completed_at: '2026-09-18T12:00:00Z' }], 'UTC')).toBe(false)
    expect(getOccurrenceWindow(occurrence, '2026-09-17')).toMatchObject({ status: 'recoverable', daysLate: 2 })
    expect(getOccurrenceWindow(occurrence, '2026-09-18')).toEqual({ status: 'unavailable' })
  })
  it('keeps a moved missed source startable on its later target after source editing expires', () => {
    const result = buildSchedulePresentation([{ ...workout, name: 'A' }], { overrides: [{ ...move, target_date: '2026-09-18' }], logs: [], authorizations: [] }, new Date('2026-09-18T12:00:00Z'), 'UTC')
    expect(result.startableWorkoutIds).toContain('a')
    expect(result.occurrences.find(row => row.sourceDate === '2026-09-14')?.targets.every(target => target.reason)).toBe(true)
  })
  it('selects the civil date in the profile timezone and does no local query on web', async () => {
    const result = buildSchedulePresentation([{ id: 's', day_of_week: 7, name: 'Sunday' }], { overrides: [], logs: [], authorizations: [] }, new Date('2026-09-14T02:00:00Z'), 'America/Havana')
    expect(result.today).toBe('2026-09-13')
    expect(result.startableWorkoutIds).toContain('s')
    expect(await loadLocalWorkoutSchedule({ from: () => { throw new Error('Web must not query local tables') } }, 'owner')).toBeUndefined()
  })
})

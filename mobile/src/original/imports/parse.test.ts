import { describe, expect, it } from 'vitest'
import { ImportFormatError, parseFitnessCsv } from './parse'
import type { FitnessImportOptions } from './types'

// Synthetic, hand-authored records. No user's workout data or external parser code.
const hevyHeader = 'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe'
const strongHeader = 'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE'
const fitHeader = 'Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment'
const hevy = (rows: string[]) => [hevyHeader, ...rows].join('\n')
const strong = (rows: string[], header = strongHeader) => [header, ...rows].join('\n')
const fit = (rows: string[]) => [fitHeader, ...rows].join('\n')

function error(csv: string, code: string, row?: number, options?: FitnessImportOptions) {
  let thrown: unknown
  try { parseFitnessCsv(csv, options) } catch (cause) { thrown = cause }
  expect(thrown).toBeInstanceOf(ImportFormatError)
  expect(thrown).toMatchObject({ code, ...(row === undefined ? {} : { row }) })
}

describe('fitness CSV import', () => {
  it('reads quoted multiline notes and BOM/CRLF without splitting a set', () => {
    const csv = '\uFEFF' + hevy([
      'Push,"17 Sep 2026, 08:00","17 Sep 2026, 09:15","Felt good",Bench,,"Pause, then\npress ""slowly""",0,warmup,20,12,,,6',
      'Push,"17 Sep 2026, 08:00","17 Sep 2026, 09:15","Felt good",Bench,,,1,normal,60,8,,,8',
    ]).replaceAll('\n', '\r\n')
    const result = parseFitnessCsv(csv)
    expect(result.source).toBe('hevy')
    expect(result.workouts).toHaveLength(1)
    expect(result.workouts[0]).toMatchObject({ title: 'Push', startedAt: '2026-09-17T08:00:00', completedAt: '2026-09-17T09:15:00', date: '2026-09-17', durationSeconds: 4500, notes: 'Felt good' })
    expect(result.workouts[0].exercises[0].notes).toBe('Pause, then\npress "slowly"')
    expect(result.workouts[0].exercises[0].sets).toEqual([
      { reps: 12, weightKg: 20, durationSeconds: null, distanceMeters: null, rpe: 6, kind: 'warmup', notes: '' },
      { reps: 8, weightKg: 60, durationSeconds: null, distanceMeters: null, rpe: 8, kind: 'normal', notes: '' },
    ])
  })

  it('keeps multiple Hevy sessions per day separate and independent of CSV row order', () => {
    const rows = [
      'Push,2026-09-17T08:00:00,2026-09-17T09:00:00,,Bench,,,1,normal,60,8,,,',
      'Push,2026-09-17T18:00:00,2026-09-17T19:00:00,,Bench,,,0,normal,65,7,,,',
      'Push,2026-09-17T08:00:00,2026-09-17T09:00:00,,Bench,,,0,warmup,20,12,,,',
    ]
    const first = parseFitnessCsv(hevy(rows))
    expect(first.workouts).toHaveLength(2)
    expect(parseFitnessCsv(hevy([...rows].reverse()))).toEqual(first)
  })

  it('converts Hevy imperial and distance headers independently of UI unit selection', () => {
    const csv = 'title,start_time,end_time,exercise_title,set_index,set_type,weight_lbs,reps,distance_miles,duration_seconds\nRun,2026-09-17 08:00,2026-09-17 08:30,Carry,0,dropset,100,12,1,600'
    expect(parseFitnessCsv(csv, { weightUnit: 'kg' }).workouts[0].exercises[0].sets[0]).toMatchObject({ weightKg: 45.359237, distanceMeters: 1609.344, durationSeconds: 600, kind: 'drop' })
  })

  it('requires a weight unit for Strong instead of guessing', () => {
    const csv = strong(['2026-09-17 08:00,Push,1h 5m,Bench,1,100,8,,,Good,Session,8'])
    error(csv, 'weight-unit', 2)
    const workout = parseFitnessCsv(csv, { weightUnit: 'lb' }).workouts[0]
    expect(workout).toMatchObject({ durationSeconds: 3900, completedAt: '2026-09-17T09:05:00', notes: 'Session' })
    expect(workout.exercises[0].sets[0]).toMatchObject({ weightKg: 45.359237, notes: 'Good', rpe: 8 })
  })

  it('recognizes Strong unit headers and preserves warmup/failure/drop labels', () => {
    const result = parseFitnessCsv(strong([
      '2026-09-17 08:00,Push,00:30:00,Bench,W,20,12,,,,,',
      '2026-09-17 08:00,Push,00:30:00,Bench,F,60,7,,,,,',
      '2026-09-17 08:00,Push,00:30:00,Bench,D,40,10,,,,,',
    ], strongHeader.replace('Weight,', 'Weight (kg),')))
    expect(result.workouts[0].exercises[0].sets.map(set => set.kind).sort()).toEqual(['drop', 'failure', 'warmup'])
  })

  it('keeps Strong sessions with different times and exercises in a shuffled file', () => {
    const rows = [
      '2026-09-17 18:00,Push,30m,Bench,1,70,8,,,,,',
      '2026-09-17 08:00,Push,30m,Row,1,40,10,,,,,',
      '2026-09-17 08:00,Push,30m,Bench,1,60,10,,,,,',
    ]
    expect(parseFitnessCsv(strong(rows), { weightUnit: 'kg' }).workouts).toHaveLength(2)
    expect(parseFitnessCsv(strong(rows), { weightUnit: 'kg' })).toEqual(parseFitnessCsv(strong([...rows].reverse()), { weightUnit: 'kg' }))
  })

  it('groups FitNotes by date, converts each row unit, preserves empty metrics and repeats', () => {
    const result = parseFitnessCsv(fit([
      '2026-09-17,Bench,Chest,100,lb,8,,,,First',
      '2026-09-16,Run,Cardio,,,,2,mi,20:30,Outside',
      '2026-09-17,Bench,Chest,100,lb,8,,,,First',
      '2026-09-17,Plank,Core,,,,,,01:05,Hold',
    ]))
    expect(result.source).toBe('fitnotes')
    expect(result.workouts).toHaveLength(2)
    expect(result.workouts[0].exercises[0].sets[0]).toEqual({ weightKg: null, reps: null, distanceMeters: 3218.688, durationSeconds: 1230, rpe: null, kind: 'normal', notes: 'Outside' })
    expect(result.workouts[1].exercises[0].sets).toHaveLength(2)
    expect(result.workouts[1].durationSeconds).toBeNull()
    expect(result.warnings.join(' ')).toMatch(/FitNotes.*fecha/i)
  })

  it('supports semicolon exports with quoted decimal commas and explicit row units', () => {
    const csv = 'Date;Workout Name;Workout Duration;Exercise Name;Set Order;Weight;Weight Unit;Reps;Distance;Distance Unit;Seconds;Notes;Workout Notes;RPE\n2026-09-17 08:00;Push;30m;Bench;1;"62,5";kg;8;;;;;;"8,5"'
    expect(parseFitnessCsv(csv).workouts[0].exercises[0].sets[0]).toMatchObject({ weightKg: 62.5, rpe: 8.5 })
  })

  it('requires date order for ambiguous numeric dates and rejects invalid rollovers', () => {
    const csv = fit(['09/10/2026,Bench,Chest,20,kg,8,,,,'])
    error(csv, 'date-order', 2)
    expect(parseFitnessCsv(csv, { dateOrder: 'dmy' }).workouts[0].date).toBe('2026-10-09')
    expect(parseFitnessCsv(csv, { dateOrder: 'mdy' }).workouts[0].date).toBe('2026-09-10')
    for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-09-17 24:00']) error(fit([`${date},Bench,Chest,20,kg,8,,,,`]), 'date', 2)
    expect(parseFitnessCsv(fit(['2024-02-29,Bench,Chest,20,kg,8,,,,'])).workouts[0].date).toBe('2024-02-29')
  })

  it('uses explicit offsets without changing the source calendar date', () => {
    const result = parseFitnessCsv(hevy(['Push,2026-09-17T23:30:00-04:00,2026-09-18T00:15:00-04:00,,Bench,,,0,normal,60,8,,,']))
    expect(result.workouts[0]).toMatchObject({ date: '2026-09-17', startedAt: '2026-09-17T23:30:00-04:00', durationSeconds: 2700 })
  })

  it('does not import the valid prefix of a malformed file and reports physical line', () => {
    error(hevy([
      'Push,2026-09-17 08:00,2026-09-17 09:00,,Bench,,"First\nsecond",0,normal,60,8,,,',
      'Push,2026-09-17 08:00,2026-09-17 09:00,,Bench,,,1,normal,NaN,8,,,',
    ]), 'number', 4)
  })

  it.each(['-2', '8abc', 'NaN', 'Infinity', '1e309'])('rejects malformed or negative weight %s', value => {
    error(fit([`2026-09-17,Bench,Chest,${value},kg,8,,,,`]), 'number', 2)
  })

  it('rejects fractional repetitions, invalid effort and malformed duration', () => {
    error(fit(['2026-09-17,Bench,Chest,20,kg,8.5,,,,']), 'number', 2)
    error(hevy(['Push,2026-09-17 08:00,2026-09-17 09:00,,Bench,,,0,normal,20,8,,,11']), 'number', 2)
    error(fit(['2026-09-17,Run,Cardio,,,,1,km,01:70:00,']), 'number', 2)
  })

  it('rejects missing/unknown units and never silently drops a distance', () => {
    error(fit(['2026-09-17,Bench,Chest,20,stone,8,,,,']), 'weight-unit', 2)
    error(fit(['2026-09-17,Run,Cardio,,,,1,,10:00,']), 'distance-unit', 2)
    error(strong(['2026-09-17 08:00,Run,10m,Run,1,,,1,600,,,']), 'distance-unit', 2)
    expect(parseFitnessCsv(strong(['2026-09-17 08:00,Run,10m,Run,1,,,1,600,,,']), { distanceUnit: 'km' }).workouts[0].exercises[0].sets[0].distanceMeters).toBe(1000)
  })

  it('rejects unfamiliar set types instead of turning uncertain rows into training metrics', () => {
    error(hevy(['Push,2026-09-17 08:00,2026-09-17 09:00,,Bench,,,0,cluster,60,8,,,']), 'set-type', 2)
    error(hevy(['Push,2026-09-17 08:00,2026-09-17 09:00,,Bench,,,0,constructor,60,8,,,']), 'set-type', 2)
  })

  it('rejects bad CSV, inconsistent columns, duplicate headers and missing exercise names', () => {
    error(fit(['2026-09-17,"Bench,Chest,20,kg,8,,,,']), 'csv', 2)
    error(fit(['2026-09-17,"Bench"x,Chest,20,kg,8,,,,']), 'csv', 2)
    error(fit(['2026-09-17,Bench,Chest,20,kg,8']), 'row', 2)
    error(fitHeader + ',Reps\n2026-09-17,Bench,Chest,20,kg,8,,,,,8', 'header', 1)
    error(fit(['2026-09-17,,Chest,20,kg,8,,,,']), 'row', 2)
    error('name,value\nhello,1', 'format')
    error('', 'empty')
    error(fitHeader, 'empty')
  })

  it('rejects mismatched chosen formats and contradictory session metadata', () => {
    error(fit(['2026-09-17,Bench,Chest,20,kg,8,,,,']), 'format', undefined, { source: 'strong' })
    error(hevy([
      'Push,2026-09-17 08:00,2026-09-17 09:00,,Bench,,,0,normal,20,8,,,',
      'Push,2026-09-17 08:00,2026-09-17 10:00,,Bench,,,1,normal,40,8,,,',
    ]), 'row', 3)
    error(hevy(['Push,2026-09-17 09:00,2026-09-17 08:00,,Bench,,,0,normal,20,8,,,']), 'date', 2)
  })

  it('bounds file size and row count before returning imported sessions', () => {
    error('x'.repeat(5 * 1024 * 1024 + 1), 'limit')
    error(fit(Array(20_001).fill('2026-09-17,Bench,Chest,20,kg,8,,,,')), 'limit')
  })

  it('keeps source set order when the export has no numeric set index', () => {
    const result = parseFitnessCsv(fit([
      '2026-09-17,Bench,Chest,80,kg,8,,,,First',
      '2026-09-17,Bench,Chest,60,kg,10,,,,Drop',
    ]))
    expect(result.workouts[0].exercises[0].sets.map(set => set.weightKg)).toEqual([80, 60])
    const rows = [
      '2026-09-17 08:00,Push,30m,Bench,W,20,12,,,,,',
      '2026-09-17 08:00,Push,30m,Bench,1,60,8,,,,,',
      '2026-09-17 08:00,Push,30m,Bench,D,40,10,,,,,',
    ]
    expect(parseFitnessCsv(strong(rows), { weightUnit: 'kg' }).workouts[0].exercises[0].sets.map(set => set.kind)).toEqual(['warmup', 'normal', 'drop'])
  })

  it('rejects oversized duration and conversion values with a useful row error', () => {
    error(strong(['2026-09-17 08:00,Push,999999999999999999999h,Bench,1,60,8,,,,,']), 'number', 2, { weightUnit: 'kg' })
    error(strong(['2026-09-17 08:00,Push,9007199254740990,Bench,1,60,8,,,,,']), 'number', 2, { weightUnit: 'kg' })
    error(fit(['2026-09-17,Run,Cardio,,,,9007199254740990,mi,10:00,']), 'number', 2)
  })

  it('rejects malformed Hevy set indices instead of losing their order', () => {
    for (const index of ['-1', '1.5', 'wrong']) error(hevy([`Push,2026-09-17 08:00,2026-09-17 09:00,,Bench,,,${index},normal,60,8,,,`]), 'number', 2)
  })

  it('does not accept invented month names that happen to start like September', () => {
    error(hevy(['Push,"17 Septober 2026, 08:00","17 Sep 2026, 09:00",,Bench,,,0,normal,60,8,,,']), 'date', 2)
  })

  it('keeps superset membership as exercise notes when the target has no superset field', () => {
    const result = parseFitnessCsv(hevy(['Push,2026-09-17 08:00,2026-09-17 09:00,,Bench,2,Pause,0,normal,60,8,,,']))
    expect(result.workouts[0].exercises[0].notes).toContain('2')
    expect(result.workouts[0].exercises[0].notes).toContain('Pause')
    expect(result.warnings.join(' ')).toMatch(/superserie/i)
  })

  it('rejects more than 128 columns and handles leading blank lines in semicolon CSV', () => {
    error(Array.from({ length: 129 }, (_, index) => `column${index}`).join(','), 'limit', 1)
    const csv = '\uFEFF\n\nDate;Exercise;Category;Weight;Weight Unit;Reps\n2026-09-17;Bench;Chest;20;kg;8'
    expect(parseFitnessCsv(csv).workouts[0].exercises[0].sets[0].weightKg).toBe(20)
  })

  it('preserves explicit zero values and rejects contradictory parallel unit columns', () => {
    const result = parseFitnessCsv(fit(['2026-09-17,Push Up,Chest,0,kg,0,0,m,00:00,Attempt']))
    expect(result.workouts[0].exercises[0].sets[0]).toMatchObject({ reps: 0, weightKg: 0, distanceMeters: 0, durationSeconds: 0 })
    const csv = 'Date,Exercise,Category,Weight (kg),Weight (lbs),Reps,Distance,Distance Unit,Time,Notes,Kind\n2026-09-17,Bench,Chest,20,100,8,,,,,wr'
    error(csv, 'row', 2)
  })

  it('preserves Strong rest time in notes while counting only actual sets', () => {
    const result = parseFitnessCsv(strong([
      '2026-09-17 08:00,Push,30m,Bench,1,60,8,,,,,',
      '2026-09-17 08:00,Push,30m,Bench,Rest Timer,,,,90,Long pause,,',
    ], strongHeader.replace('Weight,', 'Weight (kg),')))
    expect(result.workouts[0].exercises[0].sets).toHaveLength(1)
    expect(result.workouts[0].exercises[0].sets[0]).toMatchObject({ reps: 8, weightKg: 60, durationSeconds: null, kind: 'normal' })
    expect(result.workouts[0].exercises[0].notes).toContain('90 s')
    expect(result.workouts[0].exercises[0].notes).toContain('Long pause')
    expect(result.warnings.join(' ')).toMatch(/descanso/i)
  })

  it('does not invent a workout or exercise from rest-only rows', () => {
    error(strong(['2026-09-17 08:00,Push,30m,Bench,Rest Timer,,,,90,,,']), 'empty')
    const result = parseFitnessCsv(hevy([
      'Push,2026-09-17 08:00,2026-09-17 09:00,,Bench,,,0,normal,60,8,,,',
      'Rest,2026-09-18 08:00,2026-09-18 09:00,,Rest,,,0,rest,,,,90,',
    ]))
    expect(result.workouts).toHaveLength(1)
    expect(result.workouts[0].exercises).toHaveLength(1)
  })

  it('retains repeated pauses and separate rest rows as notes without losing their count', () => {
    const result = parseFitnessCsv(strong([
      '2026-09-17 08:00,Push,30m,Bench,1,60,8,,,,,',
      '2026-09-17 08:00,Push,30m,Bench,Rest Timer,,,,90,,,',
      '2026-09-17 08:00,Push,30m,Bench,Rest Timer,,,,90,,,',
      '2026-09-17 08:00,Push,30m,Rest,Rest Timer,,,,30,,,',
    ], strongHeader.replace('Weight,', 'Weight (kg),')))
    expect(result.workouts[0].exercises).toHaveLength(1)
    expect(result.workouts[0].exercises[0].notes.match(/90 s/g)).toHaveLength(2)
    expect(result.workouts[0].notes).toContain('30 s')
  })

  it('keeps a renamed session identity with or without an exported workout ID', () => {
    const header = 'title,start_time,end_time,exercise_title,set_index,set_type,weight_kg,reps'
    const row = ',2024-06-01 10:00,2024-06-01 11:00,Bench,0,normal,60,8'
    const original = parseFitnessCsv(header + '\nPush' + row).workouts[0]
    const renamed = parseFitnessCsv(header + '\nUpper body' + row).workouts[0]
    expect(renamed.sourceKey).toBe(original.sourceKey)
    expect(renamed.title).toBe('Upper body')

    const identified = parseFitnessCsv(header + ',workout_id\nPush' + row + ',workout-42').workouts[0]
    const corrected = parseFitnessCsv(header + ',workout_id\nUpper body' + row.replace('10:00', '10:15') + ',workout-42').workouts[0]
    expect(corrected.sourceKey).toBe(identified.sourceKey)
    expect(corrected.startedAt).toBe('2024-06-01T10:15:00')
    expect(corrected.sourceKey).not.toBe(renamed.sourceKey)
  })

  it('uses Strong workout numbers as identity instead of the editable title or start time', () => {
    const header = strongHeader + ',Workout Number'
    const one = parseFitnessCsv(strong(['2024-06-01 10:00,Push,30m,Bench,1,60,8,,,,,,42'], header), { weightUnit: 'kg' })
    const two = parseFitnessCsv(strong(['2024-06-01 10:15,Upper,30m,Bench,1,60,8,,,,,,42'], header), { weightUnit: 'kg' })
    expect(two.workouts[0].sourceKey).toBe(one.workouts[0].sourceKey)
  })

  it('rejects contradictory titles at the same start instead of inventing separate sessions', () => {
    error(hevy([
      'Push,2024-06-01 10:00,2024-06-01 11:00,,Bench,,,0,normal,60,8,,,',
      'Upper,2024-06-01 10:00,2024-06-01 11:00,,Bench,,,1,normal,60,8,,,',
    ]), 'row', 3)
  })

  it('rejects conflicting starts sharing one explicit source ID inside the same file', () => {
    const csv = 'title,start_time,end_time,exercise_title,set_index,set_type,weight_kg,reps,workout_id\nPush,2024-06-01 10:00,2024-06-01 11:00,Bench,0,normal,60,8,workout-42\nPush,2024-06-01 10:15,2024-06-01 11:00,Bench,1,normal,60,8,workout-42'
    error(csv, 'row', 3)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { SessionExerciseDisclosure } from '../SessionExerciseDisclosure'
import { buildSessionDebrief } from '../sessionDebrief'
import { HistorySessionList } from '../HistorySessionList'
import { CalendarDayPanel } from '@/components/calendar/CalendarDayPanel'

vi.mock('@/components/navigation/PendingLink', () => ({ PendingLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))

describe('timed session exercise disclosure', () => {
  it('shows the original FitNotes civil date without exposing its internal noon anchor', () => {
    const session = { id: 'date-only', workoutId: null, date: '2026-03-08', dateOnly: '2026-03-08', completedAt: '2026-03-08T16:00:00Z', workoutName: 'FitNotes', focus: null, durationMinutes: 0, durationMin: 0, durationRecorded: false, volumeRecorded: false, volumeKg: 0, sets: 2, signal: null, searchText: 'fitnotes' }
    const history = renderToStaticMarkup(<I18nProvider language="es" timeZone="America/Havana"><HistorySessionList rows={[session]} todayStr="2026-03-08" /></I18nProvider>)
    const calendar = renderToStaticMarkup(<I18nProvider language="es" timeZone="America/Havana"><CalendarDayPanel date="2026-03-08" sessions={[session]} /></I18nProvider>)
    for (const html of [history, calendar]) {
      expect(html).not.toContain('12:00')
      expect(html).toContain('8')
      expect(html).toContain('/history/date-only')
    }
  })
  it('does not turn unknown duration or volume into zero in history and calendar rows', () => {
    const session = { id: 'imported', workoutId: null, date: '2026-09-17', completedAt: '2026-09-17T12:00:00Z', workoutName: 'Importado', focus: null, durationMinutes: 0, durationMin: 0, durationRecorded: false, volumeRecorded: false, volumeKg: 0, sets: 2, signal: null, searchText: 'importado' }
    const history = renderToStaticMarkup(<I18nProvider language="es"><HistorySessionList rows={[session]} todayStr="2026-09-17" /></I18nProvider>)
    const calendar = renderToStaticMarkup(<I18nProvider language="es"><CalendarDayPanel date="2026-09-17" sessions={[session]} /></I18nProvider>)
    for (const html of [history, calendar]) {
      expect(html).not.toContain('0 min')
      expect(html).not.toContain('0 kg')
      expect(html).toContain('/history/imported')
    }
  })
  it('shows imported set kinds, distance and missing values without zero-weight claims', () => {
    const result = buildSessionDebrief({ durationMinutes: 0, exercises: [{ id: 'import', exerciseId: 'walk', exerciseName: 'Walking', muscleGroups: [], setsCompleted: 1, weightsKg: [null], repsCompleted: [null], rpeValues: [null], notes: null, importedSets: [{ weightKg: null, reps: null, durationSeconds: 40, distanceMeters: 120, rpe: null, kind: 'warmup', notes: 'Suave' }] }], previousByExercise: new Map() })
    const html = renderToStaticMarkup(<I18nProvider language="es"><SessionExerciseDisclosure index={0} exercise={result.exercises[0]} /></I18nProvider>)
    expect(html).toContain('Calentamiento')
    expect(html).toContain('40 s')
    expect(html).toContain('120 m')
    expect(html).toContain('Suave')
    expect(html).not.toContain('0 kg')
  })
  it.each(['es', 'en'] as const)('renders actual seconds without zero-weight rows or a false comparison in %s', language => {
    const result = buildSessionDebrief({ durationMinutes: 5, exercises: [{ id: 'timed', exerciseId: 'walk', exerciseName: 'Walking', muscleGroups: [], setsCompleted: 2, weightsKg: [0, 0], repsCompleted: [0, 0], rpeValues: [null, null], notes: null, durationSeconds: [45, 30] }], previousByExercise: new Map([['walk', { weightsKg: [0], repsCompleted: [0], rpeValues: [null] }]]) })
    const html = renderToStaticMarkup(<I18nProvider language={language}><SessionExerciseDisclosure index={0} exercise={result.exercises[0]} /></I18nProvider>)
    expect(html).toContain('75 s')
    expect(html).toContain('45 s')
    expect(html).toContain('30 s')
    expect(html).not.toContain('0 kg')
    expect(html).not.toContain('Igual que')
    expect(html).not.toContain('Same as previous')
  })
})

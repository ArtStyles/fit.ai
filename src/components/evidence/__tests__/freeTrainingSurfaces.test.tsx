import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { DashboardWeekJourney } from '@/components/dashboard/DashboardWeekJourney'
import { buildDashboardViewModel } from '@/components/dashboard/dashboardViewModel'
import { MonthGrid } from '@/components/calendar/MonthGrid'
import { ProgressHub } from '@/components/progress/ProgressHub'
import { aggregateLogsToDays, computeIntensityThresholds } from '@/lib/calendar/aggregate'

// Next navigation needs its browser router; links are incidental to these SSR assertions.
vi.mock('@/components/navigation/PendingLink', () => ({ PendingLink: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }))

const render = (children: ReactNode) => renderToStaticMarkup(<I18nProvider language="es" timeZone="UTC">{children}</I18nProvider>)
function dashboard(durationMinutes: number) {
  const completedEvidence = { logId: 'free', workoutId: null, workoutName: 'Entrenamiento libre', focus: null, durationMinutes, completedAt: '2026-09-11T12:00:00Z', source: 'snapshot' as const }
  return buildDashboardViewModel({
    needsPlan: false, checkInDue: false, aiNotes: null, promo: null, todayWorkout: null, isCompletedToday: false, hasSessionToday: true,
    nextWorkout: null, nextWorkoutIsoDay: null, recoverableWorkout: null, recoverableIsoDay: null,
    weekDays: [
      { isoDay: 4, dateStr: '2026-09-10', scheduledWorkout: null, completedEvidence: { ...completedEvidence, logId: 'past' }, isScheduledWorkoutCompleted: false, hasTrainingEvidence: true, canStartScheduledWorkout: false, isToday: false, isRecoverable: false },
      { isoDay: 5, dateStr: '2026-09-11', scheduledWorkout: null, completedEvidence, isScheduledWorkoutCompleted: false, hasTrainingEvidence: true, canStartScheduledWorkout: false, isToday: true, isRecoverable: false },
    ],
    sessionsThisWeek: 2, scheduledThisWeek: 0, streak: 2, weekVolumeKg: 0, volumeSeries: [], hasCompletedSessions: true,
    dailyBriefMessage: null, latestSession: null, topRecord: null, activeAdjustmentCount: 0, timeZone: 'UTC', referenceInstant: '2026-09-11T12:00:00Z',
  })
}

describe('free training evidence presentation', () => {
  it('shows planless attendance without a zero target or invented completion duration', () => {
    const html = render(<DashboardWeekJourney dashboard={dashboard(0)} />)
    expect(html).toContain('2 sesiones registradas')
    expect(html).not.toContain('de 0 sesiones')
    expect(html).not.toContain('>0 min<')
    expect(render(<DashboardWeekJourney dashboard={dashboard(35)} />)).toContain('35 min')
  })

  it('announces attendance without inventing volume or duration, including mixed recorded days', () => {
    const free = { id: 'free', completed_at: '2026-09-11T12:00:00Z', duration_minutes: null, mobile_session_kind: 'free', mobile_free_training: { detailLevel: 'attendance' } }
    const days = aggregateLogsToDays([free], [], 'UTC')
    const month = (items: typeof days) => render(<MonthGrid year={2026} month={9} todayStr="2026-09-11" selectedDate="2026-09-11" byDate={new Map(items.map(day => [day.date, day]))} thresholds={computeIntensityThresholds(items)} onSelectDate={() => {}} onPrev={() => {}} onNext={() => {}} onToday={() => {}} />)
    expect(month(days)).toContain('aria-label="2026-09-11: 1 sesiones, hoy"')
    const mixed = aggregateLogsToDays([free, { id: 'planned', completed_at: '2026-09-11T10:00:00Z', duration_minutes: 30 }], [{ progress_log_id: 'planned', weights_kg: [20], reps_completed: [10] }], 'UTC')
    expect(month(mixed)).toContain('aria-label="2026-09-11: 2 sesiones, 200 kg, 30 min, hoy"')
    const timed = aggregateLogsToDays([{ ...free, duration_minutes: 25 }], [], 'UTC')
    expect(month(timed)).toContain('aria-label="2026-09-11: 1 sesiones, 25 min, hoy"')
  })

  it('describes incomplete period differences as recorded volume rather than a training decline', () => {
    const html = render(<ProgressHub todayStr="2026-09-11" locale="es" sessions={[
      { id: 'prior', completedAt: '2026-05-01T12:00:00Z', date: '2026-05-01', durationMinutes: 30, volumeKg: 1000 },
      { id: 'partial', completedAt: '2026-09-11T12:00:00Z', date: '2026-09-11', durationMinutes: 0, volumeKg: 100, detailLevel: 'partial' },
    ]} days={[]} records={[]} measurements={[]} exercisePoints={[]} />)
    expect(html).toContain('Cambio de volumen registrado')
    expect(html).toContain('Volumen registrado:')
    expect(html).not.toContain('El volumen bajó')
  })
})

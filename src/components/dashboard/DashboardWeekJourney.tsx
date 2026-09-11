'use client'

import { useState, type ReactNode } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Dumbbell,
  Moon,
} from 'lucide-react'

import { useI18n } from '@/components/i18n/I18nProvider'
import { PendingLink } from '@/components/navigation/PendingLink'
import { TimelineNode, TimelineRail } from '@/components/training/TimelineRail'
import { cn } from '@/lib/utils'

import { DASHBOARD_DAY_KEYS } from './dashboardI18n'
import { NextRecommendation } from './NextRecommendation'
import { SecondaryMetrics } from './SecondaryMetrics'
import type {
  DashboardTimelineItem,
  DashboardToday,
  DashboardViewModel,
  DashboardCompletedEvidence,
} from './dashboardViewModel'

function toneLabel(tone: DashboardTimelineItem['tone'], t: (source: string) => string) {
  if (tone === 'completed') return t('Completado')
  if (tone === 'recovered') return t('Otro día')
  if (tone === 'active') return t('Hoy')
  if (tone === 'rest') return t('Descanso')
  if (tone === 'missed') return t('Pendiente')
  return t('Próximo')
}

function civilDateLabel(date: string, language: string) {
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'es-ES', {
    weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))
}

function OtherDateCompletionLink({ evidence }: { evidence: DashboardCompletedEvidence }) {
  const { t, language } = useI18n()
  if (!evidence.completedDate) return null
  return (
    <PendingLink href={`/history/${evidence.logId}`} className="mt-2 block min-h-11 rounded-xl border border-blue-400/50 bg-blue-500/10 px-4 py-3 text-sm text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-blue-300">
      {evidence.workoutName} · {t('Completada el {date}', { date: civilDateLabel(evidence.completedDate, language) })}
    </PendingLink>
  )
}

function JourneySegment({
  items,
  title,
}: {
  items: DashboardTimelineItem[]
  title: string
}) {
  const { t, language } = useI18n()
  const [activeMessage, setActiveMessage] = useState<string | null>(null)

  if (items.length === 0) return null

  return (
    <section aria-label={title} className="py-2">
      <h3 className="sr-only">{title}</h3>
      <TimelineRail>
        {items.map(item => {
          const dayName = t(DASHBOARD_DAY_KEYS[item.isoDay])
          const dateNumber = Number(item.dateStr.slice(-2))
          const evidence = item.completedEvidence ?? item.completionOnAnotherDate
          const otherDate = item.completionOnAnotherDate
          const completedWithPreviousPlan = Boolean(
            evidence &&
            item.scheduledWorkout &&
            evidence.isFromActivePlan !== true &&
            !item.isScheduledWorkoutCompleted,
          )
          const unavailableMessage = !item.scheduledWorkout
            ? t('Día de descanso, aprovecha para recuperar')
            : item.position === 'past'
              ? t('Esta rutina quedó fuera de la ventana de recuperación.')
              : t('Esta rutina aún no está disponible. Solo puedes iniciar la rutina de hoy.')
          const body = (
            <div className={cn(
              'min-h-14 rounded-2xl border border-border/70 bg-[hsl(var(--surface-1))] px-4 py-3 transition-[border-color,transform] duration-[var(--motion-press)] motion-reduce:transition-none',
              item.tone === 'completed' && 'border-[hsl(var(--training-complete)/0.35)]',
              item.tone === 'recovered' && 'border-blue-400/50 bg-blue-500/10',
              item.tone === 'missed' && 'border-[hsl(var(--training-warning)/0.35)]',
            )}>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {dayName} · {dateNumber}
                  </p>
                  <p className="mt-1 truncate text-base font-semibold text-foreground">
                    {evidence?.workoutName ?? item.scheduledWorkout?.name ?? t('Día de descanso')}
                  </p>
                  {evidence && evidence.durationMinutes > 0 && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t('{minutes} min', { minutes: evidence.durationMinutes })}
                    </p>
                  )}
                  {completedWithPreviousPlan && (
                    <div className="mt-2 space-y-1 text-sm leading-snug">
                      <p className="font-medium text-[hsl(var(--training-complete))]">
                        {t('Realizado con el plan anterior')}
                      </p>
                      <p className="text-muted-foreground">
                        {t('Programado en tu plan actual: {workout}', {
                          workout: item.scheduledWorkout!.name,
                        })}
                      </p>
                    </div>
                  )}
                </div>
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                  {toneLabel(item.tone, t)}
                </span>
              </div>
              {item.tone === 'recovered' && otherDate?.completedDate && (
                <p className="mt-2 text-sm font-medium text-blue-700 dark:text-blue-300">
                  {t('Completada el {date}', { date: civilDateLabel(otherDate.completedDate, language) })}
                </p>
              )}
              {item.completedEvidence?.sourceDate && item.completedEvidence.sourceDate !== item.dateStr && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('Sesión del {date}', { date: civilDateLabel(item.completedEvidence.sourceDate, language) })}
                </p>
              )}
            </div>
          )

          return (
            <TimelineNode key={item.isoDay} tone={item.tone} label={toneLabel(item.tone, t)}>
              {evidence ? (
                <PendingLink
                  href={`/history/${evidence.logId}`}
                  aria-label={`${t('Ver sesión completada')}: ${evidence.workoutName}`}
                  className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  {body}
                </PendingLink>
              ) : item.scheduledWorkout && item.isRecoverable && item.canStartScheduledWorkout ? (
                <PendingLink
                  href={`/session/${item.scheduledWorkout.id}`}
                  aria-label={item.scheduledWorkout.name}
                  className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  {body}
                </PendingLink>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveMessage(unavailableMessage)}
                  aria-label={unavailableMessage}
                  className="block min-h-11 w-full rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  {body}
                </button>
              )}
              {item.completedEvidence && otherDate?.completedDate && (
                <OtherDateCompletionLink evidence={otherDate} />
              )}
            </TimelineNode>
          )
        })}
      </TimelineRail>
      <p aria-live="polite" className="min-h-6 pl-8 pt-2 text-sm leading-relaxed text-muted-foreground">
        {activeMessage ?? ''}
      </p>
    </section>
  )
}

function CompletedSessionLink({ today }: { today: DashboardToday }) {
  const { t, language } = useI18n()
  const evidence = today.completedEvidence
  if (!evidence) return null
  return (
    <div className="mt-3">
      {evidence.sourceDate && evidence.sourceDate !== evidence.completedDate && (
        <p className="text-sm text-muted-foreground">{t('Sesión del {date}', { date: civilDateLabel(evidence.sourceDate, language) })}</p>
      )}
      <PendingLink href={`/history/${evidence.logId}`} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl text-sm font-semibold text-[hsl(var(--training-complete))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
        {t('Ver sesión completada')}<ArrowRight className="h-4 w-4" aria-hidden="true" />
      </PendingLink>
    </div>
  )
}

function TodayJourneyCard({ today }: { today: DashboardToday }) {
  const { t } = useI18n()

  if (today.state === 'needs-plan') return null

  if (today.state === 'rest') {
    return (
      <section aria-labelledby="today-title" className="rounded-3xl border border-border/70 bg-[hsl(var(--surface-2))] p-5 shadow-xl shadow-black/10">
        <div className="flex items-center gap-2 text-violet-300">
          <Moon className="h-5 w-5" aria-hidden="true" />
          <p className="text-xs font-bold uppercase tracking-[0.16em]">{t('Hoy')}</p>
        </div>
        <h2 id="today-title" className="mt-4 font-display text-2xl font-bold text-foreground">{t('Día de descanso')}</h2>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          {t('Recupera energía hoy para llegar preparado a tu próxima sesión.')}
        </p>
        {today.nextWorkout && today.nextWorkoutIsoDay ? (
          <div className="mt-5 rounded-2xl border border-border/70 bg-background/60 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{t('Próxima sesión')}</p>
            <p className="mt-2 font-semibold text-foreground">{today.nextWorkout.name}</p>
            <p className="mt-1 text-sm text-violet-300">{t(DASHBOARD_DAY_KEYS[today.nextWorkoutIsoDay])}</p>
          </div>
        ) : (
          <p className="mt-5 text-sm font-medium text-foreground">{t('No hay otra sesión programada esta semana.')}</p>
        )}
      </section>
    )
  }

  if (today.state === 'completed-for-today') {
    const completedWithPreviousPlan = Boolean(today.completedEvidence && today.workout && today.completedEvidence.isFromActivePlan !== true)
    return (
      <section aria-labelledby="today-title" className="rounded-3xl border border-[hsl(var(--training-complete)/0.35)] bg-[hsl(var(--training-complete)/0.08)] p-5">
        <div className="flex items-center gap-2 text-[hsl(var(--training-complete))]">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          <p className="text-xs font-bold uppercase tracking-[0.16em]">{t('Completado hoy')}</p>
        </div>
        <h2 id="today-title" className="mt-4 font-display text-2xl font-bold text-foreground">
          {today.completedEvidence?.workoutName ?? t('Ya completaste una sesión hoy.')}
        </h2>
        {today.completedEvidence && today.completedEvidence.durationMinutes > 0 && (
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">
            {t('{minutes} min', { minutes: today.completedEvidence.durationMinutes })}
          </p>
        )}
        {completedWithPreviousPlan && (
          <div className="mt-3 space-y-1 text-sm leading-snug">
            <p className="font-medium text-[hsl(var(--training-complete))]">
              {t('Realizado con el plan anterior')}
            </p>
            <p className="text-muted-foreground">
              {t('Programado en tu plan actual: {workout}', { workout: today.workout!.name })}
            </p>
          </div>
        )}
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          {today.nextWorkout && today.nextWorkoutIsoDay
            ? t('Tu próxima sesión es {workout} el {day}.', {
                workout: today.nextWorkout.name,
                day: t(DASHBOARD_DAY_KEYS[today.nextWorkoutIsoDay]),
              })
            : t('No hay otra sesión programada esta semana.')}
        </p>
        <CompletedSessionLink today={today} />
      </section>
    )
  }

  const workout = today.workout
  if (!workout) return null

  if (today.state === 'completed') {
    return (
      <section aria-labelledby="today-title" className="rounded-3xl border border-[hsl(var(--training-complete)/0.35)] bg-[hsl(var(--training-complete)/0.08)] p-5">
        <div className="flex items-center gap-2 text-[hsl(var(--training-complete))]">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          <p className="text-xs font-bold uppercase tracking-[0.16em]">{t('Completado hoy')}</p>
        </div>
        <h2 id="today-title" className="mt-4 font-display text-2xl font-bold text-foreground">
          {today.completedEvidence?.workoutName ?? workout.name}
        </h2>
        {today.completedEvidence && today.completedEvidence.durationMinutes > 0 && (
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">
            {t('{minutes} min', { minutes: today.completedEvidence.durationMinutes })}
          </p>
        )}
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          {t('La sesión de hoy ya está hecha. Prioriza tu recuperación.')}
        </p>
        <CompletedSessionLink today={today} />
      </section>
    )
  }

  return (
    <section aria-labelledby="today-title" className="relative overflow-hidden rounded-3xl border border-violet-300/25 bg-gradient-to-br from-[#171323] via-[#121019] to-[hsl(var(--surface-1))] p-5 shadow-[0_24px_64px_-30px_rgba(139,92,246,0.8)]">
      <div aria-hidden="true" className="absolute -right-14 -top-14 h-40 w-40 rounded-full bg-violet-500/15 blur-3xl" />
      <div className="relative">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">{t('Entrenamiento de hoy')}</p>
        <h2 id="today-title" className="mt-3 text-balance font-display text-3xl font-extrabold leading-tight text-foreground">{workout.name}</h2>
        {workout.focus && <p className="mt-2 text-base text-muted-foreground">{workout.focus}</p>}
        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-foreground/90">
          {workout.exercise_count > 0 && (
            <span className="inline-flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-violet-300" aria-hidden="true" />
              {t(workout.exercise_count === 1 ? '{count} ejercicio' : '{count} ejercicios', { count: workout.exercise_count })}
            </span>
          )}
          {workout.estimated_duration_minutes && (
            <span className="inline-flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-violet-300" aria-hidden="true" />
              {t('{minutes} min', { minutes: workout.estimated_duration_minutes })}
            </span>
          )}
        </div>
        {today.href && (
          <PendingLink
            href={today.href}
            className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--training-action))] px-5 text-base font-extrabold text-slate-950 shadow-lg shadow-lime-950/20 transition-[transform,filter] duration-[var(--motion-press)] hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--training-action))] focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
          >
            {t('Empezar entrenamiento')}
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </PendingLink>
        )}
      </div>
    </section>
  )
}

export function DashboardWeekJourney({ dashboard, companion }: { dashboard: DashboardViewModel; companion?: ReactNode }) {
  const { t } = useI18n()
  const currentItem = dashboard.weekly.timeline.find(item => item.position === 'today')
  const beforeToday = currentItem
    ? dashboard.weekly.timeline.filter(item => item.position === 'past')
    : []
  const afterToday = currentItem
    ? dashboard.weekly.timeline.filter(item => item.position === 'future')
    : []

  return (
    <section aria-labelledby="week-journey-title" className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-x-8">
      <div className="lg:col-start-1 lg:row-start-1">
        <div className="flex items-end justify-between gap-4 border-b border-border/60 pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">{t('Esta semana')}</p>
            <h2 id="week-journey-title" className="mt-1 font-display text-2xl font-bold text-foreground">{t('Semana en curso')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(dashboard.weekly.scheduled === 0 ? '{completed} sesiones registradas' : '{completed} de {scheduled} sesiones', {
                completed: dashboard.weekly.completed,
                scheduled: dashboard.weekly.scheduled,
              })}
            </p>
          </div>
          <PendingLink href="/calendario" className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
            {t('Ver calendario')}
          </PendingLink>
        </div>
        {currentItem && <JourneySegment items={beforeToday} title={t('Pasado')} />}
      </div>

      {(currentItem || companion || process.env.NEXT_PUBLIC_LOCAL_APP === 'true') && (
        <div className="space-y-4 py-4 lg:col-start-2 lg:row-start-1 lg:py-0">
          {process.env.NEXT_PUBLIC_LOCAL_APP === 'true' && <PendingLink href="/registrar" className="group block rounded-2xl border border-violet-400/30 bg-violet-500/[0.07] p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet-300">{t('A tu manera')}</p>
            <p className="mt-2 font-display text-xl font-semibold text-foreground">{t('Registrar entrenamiento')}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t('¿Ya entrenaste? Guarda tu constancia y los detalles que quieras.')}</p>
          </PendingLink>}
          {currentItem?.completionOnAnotherDate && !currentItem.hasTrainingEvidence && (
            <JourneySegment items={[currentItem]} title={t('Otro día')} />
          )}
          {currentItem && (currentItem.hasTrainingEvidence || !currentItem.isScheduledWorkoutCompleted) && <TodayJourneyCard today={dashboard.today} />}
          {currentItem?.completionOnAnotherDate && currentItem.hasTrainingEvidence && <OtherDateCompletionLink evidence={currentItem.completionOnAnotherDate} />}
          {companion}
        </div>
      )}

      <div className="lg:col-start-1 lg:row-start-2">
        {currentItem && <JourneySegment items={afterToday} title={t('Próximo')} />}
        <PendingLink href="/plan" className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
          {t('Ver plan completo')}
        </PendingLink>
      </div>

      <aside aria-label={t('Tu progreso')} className="min-w-0 space-y-5 pt-7 lg:col-start-2 lg:row-start-2 lg:self-start lg:pt-4">
        <NextRecommendation recommendation={dashboard.recommendation} />
        <SecondaryMetrics metrics={dashboard.secondaryMetrics} />
      </aside>
    </section>
  )
}

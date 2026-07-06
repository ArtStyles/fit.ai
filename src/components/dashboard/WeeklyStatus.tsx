'use client'

import { useState } from 'react'
import { CheckCircle2, Dumbbell, Moon } from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'
import { useI18n } from '@/components/i18n/I18nProvider'
import { cn } from '@/lib/utils'
import type { DashboardViewModel } from './dashboardViewModel'

const DAY_INITIALS = {
  es: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
} as const

export function WeeklyStatus({ weekly }: { weekly: DashboardViewModel['weekly'] }) {
  const { language, t } = useI18n()
  const [activeMessage, setActiveMessage] = useState<string | null>(null)
  if (weekly.days.length === 0) return null
  const todayIso = weekly.days.find(day => day.isToday)?.isoDay ?? 0

  return (
    <section aria-labelledby="weekly-title">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.12em] text-violet-300">{t('Esta semana')}</p>
          <h2 id="weekly-title" className="mt-1 font-display text-xl font-bold text-foreground">
            {t('{completed} de {scheduled} sesiones', { completed: weekly.completed, scheduled: weekly.scheduled })}
          </h2>
        </div>
        <PendingLink href="/calendario" className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-violet-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
          {t('Ver calendario')}
        </PendingLink>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1.5" aria-label={t('Estado semanal')}>
        {weekly.days.map(day => {
          const dayNumber = Number(day.dateStr.slice(-2))
          const Icon = day.isCompleted ? CheckCircle2 : day.workout ? Dumbbell : Moon
          const unavailableMessage = !day.workout
            ? t('Día de descanso, aprovecha para recuperar')
            : day.isoDay < todayIso
              ? t('Esta rutina quedó fuera de la ventana de recuperación.')
              : t('Esta rutina aún no está disponible. Solo puedes iniciar la rutina de hoy.')
          const content = (
            <span className={cn(
              'flex min-h-14 flex-col items-center justify-center rounded-xl border px-1 py-2 text-center transition-colors motion-reduce:transition-none',
              day.isToday ? 'border-violet-400 bg-violet-500/15 text-violet-100' : 'border-border/70 bg-card text-foreground',
              day.isCompleted && 'border-violet-400/40 bg-violet-500/10',
            )}>
              <span className="text-xs font-semibold text-muted-foreground">{DAY_INITIALS[language][day.isoDay - 1]}</span>
              <span className="mt-0.5 text-sm font-bold">{dayNumber}</span>
              <Icon className="mt-1 h-3.5 w-3.5 text-violet-300" aria-hidden="true" />
            </span>
          )

          if (day.isCompleted && day.completedLogId) {
            return <PendingLink key={day.isoDay} href={`/history/${day.completedLogId}`} aria-label={t('Ver sesión completada')} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">{content}</PendingLink>
          }
          if (day.workout && (day.isToday || day.isRecoverable)) {
            return <PendingLink key={day.isoDay} href={`/session/${day.workout.id}`} aria-label={day.workout.name} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">{content}</PendingLink>
          }
          return (
            <button
              key={day.isoDay}
              type="button"
              onClick={() => setActiveMessage(unavailableMessage)}
              aria-label={unavailableMessage}
              className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              {content}
            </button>
          )
        })}
      </div>

      <p aria-live="polite" className="mt-3 min-h-6 text-base leading-relaxed text-muted-foreground">
        {activeMessage ?? ''}
      </p>

      <PendingLink href="/plan" className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-violet-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
        {t('Ver plan completo')}
      </PendingLink>
    </section>
  )
}

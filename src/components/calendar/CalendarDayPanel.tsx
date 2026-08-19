'use client'

import { CalendarDays } from 'lucide-react'
import { SessionSummaryRow } from '@/components/evidence/SessionSummaryRow'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { CalendarSessionSummary } from './calendarViewModel'

function formatDate(dateStr: string, language: 'es' | 'en'): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

function formatVolume(value: number, language: 'es' | 'en'): string {
  return `${new Intl.NumberFormat(language === 'en' ? 'en-US' : 'es-ES', { maximumFractionDigits: 0 }).format(value)} kg`
}

export function CalendarDayPanel({ date, sessions }: { date: string; sessions: CalendarSessionSummary[] }) {
  const { language, timeZone, t } = useI18n()
  const dateLabel = formatDate(date, language)

  return (
    <aside className="rounded-3xl border border-border/60 bg-muted/[0.06] p-4 sm:p-5" aria-labelledby="calendar-selected-day">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-300">{t('Día seleccionado')}</p>
      <h2 id="calendar-selected-day" className="mt-1 font-display text-2xl font-bold capitalize text-foreground">{dateLabel}</h2>

      {sessions.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border/60 px-4 py-8 text-center">
          <CalendarDays className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-foreground">{t('Sin sesiones este día')}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('Selecciona otro día para revisar su entrenamiento.')}</p>
        </div>
      ) : (
        <div className="mt-4">
          {sessions.map(session => (
            <SessionSummaryRow
              key={session.id}
              href={`/history/${session.id}`}
              dateLabel={new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'es-ES', {
                hour: 'numeric',
                minute: '2-digit',
                timeZone,
              }).format(new Date(session.completedAt))}
              title={session.workoutName}
              context={session.focus}
              metrics={[
                { label: t('Duración'), value: `${session.durationMin} min` },
                { label: t('Series'), value: String(session.sets) },
                { label: t('Volumen'), value: formatVolume(session.volumeKg, language) },
              ]}
            />
          ))}
        </div>
      )}
    </aside>
  )
}

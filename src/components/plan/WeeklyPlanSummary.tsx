import { CalendarDays, Dumbbell, Timer } from 'lucide-react'
import type { PlanDaySummary } from './planViewModel'

function averageDuration(days: PlanDaySummary[]): number | null {
  const durations = days
    .map(day => day.durationMinutes)
    .filter((value): value is number => typeof value === 'number' && value > 0)

  if (durations.length === 0) return null
  return Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
}

export function WeeklyPlanSummary({
  days,
  t,
}: {
  days: PlanDaySummary[]
  t: (source: string, values?: Record<string, string | number>) => string
}) {
  const scheduledDays = days.filter(day => day.isScheduled)
  const totalExercises = days.reduce((sum, day) => sum + day.exerciseCount, 0)
  const averageMinutes = averageDuration(days)

  return (
    <section className="overflow-hidden rounded-3xl border border-violet-500/25 bg-gradient-to-br from-violet-500/15 via-muted/10 to-background p-5 shadow-lg shadow-violet-950/10 sm:p-6">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-200">
          {t('Resumen semanal')}
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold leading-tight text-foreground sm:text-3xl">
          {t('Tu plan de la semana de un vistazo')}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t('Revisa días, duración y volumen antes de editar detalles o pedir cambios al coach.')}
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/50 bg-background/45 p-4">
          <CalendarDays className="h-5 w-5 text-violet-300" />
          <p className="mt-3 text-2xl font-bold text-foreground">{scheduledDays.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('sesiones programadas')}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-background/45 p-4">
          <Dumbbell className="h-5 w-5 text-violet-300" />
          <p className="mt-3 text-2xl font-bold text-foreground">{totalExercises}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('ejercicios en la semana')}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-background/45 p-4">
          <Timer className="h-5 w-5 text-violet-300" />
          <p className="mt-3 text-2xl font-bold text-foreground">
            {averageMinutes ? t('{minutes} min', { minutes: averageMinutes }) : '—'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t('duración promedio')}</p>
        </div>
      </div>
    </section>
  )
}

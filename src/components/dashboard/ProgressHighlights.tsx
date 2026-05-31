import { Activity, ChevronRight, Medal, TrendingUp } from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'

type LatestSession = {
  id: string
  workoutName: string
  completedAt: string
  durationMinutes: number | null
} | null

type TopRecord = {
  logId: string
  exerciseId: string
  exerciseName: string
  maxWeightKg: number
  repsAtMaxWeight: number
} | null

type ProgressHighlightsProps = {
  latestSession: LatestSession
  topRecord: TopRecord
  activeAdjustments: number
}

function formatRelativeDate(value: string): string {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return 'Hoy'
  if (date.toDateString() === yesterday.toDateString()) return 'Ayer'

  return new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'short',
  }).format(date)
}

function formatWeight(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'Sin carga'
  return Number.isInteger(value) ? `${value} kg` : `${value.toFixed(1)} kg`
}

export function ProgressHighlights({
  latestSession,
  topRecord,
  activeAdjustments,
}: ProgressHighlightsProps) {
  if (!latestSession && !topRecord && activeAdjustments === 0) return null

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 px-0.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70">Progreso inteligente</span>
        <div className="h-px flex-1 bg-border/40" />
      </div>

      <div className="grid gap-2.5">
        {latestSession && (
          <PendingLink
            href={`/history/${latestSession.id}`}
            className="group flex items-center gap-3 rounded-xl border border-border/60 bg-muted/10 p-4 transition-colors hover:border-violet-500/30 hover:bg-violet-500/5"
            spinnerClassName="h-3.5 w-3.5"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
              <Activity className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Última sesión</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {latestSession.workoutName} · {formatRelativeDate(latestSession.completedAt)}
                {latestSession.durationMinutes ? ` · ${latestSession.durationMinutes} min` : ''}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </PendingLink>
        )}

        {topRecord && (
          <PendingLink
            href={`/exercises/${topRecord.exerciseId}`}
            className="group relative overflow-hidden rounded-2xl border border-amber-500/25 p-4 transition-all hover:border-amber-400/50"
            spinnerClassName="h-3.5 w-3.5"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/12 via-amber-500/6 to-transparent" />
            <div className="relative flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300 shadow-[0_0_16px_rgba(245,158,11,0.2)]">
                <Medal className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-amber-400/80 mb-0.5">
                  Mejor marca personal
                </p>
                <p className="font-display text-xl font-bold text-foreground tracking-tight leading-none">
                  {formatWeight(topRecord.maxWeightKg)}
                  {topRecord.repsAtMaxWeight > 0 && (
                    <span className="text-sm font-sans font-medium text-muted-foreground ml-1">
                      × {topRecord.repsAtMaxWeight}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{topRecord.exerciseName}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
          </PendingLink>
        )}

        {activeAdjustments > 0 && (
          <PendingLink
            href="/plan"
            className="group flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 transition-colors hover:border-emerald-400/40 hover:bg-emerald-500/10"
            spinnerClassName="h-3.5 w-3.5"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Plan ajustado por tus datos</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {activeAdjustments} {activeAdjustments === 1 ? 'peso actualizado' : 'pesos actualizados'} por progreso real.
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </PendingLink>
        )}
      </div>
    </div>
  )
}

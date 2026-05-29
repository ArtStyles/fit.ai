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
      <p className="mb-2.5 px-0.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Progreso inteligente
      </p>

      <div className="grid gap-2.5">
        {latestSession && (
          <PendingLink
            href={`/history/${latestSession.id}`}
            className="group flex items-center gap-3 rounded-xl border border-border/60 bg-muted/10 p-4 transition-colors hover:border-violet-500/30 hover:bg-violet-500/5"
            spinnerClassName="h-3.5 w-3.5"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
              <Activity className="h-4.5 w-4.5" />
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
            className="group flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 transition-colors hover:border-amber-400/40 hover:bg-amber-500/10"
            spinnerClassName="h-3.5 w-3.5"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-300">
              <Medal className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Mejor marca destacada</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {topRecord.exerciseName} · {formatWeight(topRecord.maxWeightKg)}
                {topRecord.repsAtMaxWeight > 0 ? ` x ${topRecord.repsAtMaxWeight}` : ''}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </PendingLink>
        )}

        {activeAdjustments > 0 && (
          <PendingLink
            href="/plan"
            className="group flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 transition-colors hover:border-emerald-400/40 hover:bg-emerald-500/10"
            spinnerClassName="h-3.5 w-3.5"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">
              <TrendingUp className="h-4.5 w-4.5" />
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

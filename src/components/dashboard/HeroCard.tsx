import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PendingLink } from '@/components/navigation/PendingLink'
import { CheckCircle2, ChevronRight, Clock, Dumbbell, Moon, Sparkles, TrendingUp } from 'lucide-react'
import type { WorkoutSummary } from '@/app/(app)/dashboard/page'
import { cn } from '@/lib/utils'

// ── Mapeo de isoDay → nombre del día en español ───────────────────────────────
const DAY_NAMES: Record<number, string> = {
  1: 'el lunes', 2: 'el martes', 3: 'el miércoles',
  4: 'el jueves', 5: 'el viernes', 6: 'el sábado', 7: 'el domingo',
}

interface Props {
  todayWorkout:      WorkoutSummary | null
  isCompletedToday:  boolean
  planExists:        boolean
  nextWorkout:       WorkoutSummary | null
  nextWorkoutIsoDay: number | null
}

export function HeroCard({
  todayWorkout, isCompletedToday, planExists,
  nextWorkout, nextWorkoutIsoDay,
}: Props) {

  // ── Sin plan activo ───────────────────────────────────────────────────────
  if (!planExists) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/10">
          <Sparkles className="h-6 w-6 text-indigo-400" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Tu perfil está listo</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No encontramos un plan activo. Puedes reintentar la generación sin repetir el onboarding.
          </p>
        </div>
        <Button className="w-full h-12 bg-indigo-500 hover:bg-indigo-600 text-white" asChild>
          <PendingLink href="/plans/generate?autostart=1">
            <Sparkles className="mr-2 h-4 w-4" />
            Reintentar generación
          </PendingLink>
        </Button>
      </div>
    )
  }

  // ── Entrenamiento completado hoy ──────────────────────────────────────────
  if (isCompletedToday && todayWorkout) {
    return (
      <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-5 space-y-3">
        <div className="flex items-center gap-2 text-green-400">
          <CheckCircle2 className="h-5 w-5" />
          <span className="text-sm font-semibold">Entrenamiento completado</span>
        </div>
        <p className="text-xl font-bold text-foreground leading-tight">
          {todayWorkout.name}
        </p>
        {nextWorkout && nextWorkoutIsoDay && (
          <p className="text-sm text-muted-foreground">
            Tu próxima sesión: <span className="text-foreground font-medium">{nextWorkout.name}</span>
            {' '}{DAY_NAMES[nextWorkoutIsoDay]}
          </p>
        )}
      </div>
    )
  }

  // ── Día de descanso ───────────────────────────────────────────────────────
  if (!todayWorkout) {
    return (
      <div className="rounded-2xl border border-border/60 bg-muted/10 p-5 space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Moon className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">Descanso activo</span>
        </div>
        <p className="text-foreground text-sm">
          Los músculos crecen mientras descansas. Aprovecha para recuperarte.
        </p>
        {nextWorkout && nextWorkoutIsoDay && (
          <div className="flex items-center justify-between rounded-xl border border-border/40 bg-background/50 px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">Próxima sesión</p>
              <p className="text-sm font-semibold text-foreground">{nextWorkout.name}</p>
            </div>
            <div className="text-xs text-muted-foreground capitalize">
              {DAY_NAMES[nextWorkoutIsoDay]}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Workout programado para hoy ───────────────────────────────────────────
  return (
    <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-800 p-5 text-white shadow-lg shadow-indigo-900/30 space-y-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
          Hoy
        </span>
      </div>

      <div className="space-y-1">
        <p className="text-2xl font-bold leading-tight">{todayWorkout.name}</p>
        {todayWorkout.focus && (
          <p className="text-indigo-200 text-sm">{todayWorkout.focus}</p>
        )}
        {todayWorkout.progression_suggestion_count > 0 && (
          <p className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-indigo-100">
            <TrendingUp className="h-3.5 w-3.5" />
            Hoy tienes {todayWorkout.progression_suggestion_count} progresión{todayWorkout.progression_suggestion_count === 1 ? '' : 'es'} sugerida{todayWorkout.progression_suggestion_count === 1 ? '' : 's'}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {todayWorkout.exercise_count > 0 && (
          <Badge variant="secondary" className="bg-white/15 text-white border-0 text-xs">
            <Dumbbell className="mr-1 h-3 w-3" />
            {todayWorkout.exercise_count} ejercicios
          </Badge>
        )}
        {todayWorkout.estimated_duration_minutes && (
          <Badge variant="secondary" className="bg-white/15 text-white border-0 text-xs">
            <Clock className="mr-1 h-3 w-3" />
            {todayWorkout.estimated_duration_minutes} min
          </Badge>
        )}
      </div>

      <Button
        className="w-full h-14 bg-white text-indigo-700 hover:bg-indigo-50 font-bold text-base shadow-none"
        asChild
      >
        <PendingLink href={`/session/${todayWorkout.id}`}>
          Empezar entrenamiento
          <ChevronRight className="ml-1 h-5 w-5" />
        </PendingLink>
      </Button>
    </div>
  )
}

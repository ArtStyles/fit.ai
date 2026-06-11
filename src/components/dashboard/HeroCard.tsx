import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PendingLink } from '@/components/navigation/PendingLink'
import {
  CheckCircle2, ChevronRight, Clock, Dumbbell,
  Flame, Moon, RotateCcw, Sparkles, TrendingUp,
} from 'lucide-react'
import type { WorkoutSummary } from '@/app/(app)/dashboard/page'

// ── Mapeo isoDay → nombre del día ──────────────────────────────────────────────
const DAY_NAMES: Record<number, string> = {
  1: 'el lunes', 2: 'el martes', 3: 'el miércoles',
  4: 'el jueves', 5: 'el viernes', 6: 'el sábado', 7: 'el domingo',
}

interface Props {
  todayWorkout:        WorkoutSummary | null
  isCompletedToday:    boolean
  planExists:          boolean
  nextWorkout:         WorkoutSummary | null
  nextWorkoutIsoDay:   number | null
  recoverableWorkout:  WorkoutSummary | null
  recoverableIsoDay:   number | null
  streak:              number
  weekDone:            number
  weekTotal:           number
}

// ── Week progress bar (static SVG arc) ────────────────────────────────────────

function WeekRing({ done, total }: { done: number; total: number }) {
  if (total === 0) return null
  const pct     = Math.min(done / total, 1)
  const radius  = 18
  const circ    = 2 * Math.PI * radius
  const offset  = circ * (1 - pct)

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative h-12 w-12">
        <svg className="-rotate-90" width="48" height="48" viewBox="0 0 48 48">
          {/* Track */}
          <circle
            cx="24" cy="24" r={radius}
            strokeWidth="4" fill="transparent"
            className="stroke-white/10"
          />
          {/* Progress */}
          <circle
            cx="24" cy="24" r={radius}
            strokeWidth="4" fill="transparent"
            strokeLinecap="round"
            strokeDasharray={`${circ} ${circ}`}
            strokeDashoffset={offset}
            className="stroke-white/80 transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[11px] font-bold text-white/90 tabular-nums leading-none">
            {done}/{total}
          </span>
        </div>
      </div>
      <span className="text-[9px] font-semibold uppercase tracking-wider text-white/50">
        semana
      </span>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HeroCard({
  todayWorkout, isCompletedToday, planExists,
  nextWorkout, nextWorkoutIsoDay,
  recoverableWorkout, recoverableIsoDay, streak,
  weekDone, weekTotal,
}: Props) {

  // ── Sin plan activo ───────────────────────────────────────────────────────
  if (!planExists) {
    return (
      <div className="fitai-shimmer rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center space-y-3">
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
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-[0_22px_55px_-15px_rgba(5,150,105,0.55)] space-y-3">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-700 via-green-600 to-teal-700" />
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <span className="fitai-aurora-blob fitai-aurora-blob--1 bg-emerald-300/40" />
          <span className="fitai-aurora-blob fitai-aurora-blob--2 bg-teal-300/40" />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_75%_at_50%_-15%,_rgba(255,255,255,0.18),_transparent_60%)]" />
        <div className="fitai-grain pointer-events-none absolute inset-0 opacity-[0.07]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/25" />

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-200">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-semibold">¡Completado hoy!</span>
          </div>
          <div className="flex items-center gap-3">
            {streak >= 2 && (
              <span className="fitai-pop flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-sm font-bold text-white">
                <Flame className="h-4 w-4 text-orange-300" />
                {streak}
              </span>
            )}
            <WeekRing done={weekDone} total={weekTotal} />
          </div>
        </div>
        <p className="relative font-display text-2xl font-extrabold leading-tight tracking-tight drop-shadow-sm">
          {todayWorkout.name}
        </p>
        {nextWorkout && nextWorkoutIsoDay && (
          <p className="relative text-sm text-emerald-200/80">
            Próxima: <span className="text-white font-medium">{nextWorkout.name}</span>
            {' '}{DAY_NAMES[nextWorkoutIsoDay]}
          </p>
        )}
      </div>
    )
  }

  // ── Día de descanso ───────────────────────────────────────────────────────
  if (!todayWorkout) {
    return (
      <div className="relative rounded-2xl border border-border/40 bg-gradient-to-br from-muted/20 to-muted/5 p-5 space-y-3 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.025] bg-[radial-gradient(circle_at_70%_30%,_white,_transparent_60%)]" />

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Moon className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Día de descanso</span>
          </div>
          <WeekRing done={weekDone} total={weekTotal} />
        </div>
        <p className="relative text-sm text-muted-foreground leading-relaxed">
          Los músculos crecen mientras descansas. Aprovecha para recuperarte.
        </p>
        {recoverableWorkout && recoverableIsoDay && (
          <PendingLink
            href={`/session/${recoverableWorkout.id}`}
            className="relative flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 transition-colors hover:bg-amber-500/10"
            aria-label={`Recuperar ${recoverableWorkout.name}`}
          >
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-400">
                <RotateCcw className="h-3 w-3" />
                Sesión pendiente
              </p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">
                {recoverableWorkout.name}
                <span className="ml-1.5 font-normal text-muted-foreground capitalize">
                  · de{' '}{DAY_NAMES[recoverableIsoDay]}
                </span>
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-amber-400" />
          </PendingLink>
        )}
        {nextWorkout && nextWorkoutIsoDay && (
          <div className="relative flex items-center justify-between rounded-xl border border-border/50 bg-background/40 px-4 py-3 backdrop-blur-sm">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
                Próxima sesión
              </p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">{nextWorkout.name}</p>
            </div>
            <span className="text-xs font-medium text-muted-foreground capitalize">
              {DAY_NAMES[nextWorkoutIsoDay]}
            </span>
          </div>
        )}
      </div>
    )
  }

  // ── Workout programado para hoy ───────────────────────────────────────────
  return (
    <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-[0_22px_55px_-15px_rgba(91,33,182,0.65)] space-y-4">
      {/* Aurora animada + profundidad */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-700 via-indigo-600 to-purple-800" />
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="fitai-aurora-blob fitai-aurora-blob--1 bg-fuchsia-500/40" />
        <span className="fitai-aurora-blob fitai-aurora-blob--2 bg-indigo-400/40" />
        <span className="fitai-aurora-blob fitai-aurora-blob--3 bg-orange-500/30" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_75%_at_50%_-15%,_rgba(255,255,255,0.20),_transparent_60%)]" />
      <div className="fitai-grain pointer-events-none absolute inset-0 opacity-[0.08]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/25" />

      <div className="relative space-y-4">
        {/* Top row: badge + week ring */}
        <div className="flex items-start justify-between">
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
            Hoy
          </span>
          <WeekRing done={weekDone} total={weekTotal} />
        </div>

        <div className="space-y-1">
          <p className="font-display text-[1.7rem] font-extrabold leading-[1.05] tracking-tight drop-shadow-sm">{todayWorkout.name}</p>
          {todayWorkout.focus && (
            <p className="text-indigo-200 text-sm">{todayWorkout.focus}</p>
          )}
          {todayWorkout.progression_suggestion_count > 0 && (
            <p className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-indigo-100">
              <TrendingUp className="h-3.5 w-3.5" />
              {todayWorkout.progression_suggestion_count}{' '}
              {todayWorkout.progression_suggestion_count === 1 ? 'progresión sugerida' : 'progresiones sugeridas'}
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
          className="fitai-cta-ring w-full h-14 bg-white text-violet-700 hover:bg-white/90 font-bold text-base
            shadow-[0_0_24px_rgba(255,255,255,0.22)] hover:shadow-[0_0_36px_rgba(255,255,255,0.38)]
            transition-shadow duration-300"
          asChild
        >
          <PendingLink href={`/session/${todayWorkout.id}`}>
            Empezar entrenamiento
            <ChevronRight className="ml-1 h-5 w-5" />
          </PendingLink>
        </Button>
      </div>
    </div>
  )
}

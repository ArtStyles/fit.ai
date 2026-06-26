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
  // Palabra fantasma de fondo: primer grupo muscular del focus (o del nombre)
  const ghostWord = (todayWorkout.focus || todayWorkout.name)
    .split(/[—\-·|,/]/)[0]
    .trim()
    .split(/\s+/)[0]
    ?.toUpperCase() ?? ''

  return (
    <div className="relative overflow-hidden rounded-3xl p-5 text-white shadow-[0_28px_70px_-20px_rgba(91,33,182,0.75)] ring-1 ring-white/10 space-y-5">
      {/* Base con más profundidad: oscuro → violeta → azul nocturno */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#3b0f7a] via-[#5b21b6] to-[#1e1b4b]" />
      {/* Aurora animada */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="fitai-aurora-blob fitai-aurora-blob--1 bg-fuchsia-500/45" />
        <span className="fitai-aurora-blob fitai-aurora-blob--2 bg-indigo-400/45" />
        <span className="fitai-aurora-blob fitai-aurora-blob--3 bg-orange-500/35" />
      </div>
      {/* Palabra fantasma del grupo muscular (estilo cartel) */}
      {ghostWord && (
        <span
          aria-hidden
          className="font-display pointer-events-none absolute -bottom-6 -right-3 select-none text-[7rem] font-black uppercase leading-[0.8] tracking-tight text-white/[0.06]"
        >
          {ghostWord}
        </span>
      )}
      {/* Luz cenital + viñeta inferior para dar volumen */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-20%,_rgba(255,255,255,0.22),_transparent_55%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/35 to-transparent" />
      <div className="fitai-grain pointer-events-none absolute inset-0 opacity-[0.08]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/30" />

      <div className="relative space-y-5">
        {/* Top row: badge "live" + week ring */}
        <div className="flex items-start justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ring-1 ring-white/15 backdrop-blur-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-300" />
            </span>
            Hoy
          </span>
          <WeekRing done={weekDone} total={weekTotal} />
        </div>

        {/* Título + focus como antetítulo */}
        <div className="space-y-1.5">
          {todayWorkout.focus && (
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-200/80">
              {todayWorkout.focus}
            </p>
          )}
          <p className="font-display text-[2rem] font-extrabold leading-[1.02] tracking-tight drop-shadow-sm">
            {todayWorkout.name}
          </p>
          {todayWorkout.progression_suggestion_count > 0 && (
            <p className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-indigo-100 ring-1 ring-white/10">
              <TrendingUp className="h-3.5 w-3.5" />
              {todayWorkout.progression_suggestion_count}{' '}
              {todayWorkout.progression_suggestion_count === 1 ? 'progresión sugerida' : 'progresiones sugeridas'}
            </p>
          )}
        </div>

        {/* Meta en línea con separador */}
        <div className="flex items-center gap-3 text-sm font-semibold text-white/90">
          {todayWorkout.exercise_count > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Dumbbell className="h-4 w-4 text-violet-200" />
              {todayWorkout.exercise_count} ejercicios
            </span>
          )}
          {todayWorkout.exercise_count > 0 && todayWorkout.estimated_duration_minutes && (
            <span className="h-1 w-1 rounded-full bg-white/30" />
          )}
          {todayWorkout.estimated_duration_minutes && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-violet-200" />
              {todayWorkout.estimated_duration_minutes} min
            </span>
          )}
        </div>

        <Button
          className="fitai-cta-ring group/cta w-full h-14 rounded-2xl bg-white text-violet-700 hover:bg-white font-bold text-base
            shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)] transition-all duration-300"
          asChild
        >
          <PendingLink href={`/session/${todayWorkout.id}`}>
            Empezar entrenamiento
            <span className="ml-2 flex h-7 w-7 items-center justify-center rounded-full bg-violet-700 text-white transition-transform duration-300 group-hover/cta:translate-x-0.5">
              <ChevronRight className="h-4 w-4" />
            </span>
          </PendingLink>
        </Button>
      </div>
    </div>
  )
}

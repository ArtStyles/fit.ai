'use client'

import { useMemo, useState } from 'react'
import {
  CalendarDays,
  ChevronRight,
  Clock,
  Dumbbell,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PendingLink } from '@/components/navigation/PendingLink'
import { getWorkoutDisplayName } from '@/lib/workouts/display'
import { cn } from '@/lib/utils'

type WorkoutSummary = {
  name: string
  focus: string | null
}

type ExerciseSummary = {
  name: string
}

export type HistoryProgressLogRow = {
  id: string
  workout_id: string | null
  completed_at: string
  duration_minutes: number | null
  mood_rating: number | null
  workout: WorkoutSummary | WorkoutSummary[] | null
}

export type HistoryExerciseLogRow = {
  progress_log_id: string
  exercise_id: string | null
  weights_kg: number[] | null
  reps_completed: number[] | null
  exercise?: ExerciseSummary | ExerciseSummary[] | null
}

type HistoryMode = 'all' | 'week' | 'volume'

interface HistorySessionListProps {
  sessionLogs: HistoryProgressLogRow[]
  exerciseLogs: HistoryExerciseLogRow[]
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(value))
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('es', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function getWorkout(row: HistoryProgressLogRow): WorkoutSummary | null {
  if (Array.isArray(row.workout)) return row.workout[0] ?? null
  return row.workout
}

function getExerciseName(row: HistoryExerciseLogRow): string | null {
  if (Array.isArray(row.exercise)) return row.exercise[0]?.name ?? null
  return row.exercise?.name ?? null
}

function volumeFor(logId: string, rows: HistoryExerciseLogRow[]): number {
  return rows
    .filter(row => row.progress_log_id === logId)
    .reduce((total, row) => {
      const weights = row.weights_kg ?? []
      const reps = row.reps_completed ?? []
      return total + weights.reduce((sum, weight, index) => {
        return sum + (Number(weight) || 0) * (Number(reps[index]) || 0)
      }, 0)
    }, 0)
}

function getWeekStart(): Date {
  const now = new Date()
  const mondayOffset = (now.getDay() + 6) % 7
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - mondayOffset)
  return start
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function HistorySessionList({ sessionLogs, exerciseLogs }: HistorySessionListProps) {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<HistoryMode>('all')

  const filteredLogs = useMemo(() => {
    const normalizedQuery = normalize(query.trim())
    const weekStart = getWeekStart().getTime()

    const rows = sessionLogs
      .map(log => {
        const workout = getWorkout(log)
        const workoutName = workout
          ? getWorkoutDisplayName(workout.name, workout.focus)
          : 'Entrenamiento'
        const exerciseNames = exerciseLogs
          .filter(row => row.progress_log_id === log.id)
          .map(getExerciseName)
          .filter(Boolean)
          .join(' ')
        const volume = Math.round(volumeFor(log.id, exerciseLogs))
        const dateLabel = `${formatDate(log.completed_at)} ${formatTime(log.completed_at)}`
        const haystack = normalize([
          workoutName,
          exerciseNames,
          workout?.focus ?? '',
          dateLabel,
          `${log.duration_minutes ?? 0} min`,
          `${volume} kg`,
        ].join(' '))

        return { log, workout, workoutName, volume, dateLabel, haystack }
      })
      .filter(row => {
        if (mode === 'week' && new Date(row.log.completed_at).getTime() < weekStart) {
          return false
        }

        if (!normalizedQuery) return true
        return row.haystack.includes(normalizedQuery)
      })

    if (mode === 'volume') {
      return [...rows].sort((a, b) =>
        b.volume - a.volume ||
        new Date(b.log.completed_at).getTime() - new Date(a.log.completed_at).getTime(),
      )
    }

    return rows
  }, [exerciseLogs, mode, query, sessionLogs])

  const modes: { value: HistoryMode; label: string }[] = [
    { value: 'all', label: 'Todas' },
    { value: 'week', label: 'Esta semana' },
    { value: 'volume', label: 'Mayor volumen' },
  ]

  return (
    <section className="mt-8">
      <div className="animate-in fade-in slide-in-from-bottom-2 rounded-2xl border border-border/60 bg-muted/10 p-3 duration-500">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Buscar rutina, foco o fecha"
            className="h-11 w-full rounded-xl border border-border/60 bg-background/70 pl-9 pr-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
            <SlidersHorizontal className="h-4 w-4" />
          </div>
          {modes.map(item => (
            <button
              key={item.value}
              type="button"
              onClick={() => setMode(item.value)}
              className={cn(
                'h-10 shrink-0 rounded-lg border px-3 text-xs font-medium transition-colors',
                mode === item.value
                  ? 'border-violet-500/40 bg-violet-500/15 text-violet-100'
                  : 'border-border/50 bg-background/50 text-muted-foreground hover:border-violet-500/30 hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {filteredLogs.length === sessionLogs.length
            ? `${sessionLogs.length} sesiones`
            : `${filteredLogs.length} de ${sessionLogs.length} sesiones`}
        </p>
        {mode !== 'all' || query ? (
          <button
            type="button"
            onClick={() => {
              setMode('all')
              setQuery('')
            }}
            className="text-xs font-medium text-violet-300 hover:text-violet-200"
          >
            Limpiar filtros
          </button>
        ) : null}
      </div>

      {filteredLogs.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
          <Search className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold text-foreground">Sin resultados</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Prueba con otro nombre, foco o rango.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {filteredLogs.map(({ log, workout, workoutName, volume }, index) => (
            <PendingLink
              key={log.id}
              href={`/history/${log.id}`}
              className="animate-in fade-in slide-in-from-bottom-2 block rounded-2xl border border-border/60 bg-muted/10 p-4 transition-colors hover:border-violet-500/30 hover:bg-violet-500/5"
              spinnerClassName="h-3.5 w-3.5"
              style={{ animationDelay: `${Math.min(index, 6) * 35}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium capitalize text-muted-foreground">
                    {formatDate(log.completed_at)} · {formatTime(log.completed_at)}
                  </p>
                  <h2 className="mt-1 font-display text-lg font-semibold text-foreground">
                    {workoutName}
                  </h2>
                  {workout?.focus && (
                    <p className="mt-1 text-sm text-muted-foreground">{workout.focus}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {log.mood_rating && (
                    <Badge variant="ghost" className="border border-border/50">
                      ánimo {log.mood_rating}/5
                    </Badge>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center rounded-md bg-background/60 px-2 py-1">
                  <Clock className="mr-1 h-3.5 w-3.5" />
                  {log.duration_minutes ?? 0} min
                </span>
                <span className="inline-flex items-center rounded-md bg-background/60 px-2 py-1">
                  <Dumbbell className="mr-1 h-3.5 w-3.5" />
                  {volume} kg
                </span>
                <span className="inline-flex items-center rounded-md bg-background/60 px-2 py-1">
                  <CalendarDays className="mr-1 h-3.5 w-3.5" />
                  completado
                </span>
              </div>
            </PendingLink>
          ))}
        </div>
      )}
    </section>
  )
}

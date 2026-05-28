'use client'

import { ChevronDown, ChevronUp, SkipForward, TrendingUp } from 'lucide-react'
import { cn }    from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { SetRow } from './SetRow'
import { useSessionStore } from '@/store/sessionStore'
import type { ExerciseSession } from '@/store/sessionStore'

interface Props {
  exercise: ExerciseSession
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ExerciseSession['status'] }) {
  if (status === 'completed') {
    return (
      <span className="text-[11px] font-semibold text-green-400">
        ✓ Completado
      </span>
    )
  }
  if (status === 'skipped') {
    return (
      <span className="text-[11px] font-semibold text-muted-foreground line-through">
        Saltado
      </span>
    )
  }
  if (status === 'active') {
    return (
      <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse inline-block" />
    )
  }
  return null
}

// ─── ExerciseCard ─────────────────────────────────────────────────────────────

export function ExerciseCard({ exercise }: Props) {
  const {
    workoutExerciseId: weId,
    status,
    expanded,
    sets,
    name,
    muscleGroups,
    notes,
    targetReps,
    isCompound,
    suggestedWeight,
    weightSuggestionBasis,
  } = exercise

  const toggleExpanded  = useSessionStore(s => s.toggleExpanded)
  const updateSetField  = useSessionStore(s => s.updateSetField)
  const selectRpe       = useSessionStore(s => s.selectRpe)
  const completeSet     = useSessionStore(s => s.completeSet)
  const skipExercise    = useSessionStore(s => s.skipExercise)

  const isActive    = status === 'active'
  const isCompleted = status === 'completed'
  const isSkipped   = status === 'skipped'
  const canExpand   = status !== 'skipped'

  // Número de series completadas
  const completedSets = sets.filter(s => s.completed).length

  return (
    <div className={cn(
      'rounded-xl border transition-all overflow-hidden',
      isActive    && 'border-indigo-500/60 bg-indigo-500/5 shadow-sm shadow-indigo-900/20',
      isCompleted && 'border-green-500/20 bg-green-500/5',
      isSkipped   && 'border-border/30 bg-transparent opacity-50',
      !isActive && !isCompleted && !isSkipped && 'border-border/40 bg-muted/5',
    )}>
      {/* ── Cabecera del card ─────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => canExpand && toggleExpanded(weId)}
        disabled={!canExpand}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3.5 text-left',
          'focus-visible:outline-none',
          canExpand && 'cursor-pointer',
        )}
      >
        {/* Indicador de estado lateral */}
        <div className={cn(
          'shrink-0 w-1 h-8 rounded-full',
          isActive    && 'bg-indigo-500',
          isCompleted && 'bg-green-500',
          isSkipped   && 'bg-muted-foreground/20',
          !isActive && !isCompleted && !isSkipped && 'bg-border/40',
        )} />

        {/* Info principal */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn(
              'text-sm font-semibold truncate',
              isActive    && 'text-indigo-200',
              isCompleted && 'text-green-300',
              isSkipped   && 'text-muted-foreground line-through',
              !isActive && !isCompleted && !isSkipped && 'text-foreground/80',
            )}>
              {name}
            </span>
            {isCompound && (
              <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0 h-4 border-0 bg-muted/30 text-muted-foreground">
                compuesto
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            {muscleGroups.slice(0, 2).map(g => (
              <span key={g} className="text-[11px] text-muted-foreground capitalize">
                {g}
              </span>
            ))}
            {muscleGroups.length > 2 && (
              <span className="text-[11px] text-muted-foreground">
                +{muscleGroups.length - 2}
              </span>
            )}
          </div>
        </div>

        {/* Estado + progreso */}
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={status} />
          {!isSkipped && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {completedSets}/{sets.length}
            </span>
          )}
          {canExpand && (
            expanded
              ? <ChevronUp  className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* ── Contenido expandido ───────────────────────────────────────────── */}
      {expanded && !isSkipped && (
        <div className="px-3 pb-3 space-y-2">
          {/* Nota del ejercicio */}
          {notes && (
            <p className="text-xs text-muted-foreground bg-muted/20 rounded-lg px-3 py-2">
              {notes}
            </p>
          )}

          {/* Target reps */}
          {targetReps && (
            <p className="text-xs text-indigo-300 px-1">
              Objetivo: {targetReps} reps · RPE {exercise.targetRpe}
            </p>
          )}

          {weightSuggestionBasis === 'based_on_previous_logs' && suggestedWeight !== null && (
            <div className="inline-flex items-center gap-1.5 rounded-md border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-200">
              <TrendingUp className="h-3 w-3" />
              Ajustado por tu progreso
            </div>
          )}

          {/* Cabecera de la tabla */}
          <div className="grid grid-cols-[28px_1fr_1fr_64px_44px] gap-1.5 px-1">
            <span className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">#</span>
            <span className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Peso</span>
            <span className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Reps</span>
            <span className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">RPE</span>
            <span />
          </div>

          {/* Filas de series */}
          {sets.map((set, i) => (
            <SetRow
              key={i}
              setNumber={i + 1}
              data={set}
              isActive={isActive}
              onWeightChange={v => updateSetField(weId, i, 'weightKg', v)}
              onRepsChange={v   => updateSetField(weId, i, 'reps', v)}
              onRpeChange={rpe  => selectRpe(weId, i, rpe)}
              onComplete={() => {
                completeSet(weId, i)
                if ('vibrate' in navigator) navigator.vibrate(50)
              }}
            />
          ))}

          {/* Botón Saltar ejercicio */}
          {isActive && (
            <button
              type="button"
              onClick={() => skipExercise(weId)}
              className="mt-1 w-full flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <SkipForward className="h-3.5 w-3.5" />
              Saltar ejercicio
            </button>
          )}
        </div>
      )}
    </div>
  )
}

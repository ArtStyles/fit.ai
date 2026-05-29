'use client'

import { ChevronDown, ChevronUp, Repeat2, SkipForward, Trash2, TrendingUp } from 'lucide-react'
import { cn }    from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { SetRow } from './SetRow'
import { SessionExercisePicker } from '@/components/session/SessionExercisePicker'
import { useSessionStore } from '@/store/sessionStore'
import type { ExerciseSession, SessionExerciseDraft } from '@/store/sessionStore'

interface Props {
  exercise: ExerciseSession
  exerciseOptions: SessionExerciseDraft[]
}

const SKIP_REASONS = ['Sin equipo', 'Fatiga', 'Dolor', 'Tiempo']

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

export function ExerciseCard({ exercise, exerciseOptions }: Props) {
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
    source,
    originalName,
    skipReason,
  } = exercise

  const toggleExpanded  = useSessionStore(s => s.toggleExpanded)
  const updateSetField  = useSessionStore(s => s.updateSetField)
  const selectRpe       = useSessionStore(s => s.selectRpe)
  const completeSet     = useSessionStore(s => s.completeSet)
  const skipExercise    = useSessionStore(s => s.skipExercise)
  const replaceExercise = useSessionStore(s => s.replaceSessionExercise)
  const removeExercise  = useSessionStore(s => s.removeSessionExercise)

  const isActive    = status === 'active'
  const isCompleted = status === 'completed'
  const isSkipped   = status === 'skipped'
  const canExpand   = status !== 'skipped'
  const hasCompletedSets = sets.some(set => set.completed)
  const canReplace = !hasCompletedSets && !isSkipped
  const canRemove = source === 'ad_hoc' && !hasCompletedSets

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
            {source !== 'planned' && (
              <Badge variant="ghost" className="shrink-0 border border-violet-500/20 bg-violet-500/10 px-1.5 py-0 text-[10px] text-violet-200">
                solo hoy
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
          {originalName && (
            <p className="text-xs text-violet-200 bg-violet-500/10 rounded-lg px-3 py-2">
              Reemplaza solo por hoy a {originalName}.
            </p>
          )}

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
          {canReplace && (
            <details className="rounded-lg border border-border/40 bg-muted/10 p-3">
              <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-violet-200">
                <Repeat2 className="h-3.5 w-3.5" />
                Cambiar ejercicio solo por hoy
              </summary>
              <div className="mt-3">
                <SessionExercisePicker
                  options={exerciseOptions.filter(option => option.exerciseId !== exercise.exerciseId)}
                  placeholder="Buscar reemplazo"
                  onSelect={nextExercise => replaceExercise(weId, nextExercise)}
                />
              </div>
            </details>
          )}

          {canRemove && (
            <button
              type="button"
              onClick={() => removeExercise(weId)}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 py-2 text-xs text-red-300 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Quitar ejercicio agregado
            </button>
          )}

          {isActive && (
            <div className="mt-1 rounded-lg border border-border/40 bg-background/40 p-2">
              <p className="px-1 text-[11px] font-medium text-muted-foreground">
                Saltar por:
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {SKIP_REASONS.map(reason => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => skipExercise(weId, reason)}
                    className="flex items-center justify-center gap-1.5 rounded-md border border-border/50 bg-muted/10 px-2 py-2 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                  >
                    <SkipForward className="h-3.5 w-3.5" />
                    {reason}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {isSkipped && skipReason && (
        <div className="px-4 pb-3 text-xs text-muted-foreground">
          Motivo: {skipReason}
        </div>
      )}
    </div>
  )
}

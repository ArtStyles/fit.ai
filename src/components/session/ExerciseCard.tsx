'use client'

import { CheckCircle2, ChevronDown, ChevronUp, Repeat2, SkipForward, Trash2, TrendingUp } from 'lucide-react'
import { cn }    from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ExerciseImage } from '@/components/exercises/ExerciseImage'
import { SetRow } from './SetRow'
import { TimedSetRow } from './TimedSetRow'
import { SessionExercisePicker } from '@/components/session/SessionExercisePicker'
import { PreviousPerformance } from './PreviousPerformance'
import { currentSetIndex } from './sessionViewModel'
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
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Completado
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
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-violet-400 motion-reduce:animate-none" />
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
    imageUrl,
    muscleGroups,
    notes,
    targetReps,
    targetDuration,
    isCompound,
    suggestedWeight,
    weightSuggestionBasis,
    source,
    originalName,
    skipReason,
  } = exercise

  const toggleExpanded  = useSessionStore(s => s.toggleExpanded)
  const updateSetField  = useSessionStore(s => s.updateSetField)
  const updateSetDuration = useSessionStore(s => s.updateSetDuration)
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
  const activeSetIndex = currentSetIndex(sets)

  return (
    <div className={cn(
      'rounded-xl border transition-all overflow-hidden',
      isActive    && 'border-violet-500/70 bg-violet-500/[0.07] shadow-[0_0_0_1px_rgba(139,92,246,0.25),0_10px_30px_-12px_rgba(109,40,217,0.5)]',
      isCompleted && 'border-green-500/20 bg-green-500/5',
      isSkipped   && 'border-border/30 bg-transparent opacity-50',
      !isActive && !isCompleted && !isSkipped && 'border-border/40 bg-muted/5',
    )}>
      {/* ── Cabecera del card ─────────────────────────────────────────────── */}
      <div className="flex w-full items-center gap-3 px-4 py-3.5">
        {/* Indicador de estado lateral */}
        <div className={cn(
          'shrink-0 w-1 h-8 rounded-full',
          isActive    && 'bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.8)]',
          isCompleted && 'bg-green-500',
          isSkipped   && 'bg-muted-foreground/20',
          !isActive && !isCompleted && !isSkipped && 'bg-border/40',
        )} />

        {/* Miniatura del ejercicio (ampliable) */}
        <ExerciseImage
          src={imageUrl}
          alt={name}
          variant="thumb"
          zoomable
          className={cn('shrink-0', isActive ? 'h-16 w-16' : 'h-10 w-10')}
        />

        {/* Zona de expandir/colapsar */}
        <button
          type="button"
          aria-label={name}
          aria-expanded={canExpand ? expanded : undefined}
          onClick={() => canExpand && toggleExpanded(weId)}
          disabled={!canExpand}
          className={cn(
            'flex flex-1 items-center gap-3 rounded-lg text-left',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60',
            canExpand && 'cursor-pointer',
          )}
        >
          {/* Info principal */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={cn(
                'font-semibold truncate',
                isActive ? 'text-lg' : 'text-sm',
                isActive    && 'text-violet-200',
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
      </div>

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
            <p className="px-1 text-xs text-violet-300">
              Objetivo: {targetReps} reps · RPE {exercise.targetRpe}
            </p>
          )}
          {targetDuration && (
            <p className="px-1 text-xs text-violet-300">
              Objetivo: {Math.floor(targetDuration / 60)}:{String(targetDuration % 60).padStart(2, '0')} · RPE {exercise.targetRpe}
            </p>
          )}

          {weightSuggestionBasis === 'based_on_previous_logs' && suggestedWeight !== null && (
            <div className="inline-flex items-center gap-1.5 rounded-md border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-200">
              <TrendingUp className="h-3 w-3" />
              Ajustado por tu progreso
            </div>
          )}

          <PreviousPerformance performance={exercise.previousPerformance} />

          {/* Cabecera de la tabla */}
          <div className={cn('hidden gap-1.5 px-1 sm:grid', targetDuration ? 'grid-cols-[28px_1fr_112px_44px]' : 'grid-cols-[28px_1fr_1fr_112px_44px]')}>
            <span className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">#</span>
            {targetDuration ? (
              <span className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Tiempo</span>
            ) : (
              <>
                <span className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Peso</span>
                <span className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Reps</span>
              </>
            )}
            <span className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">RPE</span>
            <span />
          </div>

          {/* Filas de series */}
          {sets.map((set, i) => targetDuration ? (
            <TimedSetRow
              key={i}
              setNumber={i + 1}
              data={set}
              targetSeconds={targetDuration}
              isActive={isActive}
              isCurrent={i === activeSetIndex}
              onDurationChange={seconds => updateSetDuration(weId, i, seconds)}
              onRpeChange={rpe => selectRpe(weId, i, rpe)}
              onComplete={() => completeSet(weId, i)}
            />
          ) : (
            <SetRow
              key={i}
              setNumber={i + 1}
              data={set}
              isActive={isActive}
              isCurrent={i === activeSetIndex}
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
                    className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border border-border/50 bg-muted/10 px-2 py-2.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
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

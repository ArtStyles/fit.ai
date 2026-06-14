'use client'

import { useEffect, useState, useTransition } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { GripVertical, PencilLine, Repeat2, Trash2, TrendingUp } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LongPressMenu, type LongPressAction } from '@/components/ui'
import { SubmitButton } from '@/components/feedback/SubmitButton'
import {
  reorderWorkoutExercises,
  removeWorkoutExercise,
  replaceWorkoutExercise,
  updateWorkoutExercise,
} from '@/app/actions/plan'
import type { PlanExerciseOption, PlanWorkoutExerciseRow } from './WorkoutExerciseList'

const inputClass =
  'h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500'
const textareaClass =
  'w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500'

function getExercise(row: PlanWorkoutExerciseRow): PlanExerciseOption | null {
  if (Array.isArray(row.exercise)) return row.exercise[0] ?? null
  return row.exercise
}
function normalizeList(values: string[] | null | undefined): string[] {
  return (values ?? []).map(v => v.toLowerCase())
}
function overlapCount(a: string[] | null | undefined, b: string[] | null | undefined): number {
  const bSet = new Set(normalizeList(b))
  return normalizeList(a).filter(v => bSet.has(v)).length
}
function scoreReplacement(current: PlanExerciseOption, candidate: PlanExerciseOption): number {
  let score = overlapCount(current.muscle_groups, candidate.muscle_groups) * 4
  score += overlapCount(current.equipment, candidate.equipment)
  if (current.exercise_type && current.exercise_type === candidate.exercise_type) score += 2
  if (current.is_compound === candidate.is_compound) score += 2
  if (current.difficulty && current.difficulty === candidate.difficulty) score += 1
  return score
}
function getReplacementCandidates(current: PlanExerciseOption | null, options: PlanExerciseOption[]): PlanExerciseOption[] {
  if (!current) return options.slice(0, 4)
  return options
    .filter(o => o.id !== current.id)
    .map(o => ({ o, s: scoreReplacement(current, o) }))
    .filter(i => i.s > 0)
    .sort((a, b) => b.s - a.s || a.o.name.localeCompare(b.o.name))
    .slice(0, 4)
    .map(i => i.o)
}
function formatExerciseDetail(row: PlanWorkoutExerciseRow): string {
  return [
    row.sets && row.reps ? `${row.sets}x${row.reps}` : null,
    row.weight_kg !== null ? `${row.weight_kg} kg` : null,
    row.target_rpe ? `RPE ${row.target_rpe}` : null,
    row.rest_seconds !== null ? `${row.rest_seconds}s descanso` : null,
  ].filter(Boolean).join(' · ')
}
function formatMuscles(groups: string[] | null | undefined): string | null {
  if (!groups || groups.length === 0) return null
  return groups.slice(0, 3).join(' · ')
}

function HiddenFields({ planId, workoutExerciseId }: { planId: string; workoutExerciseId: string }) {
  return (
    <>
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="workoutExerciseId" value={workoutExerciseId} />
    </>
  )
}

function PrescriptionFields({ row }: { row?: PlanWorkoutExerciseRow }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Series</span>
        <input name="sets" type="number" min={1} max={12} defaultValue={row?.sets ?? 3} className={inputClass} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Reps</span>
        <input name="reps" type="number" min={1} max={100} defaultValue={row?.reps ?? 10} className={inputClass} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Peso kg</span>
        <input name="weightKg" type="number" min={0} step={0.25} defaultValue={row?.weight_kg ?? ''} placeholder="Opcional" className={inputClass} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Descanso seg.</span>
        <input name="restSeconds" type="number" min={0} max={600} defaultValue={row?.rest_seconds ?? 60} className={inputClass} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">RPE objetivo</span>
        <input name="targetRpe" type="number" min={1} max={10} defaultValue={row?.target_rpe ?? 8} className={inputClass} /></label>
    </div>
  )
}

export function WorkoutExerciseManager({
  planId, workoutId, exercises, exerciseOptions,
}: {
  planId: string
  workoutId: string
  exercises: PlanWorkoutExerciseRow[]
  exerciseOptions: PlanExerciseOption[]
}) {
  const [order, setOrder] = useState<PlanWorkoutExerciseRow[]>(
    [...exercises].sort((a, b) => a.order_index - b.order_index),
  )
  const [dialog, setDialog] = useState<{ kind: 'adjust' | 'replace'; row: PlanWorkoutExerciseRow } | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    setOrder([...exercises].sort((a, b) => a.order_index - b.order_index))
  }, [exercises])

  function persistOrder(next: PlanWorkoutExerciseRow[]) {
    const ids = next.map(r => r.id)
    startTransition(() => { void reorderWorkoutExercises(planId, workoutId, ids) })
  }

  function removeRow(row: PlanWorkoutExerciseRow) {
    const fd = new FormData()
    fd.set('planId', planId)
    fd.set('workoutExerciseId', row.id)
    setOrder(prev => prev.filter(r => r.id !== row.id))
    startTransition(() => { void removeWorkoutExercise(fd) })
  }

  if (order.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-border/60 bg-background/40 p-4 text-sm text-muted-foreground">
        Este entrenamiento todavía no tiene ejercicios. Agrega el primero desde el catálogo.
      </div>
    )
  }

  return (
    <div className="mt-4">
      <Reorder.Group axis="y" values={order} onReorder={(next) => { setOrder(next); persistOrder(next) }}
        className="flex flex-col gap-2">
        {order.map((row, index) => (
          <ExerciseRow
            key={row.id}
            row={row}
            index={index}
            onAdjust={() => setDialog({ kind: 'adjust', row })}
            onReplace={() => setDialog({ kind: 'replace', row })}
            onRemove={() => removeRow(row)}
          />
        ))}
      </Reorder.Group>

      <Dialog open={dialog?.kind === 'adjust'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="mx-4 max-w-sm gap-0 rounded-2xl border-border/60 bg-popover p-0">
          <DialogHeader className="border-b border-border/40 px-5 py-4">
            <DialogTitle className="text-base text-white">Ajustar series y carga</DialogTitle>
          </DialogHeader>
          {dialog?.kind === 'adjust' && (
            <form action={updateWorkoutExercise} className="space-y-3 p-5">
              <HiddenFields planId={planId} workoutExerciseId={dialog.row.id} />
              <PrescriptionFields row={dialog.row} />
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Notas</span>
                <textarea name="notes" defaultValue={dialog.row.notes ?? ''} rows={2}
                  placeholder="Ej. bajar rango si molesta el hombro" className={textareaClass} />
              </label>
              <SubmitButton label="Guardar ajustes" pendingLabel="Guardando ajustes"
                className="h-11 w-full bg-violet-500 text-white hover:bg-violet-600" />
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.kind === 'replace'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="mx-4 max-w-sm gap-0 rounded-2xl border-border/60 bg-popover p-0">
          <DialogHeader className="border-b border-border/40 px-5 py-4">
            <DialogTitle className="text-base text-white">Cambiar ejercicio</DialogTitle>
          </DialogHeader>
          {dialog?.kind === 'replace' && (() => {
            const candidates = getReplacementCandidates(getExercise(dialog.row), exerciseOptions)
            return (
              <div className="grid gap-2 p-5">
                {candidates.length === 0 && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    No encontramos alternativas cercanas. Puedes agregar otro ejercicio y quitar este.
                  </p>
                )}
                {candidates.map(c => (
                  <form key={c.id} action={replaceWorkoutExercise}>
                    <HiddenFields planId={planId} workoutExerciseId={dialog.row.id} />
                    <input type="hidden" name="exerciseId" value={c.id} />
                    <SubmitButton label={c.name} pendingLabel="Cambiando" variant="outline"
                      className="h-auto min-h-10 w-full justify-start whitespace-normal border-border/60 bg-muted/10 px-3 py-2 text-left text-xs text-foreground hover:bg-muted/20">
                      <Repeat2 className="mr-2 h-3.5 w-3.5 shrink-0 text-violet-300" />
                      <span>{c.name}
                        {formatMuscles(c.muscle_groups) && (
                          <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{formatMuscles(c.muscle_groups)}</span>
                        )}
                      </span>
                    </SubmitButton>
                  </form>
                ))}
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ExerciseRow({
  row, index, onAdjust, onReplace, onRemove,
}: {
  row: PlanWorkoutExerciseRow
  index: number
  onAdjust: () => void
  onReplace: () => void
  onRemove: () => void
}) {
  const dragControls = useDragControls()
  const exercise = getExercise(row)
  const detail = formatExerciseDetail(row)
  const muscleLabel = formatMuscles(exercise?.muscle_groups)

  const actions: LongPressAction[] = [
    { id: 'adjust', label: 'Ajustar series y carga', icon: PencilLine, onSelect: onAdjust },
    { id: 'replace', label: 'Cambiar ejercicio', icon: Repeat2, onSelect: onReplace },
    { id: 'remove', label: 'Quitar', icon: Trash2, variant: 'danger', onSelect: onRemove },
  ]

  return (
    <Reorder.Item value={row} dragListener={false} dragControls={dragControls}>
      <LongPressMenu actions={actions} label={`${exercise?.name ?? 'Ejercicio'}`}>
        <div className="flex items-start gap-2 rounded-xl border border-border/40 bg-background/50 p-3.5">
          <button type="button" aria-label="Arrastrar para reordenar"
            onPointerDown={(e) => { e.stopPropagation(); dragControls.start(e) }}
            className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground/60 hover:text-foreground active:cursor-grabbing">
            <GripVertical className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{index + 1}. {exercise?.name ?? 'Ejercicio'}</p>
                {muscleLabel && <p className="mt-1 text-xs text-muted-foreground">{muscleLabel}</p>}
              </div>
              {detail && <p className="max-w-[46%] shrink-0 text-right text-xs leading-relaxed text-muted-foreground">{detail}</p>}
            </div>
            {row.weight_suggestion_basis === 'based_on_previous_logs' && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-200">
                <TrendingUp className="h-3 w-3" />Ajustado por tu progreso
              </div>
            )}
          </div>
        </div>
      </LongPressMenu>
    </Reorder.Item>
  )
}

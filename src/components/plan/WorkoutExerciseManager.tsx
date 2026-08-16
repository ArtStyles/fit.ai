'use client'

import { useEffect, useState, useTransition } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { GripVertical, PencilLine, Repeat2, Trash2, TrendingUp } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LongPressMenu, type LongPressAction } from '@/components/ui'
import { SubmitButton } from '@/components/feedback/SubmitButton'
import { useToast } from '@/components/feedback/ToastProvider'
import { useI18n } from '@/components/i18n/I18nProvider'
import {
  reorderWorkoutExercises,
  removeWorkoutExercise,
  replaceWorkoutExercise,
  updateWorkoutExercise,
} from '@/app/actions/plan'
import { ExerciseCatalogDialog, toExerciseCatalogOptions } from './ExercisePicker'
import type { PlanExerciseOption, PlanWorkoutExerciseRow } from './WorkoutExerciseList'

const inputClass =
  'h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500'
const textareaClass =
  'w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500'

function getExercise(row: PlanWorkoutExerciseRow): PlanExerciseOption | null {
  if (Array.isArray(row.exercise)) return row.exercise[0] ?? null
  return row.exercise
}
function formatExerciseDetail(row: PlanWorkoutExerciseRow, t: (source: string) => string): string {
  return [
    row.sets && row.reps ? `${row.sets}x${row.reps}` : null,
    row.weight_kg !== null ? `${row.weight_kg} kg` : null,
    row.target_rpe ? `RPE ${row.target_rpe}` : null,
    row.rest_seconds !== null ? `${row.rest_seconds}s ${t('descanso')}` : null,
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
  const { t } = useI18n()

  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{t('Series')}</span>
        <input name="sets" type="number" min={1} max={12} defaultValue={row?.sets ?? 3} className={inputClass} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{t('Reps')}</span>
        <input name="reps" type="number" min={1} max={100} defaultValue={row?.reps ?? 10} className={inputClass} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{t('Peso kg')}</span>
        <input name="weightKg" type="number" min={0} step={0.25} defaultValue={row?.weight_kg ?? ''} placeholder={t('Opcional')} className={inputClass} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{t('Descanso seg.')}</span>
        <input name="restSeconds" type="number" min={0} max={600} defaultValue={row?.rest_seconds ?? 60} className={inputClass} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{t('RPE objetivo')}</span>
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
  const { t } = useI18n()
  const { showToast } = useToast()
  const [order, setOrder] = useState<PlanWorkoutExerciseRow[]>(
    [...exercises].sort((a, b) => a.order_index - b.order_index),
  )
  const [dialog, setDialog] = useState<{ kind: 'adjust' | 'replace'; row: PlanWorkoutExerciseRow } | null>(null)
  const [savingDetails, setSavingDetails] = useState(false)
  const [replacing, setReplacing] = useState(false)
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
    startTransition(() => {
      void removeWorkoutExercise(fd)
        .then(() => showToast({ title: t('Ejercicio quitado'), variant: 'success' }))
        .catch(() => showToast({ title: t('No se pudo guardar'), variant: 'error' }))
    })
  }

  async function saveExerciseDetails(formData: FormData) {
    if (savingDetails) return
    setSavingDetails(true)
    try {
      await updateWorkoutExercise(formData)
      setDialog(null)
      showToast({ title: t('Ejercicio actualizado'), variant: 'success' })
    } catch {
      showToast({ title: t('No se pudo guardar'), variant: 'error' })
    } finally {
      setSavingDetails(false)
    }
  }

  async function replaceSelectedExercise(exerciseIds: string[]) {
    const row = dialog?.kind === 'replace' ? dialog.row : null
    const exerciseId = exerciseIds[0]
    if (!row || !exerciseId || replacing) return

    const formData = new FormData()
    formData.set('planId', planId)
    formData.set('workoutExerciseId', row.id)
    formData.set('exerciseId', exerciseId)

    setReplacing(true)
    try {
      await replaceWorkoutExercise(formData)
      setDialog(null)
      showToast({ title: t('Ejercicio cambiado'), variant: 'success' })
    } catch {
      showToast({ title: t('No se pudo guardar'), variant: 'error' })
    } finally {
      setReplacing(false)
    }
  }

  if (order.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-border/60 bg-background/40 p-4 text-sm text-muted-foreground">
        {t('Este entrenamiento todavía no tiene ejercicios. Agrega el primero desde el catálogo.')}
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
        <DialogContent aria-describedby={undefined} className="max-w-sm gap-0 rounded-2xl border-border/60 bg-popover p-0">
          <DialogHeader className="border-b border-border/40 px-5 py-4">
            <DialogTitle className="text-base text-white">{t('Editar detalles')}</DialogTitle>
          </DialogHeader>
          {dialog?.kind === 'adjust' && (
            <form
              className="space-y-3 p-5"
              onSubmit={event => {
                event.preventDefault()
                void saveExerciseDetails(new FormData(event.currentTarget))
              }}
            >
              <HiddenFields planId={planId} workoutExerciseId={dialog.row.id} />
              <PrescriptionFields row={dialog.row} />
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">{t('Notas')}</span>
                <textarea name="notes" defaultValue={dialog.row.notes ?? ''} rows={2}
                  placeholder={t('Ej. bajar rango si necesitas ajustar técnica o rango')} className={textareaClass} />
              </label>
              <SubmitButton label={savingDetails ? t('Guardando detalles') : t('Guardar detalles')}
                disabled={savingDetails}
                className="h-11 w-full bg-violet-500 text-white hover:bg-violet-600" />
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ExerciseCatalogDialog
        open={dialog?.kind === 'replace'}
        onOpenChange={open => {
          if (!open && !replacing) setDialog(null)
        }}
        options={toExerciseCatalogOptions(exerciseOptions)}
        selectionMode="single"
        paginated
        title={t('Reemplazar ejercicio')}
        confirmVerb={t('Reemplazar')}
        onConfirm={exerciseIds => {
          void replaceSelectedExercise(exerciseIds)
        }}
      />
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
  const { t } = useI18n()
  const dragControls = useDragControls()
  const exercise = getExercise(row)
  const detail = formatExerciseDetail(row, t)
  const muscleLabel = formatMuscles(exercise?.muscle_groups)

  const actions: LongPressAction[] = [
    { id: 'adjust', label: t('Editar detalles'), icon: PencilLine, onSelect: onAdjust },
    { id: 'replace', label: t('Reemplazar ejercicio'), icon: Repeat2, onSelect: onReplace },
    { id: 'remove', label: t('Quitar'), icon: Trash2, variant: 'danger', onSelect: onRemove },
  ]

  return (
    <Reorder.Item value={row} dragListener={false} dragControls={dragControls}>
      <LongPressMenu actions={actions} label={`${exercise?.name ?? t('Ejercicio')}`}>
        <div className="flex min-w-0 max-w-full items-start gap-2 overflow-hidden rounded-xl border border-border/40 bg-background/50 p-3.5">
          <button type="button" aria-label={t('Arrastrar para reordenar')}
            onPointerDown={(e) => { e.stopPropagation(); dragControls.start(e) }}
            className="mt-0.5 flex h-11 w-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground/60 outline-none hover:bg-muted/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-500 active:cursor-grabbing">
            <GripVertical className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="min-w-0 break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]">{index + 1}. {exercise?.name ?? 'Ejercicio'}</p>
                {muscleLabel && <p className="mt-1 text-xs text-muted-foreground">{muscleLabel}</p>}
              </div>
              {detail && <p className="max-w-[46%] shrink-0 text-right text-xs leading-relaxed text-muted-foreground">{detail}</p>}
            </div>
            {row.weight_suggestion_basis === 'based_on_previous_logs' && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-200">
                <TrendingUp className="h-3 w-3" />{t('Ajustado por tu progreso')}
              </div>
            )}
          </div>
        </div>
      </LongPressMenu>
    </Reorder.Item>
  )
}

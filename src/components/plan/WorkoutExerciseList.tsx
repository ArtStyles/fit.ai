'use client'

import { SubmitButton } from '@/components/feedback/SubmitButton'
import { ExercisePicker } from '@/components/plan/ExercisePicker'
import { WorkoutExerciseManager } from '@/components/plan/WorkoutExerciseManager'
import { addWorkoutExercise } from '@/app/actions/plan'
import { PlusCircle } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'

export type PlanExerciseOption = {
  id: string
  name: string
  image_url?: string | null
  muscle_groups: string[] | null
  equipment: string[] | null
  difficulty: string | null
  exercise_type: string | null
  is_compound: boolean | null
}

export type PlanWorkoutExerciseRow = {
  id: string
  workout_id: string
  order_index: number
  sets: number | null
  reps: number | null
  rest_seconds: number | null
  weight_kg: number | null
  notes: string | null
  target_rpe: number | null
  weight_suggestion_basis: string | null
  exercise: PlanExerciseOption | PlanExerciseOption[] | null
}

type WorkoutExerciseListProps = {
  planId: string
  workoutId: string
  exercises: PlanWorkoutExerciseRow[]
  exerciseOptions: PlanExerciseOption[]
  editing?: boolean
  onDirtyChange?: (dirty: boolean) => void
  onFormSubmit?: () => void
}

const textareaClass =
  'w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500'
const inputClass =
  'h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500'

function PrescriptionFields() {
  const { t } = useI18n()
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{t('Series')}</span>
        <input name="sets" type="number" min={1} max={12} defaultValue={3} className={inputClass} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{t('Reps')}</span>
        <input name="reps" type="number" min={1} max={100} defaultValue={10} className={inputClass} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{t('Peso kg')}</span>
        <input name="weightKg" type="number" min={0} step={0.25} defaultValue="" placeholder={t('Opcional')} className={inputClass} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{t('Descanso seg.')}</span>
        <input name="restSeconds" type="number" min={0} max={600} defaultValue={60} className={inputClass} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{t('RPE objetivo')}</span>
        <input name="targetRpe" type="number" min={1} max={10} defaultValue={8} className={inputClass} /></label>
    </div>
  )
}

export function WorkoutExerciseList({
  planId,
  workoutId,
  exercises,
  exerciseOptions,
  editing = true,
  onDirtyChange,
  onFormSubmit,
}: WorkoutExerciseListProps) {
  const hasExerciseOptions = exerciseOptions.length > 0
  const { t } = useI18n()
  if (!editing) return null

  return (
    <div
      className="mt-4"
      onChangeCapture={() => onDirtyChange?.(true)}
      onSubmitCapture={() => onFormSubmit?.()}
    >
      <WorkoutExerciseManager planId={planId} workoutId={workoutId} exercises={exercises} exerciseOptions={exerciseOptions} />

      <details className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-violet-200">
          <PlusCircle className="h-4 w-4" />
          {t('Agregar ejercicio')}
        </summary>

        <form action={addWorkoutExercise} className="mt-4 space-y-3">
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="workoutId" value={workoutId} />
          <ExercisePicker name="exerciseIds" label={t('Ejercicio')} options={exerciseOptions}
            multiple disabled={!hasExerciseOptions} placeholder={t('Busca por nombre, músculo o equipo')}
            onSelectionChange={() => onDirtyChange?.(true)} />
          <PrescriptionFields />
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t('Notas')}</span>
            <textarea name="notes" rows={2} placeholder={t('Opcional')} className={textareaClass} />
          </label>
          <SubmitButton label={t('Agregar al entrenamiento')} pendingLabel={t('Agregando ejercicio')}
            disabled={!hasExerciseOptions} className="h-11 w-full bg-violet-500 text-white hover:bg-violet-600" />
        </form>
      </details>
    </div>
  )
}

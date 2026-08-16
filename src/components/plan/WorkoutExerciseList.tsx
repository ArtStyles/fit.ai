'use client'

import { useState } from 'react'
import { ExerciseCatalogDialog, toExerciseCatalogOptions } from '@/components/plan/ExercisePicker'
import { WorkoutExerciseManager } from '@/components/plan/WorkoutExerciseManager'
import { addWorkoutExercise } from '@/app/actions/plan'
import { PlusCircle } from 'lucide-react'
import { useToast } from '@/components/feedback/ToastProvider'
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
  const { showToast } = useToast()
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  if (!editing) return null

  async function addSelectedExercises(exerciseIds: string[]) {
    if (adding || exerciseIds.length === 0) return
    setAdding(true)
    setAddError(null)

    const formData = new FormData()
    formData.set('planId', planId)
    formData.set('workoutId', workoutId)
    exerciseIds.forEach(exerciseId => formData.append('exerciseIds', exerciseId))

    try {
      onFormSubmit?.()
      await addWorkoutExercise(formData)
      setCatalogOpen(false)
      showToast({ title: t('Ejercicio agregado'), variant: 'success' })
    } catch {
      setAddError(t('No se pudieron agregar los ejercicios. Inténtalo nuevamente.'))
    } finally {
      setAdding(false)
    }
  }

  return (
    <div
      className="mt-4"
      onChangeCapture={() => onDirtyChange?.(true)}
      onSubmitCapture={() => onFormSubmit?.()}
    >
      <WorkoutExerciseManager planId={planId} workoutId={workoutId} exercises={exercises} exerciseOptions={exerciseOptions} />

      <button
        type="button"
        disabled={!hasExerciseOptions || adding}
        onClick={() => {
          setAddError(null)
          setCatalogOpen(true)
        }}
        className="mt-4 flex min-h-11 w-full items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 text-sm font-semibold text-violet-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <PlusCircle className="h-4 w-4" />
        {adding ? t('Agregando ejercicio') : t('Agregar ejercicio')}
      </button>

      {addError ? <p role="alert" className="mt-2 text-sm text-destructive">{addError}</p> : null}

      <ExerciseCatalogDialog
        open={catalogOpen}
        onOpenChange={open => {
          if (!adding) setCatalogOpen(open)
        }}
        options={toExerciseCatalogOptions(exerciseOptions)}
        selectionMode="multiple"
        paginated
        title={t('Agregar ejercicios')}
        onConfirm={ids => {
          void addSelectedExercises(ids)
        }}
      />
    </div>
  )
}

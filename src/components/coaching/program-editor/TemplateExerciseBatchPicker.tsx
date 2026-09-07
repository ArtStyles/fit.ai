'use client'

import { useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { ExerciseCatalogDialog, toExerciseCatalogOptions } from '@/components/plan/ExercisePicker'
import type { PlanExerciseOption } from '@/components/plan/WorkoutExerciseList'

export type AppendedExercise = { id: string; exerciseId: string; orderIndex: number }

export function TemplateExerciseBatchPicker({
  workoutId,
  options,
  remainingCapacity,
  pending,
  onAdded,
}: {
  workoutId: string
  options: PlanExerciseOption[]
  remainingCapacity: number
  pending: boolean
  onAdded: (exercises: AppendedExercise[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unavailableExerciseIds, setUnavailableExerciseIds] = useState<string[]>([])
  const triggerRef = useRef<HTMLButtonElement>(null)
  const catalogOptions = useMemo(() => toExerciseCatalogOptions(options), [options])
  const unavailable = pending || remainingCapacity <= 0 || options.length === 0

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }))
    }
  }

  return (
    <div className="mt-4">
      <button
        ref={triggerRef}
        type="button"
        aria-disabled={unavailable || undefined}
        aria-busy={pending || undefined}
        onClick={() => {
          if (unavailable) return
          setError(null)
          setUnavailableExerciseIds([])
          setOpen(true)
        }}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/60 bg-primary/10 px-4 text-sm font-semibold text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {remainingCapacity <= 0 ? 'Límite de 30 ejercicios alcanzado' : 'Agregar varios ejercicios'}
      </button>
      <p className="mt-1 text-center text-xs text-muted-foreground">{remainingCapacity} espacios disponibles</p>

      <ExerciseCatalogDialog
        open={open}
        onOpenChange={handleOpenChange}
        options={catalogOptions}
        selectionMode="multiple"
        maxSelections={remainingCapacity}
        paginated
        title="Agregar ejercicios"
        confirmationError={error}
        invalidIds={unavailableExerciseIds}
        confirmationDetails={<p>Valores iniciales: 3 × 10 · RPE 7 · 60 s</p>}
        onConfirm={async ids => {
          const data = new FormData()
          data.set('templateWorkoutId', workoutId)
          ids.forEach(id => data.append('exerciseId', id))

          try {
            const action = await import('@/app/actions/trainerPrograms')
            const result = await action.addTrainerTemplateExercises(data)
            if (!result.ok) {
              setError(result.error)
              setUnavailableExerciseIds(result.unavailableExerciseIds ?? [])
              return false
            }
            setError(null)
            setUnavailableExerciseIds([])
            onAdded(result.exercises)
            return true
          } catch {
            setError('No se pudieron agregar los ejercicios.')
            return false
          }
        }}
      />
    </div>
  )
}

'use client'

import { PlusCircle } from 'lucide-react'
import { SessionExercisePicker } from '@/components/session/SessionExercisePicker'
import { useSessionStore, type SessionExerciseDraft } from '@/store/sessionStore'
import { useToast } from '@/components/feedback/ToastProvider'

type SessionRoutineToolsProps = {
  exerciseOptions: SessionExerciseDraft[]
}

export function SessionRoutineTools({ exerciseOptions }: SessionRoutineToolsProps) {
  const addSessionExercise = useSessionStore(state => state.addSessionExercise)
  const { showToast } = useToast()

  return (
    <details className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-violet-200">
        <PlusCircle className="h-4 w-4" />
        Agregar ejercicio solo por hoy
      </summary>

      <div className="mt-3 space-y-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Se registra en esta sesión, pero no modifica tu plan base.
        </p>
        <SessionExercisePicker
          options={exerciseOptions}
          placeholder="Busca por nombre o músculo"
          onSelect={exercise => {
            addSessionExercise(exercise)
            showToast({
              title: 'Ejercicio agregado',
              description: 'Quedó añadido solo para esta sesión.',
              variant: 'success',
            })
          }}
        />
      </div>
    </details>
  )
}

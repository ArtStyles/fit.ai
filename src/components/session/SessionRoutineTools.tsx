'use client'

import { PlusCircle } from 'lucide-react'
import { SessionExercisePicker } from '@/components/session/SessionExercisePicker'
import { useSessionStore, type SessionExerciseDraft } from '@/store/sessionStore'
import { useToast } from '@/components/feedback/ToastProvider'
import { useI18n } from '@/components/i18n/I18nProvider'

type SessionRoutineToolsProps = {
  exerciseOptions: SessionExerciseDraft[]
}

export function SessionRoutineTools({ exerciseOptions }: SessionRoutineToolsProps) {
  const addSessionExercise = useSessionStore(state => state.addSessionExercise)
  const { showToast } = useToast()
  const { t } = useI18n()

  return (
    <details className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-violet-200">
        <PlusCircle className="h-4 w-4" />
        {t('Agregar ejercicio solo por hoy')}
      </summary>

      <div className="mt-3 space-y-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('Se registra en esta sesión, pero no modifica tu plan base.')}
        </p>
        <SessionExercisePicker
          options={exerciseOptions}
          selectionMode="multiple"
          placeholder={t('Busca por nombre o músculo')}
          onSelect={exercise => {
            addSessionExercise(exercise)
            showToast({
              title: t('Ejercicio agregado'),
              description: t('Quedó añadido solo para esta sesión.'),
              variant: 'success',
            })
          }}
        />
      </div>
    </details>
  )
}

'use client'

import { useState } from 'react'
import { ArrowLeft, Save } from 'lucide-react'

import { updateWorkoutSummary } from '@/app/actions/plan'
import { SubmitButton } from '@/components/feedback/SubmitButton'
import { useI18n } from '@/components/i18n/I18nProvider'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { PlanDayTimeline } from './PlanDayTimeline'
import { PlanWorkoutReadView } from './PlanWorkoutReadView'
import { WorkoutAdjustButton } from './WorkoutAdjustButton'
import {
  WorkoutExerciseList,
  type PlanExerciseOption,
  type PlanWorkoutExerciseRow,
} from './WorkoutExerciseList'
import type { PlanDaySummary, PlanWeekEntry } from './planViewModel'

export type PlanWorkspaceWorkout = {
  summary: PlanDaySummary
  exercises: PlanWorkoutExerciseRow[]
}

type PendingIntent =
  | { kind: 'select'; workoutId: string }
  | { kind: 'read' }
  | { kind: 'close' }

type WorkspaceProps = {
  planId: string
  entries: PlanWeekEntry[]
  workouts: PlanWorkspaceWorkout[]
  exerciseOptions: PlanExerciseOption[]
  todayIso: number
}

function initialWorkoutId(props: WorkspaceProps): string | null {
  const todayWorkout = props.entries.find(entry => entry.isToday)?.workouts[0]
  return todayWorkout?.id ?? props.workouts[0]?.summary.id ?? null
}

const inputClass = 'h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500'

function WorkoutEditView({
  planId,
  workout,
  exerciseOptions,
  onBack,
  onDirtyChange,
  onSubmit,
}: {
  planId: string
  workout: PlanWorkspaceWorkout
  exerciseOptions: PlanExerciseOption[]
  onBack: () => void
  onDirtyChange: (dirty: boolean) => void
  onSubmit: () => void
}) {
  const { t } = useI18n()

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('Volver a lectura')}
        </button>
        <WorkoutAdjustButton workoutId={workout.summary.id} workoutName={workout.summary.name} />
      </div>

      <div className="mt-4 rounded-2xl border border-border/60 bg-background/40 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{t('Detalles de la sesión')}</p>
        <form
          action={updateWorkoutSummary}
          className="mt-4 space-y-3"
          onChangeCapture={() => onDirtyChange(true)}
          onSubmitCapture={onSubmit}
        >
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="workoutId" value={workout.summary.id} />
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t('Nombre')}</span>
            <input name="name" defaultValue={workout.summary.name} className={inputClass} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t('Foco muscular')}</span>
            <input name="focus" defaultValue={workout.summary.focus ?? ''} className={inputClass} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t('Duración estimada')}</span>
            <input name="estimatedDurationMinutes" type="number" min={10} max={180} defaultValue={workout.summary.durationMinutes ?? ''} className={inputClass} />
          </label>
          <SubmitButton label={t('Guardar detalles')} pendingLabel={t('Guardando detalles')} className="h-11 w-full bg-violet-500 text-white hover:bg-violet-600">
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          </SubmitButton>
        </form>
      </div>

      <WorkoutExerciseList
        planId={planId}
        workoutId={workout.summary.id}
        exercises={workout.exercises}
        exerciseOptions={exerciseOptions}
        editing
        onDirtyChange={onDirtyChange}
        onFormSubmit={onSubmit}
      />
    </div>
  )
}

export function PlanWorkoutWorkspace(props: WorkspaceProps) {
  const { t } = useI18n()
  const [selectedId, setSelectedId] = useState(initialWorkoutId(props))
  const [mode, setMode] = useState<'read' | 'edit'>('read')
  const [dirty, setDirty] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [pendingIntent, setPendingIntent] = useState<PendingIntent | null>(null)
  const selectedWorkout = props.workouts.find(workout => workout.summary.id === selectedId) ?? null

  function performIntent(intent: PendingIntent) {
    if (intent.kind === 'select') {
      setSelectedId(intent.workoutId)
      setMode('read')
      setDetailOpen(true)
    } else if (intent.kind === 'read') {
      setMode('read')
    } else {
      setDetailOpen(false)
      setMode('read')
    }
    setDirty(false)
  }

  function requestIntent(intent: PendingIntent) {
    if (dirty) {
      setPendingIntent(intent)
      return
    }
    performIntent(intent)
  }

  function selectWorkout(workoutId: string) {
    if (workoutId === selectedId) {
      setDetailOpen(true)
      return
    }
    requestIntent({ kind: 'select', workoutId })
  }

  const detail = selectedWorkout ? mode === 'read' ? (
    <PlanWorkoutReadView
      summary={selectedWorkout.summary}
      exercises={selectedWorkout.exercises}
      isToday={selectedWorkout.summary.dayOfWeek === props.todayIso}
      onEdit={() => setMode('edit')}
    />
  ) : (
    <WorkoutEditView
      planId={props.planId}
      workout={selectedWorkout}
      exerciseOptions={props.exerciseOptions}
      onBack={() => requestIntent({ kind: 'read' })}
      onDirtyChange={setDirty}
      onSubmit={() => setDirty(false)}
    />
  ) : null

  return (
    <section aria-label={t('Estructura semanal')} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <PlanDayTimeline entries={props.entries} selectedWorkoutId={selectedId} onSelectWorkout={selectWorkout} />

      <aside className="sticky top-24 hidden max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-3xl border border-border/70 bg-[hsl(var(--surface-1))] p-5 lg:block">
        {detail ?? <p className="text-sm text-muted-foreground">{t('Selecciona una sesión para ver sus ejercicios.')}</p>}
      </aside>

      <Dialog
        open={detailOpen}
        onOpenChange={open => {
          if (open) setDetailOpen(true)
          else requestIntent({ kind: 'close' })
        }}
      >
        <DialogContent className="border-border/70 bg-background p-5 lg:hidden">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle>{selectedWorkout?.summary.name ?? t('Detalle de sesión')}</DialogTitle>
          </DialogHeader>
          {detail}
        </DialogContent>
      </Dialog>

      <Dialog open={pendingIntent !== null} onOpenChange={open => { if (!open) setPendingIntent(null) }}>
        <DialogContent className="max-w-sm rounded-2xl border-border/70">
          <DialogHeader>
            <DialogTitle>{t('¿Descartar cambios?')}</DialogTitle>
            <DialogDescription>{t('Hay cambios sin guardar en esta sesión.')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:space-x-0">
            <button type="button" onClick={() => setPendingIntent(null)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold text-foreground">{t('Seguir editando')}</button>
            <button
              type="button"
              onClick={() => {
                if (pendingIntent) performIntent(pendingIntent)
                setPendingIntent(null)
              }}
              className="min-h-11 rounded-xl bg-red-500 px-4 text-sm font-bold text-white"
            >
              {t('Descartar cambios')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

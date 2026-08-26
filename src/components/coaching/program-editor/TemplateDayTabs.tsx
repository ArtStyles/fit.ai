'use client'

import type { KeyboardEvent } from 'react'
import type { TemplateWorkoutView } from './types'

export function TemplateDayTabs({
  workouts,
  activeWorkoutId,
  pending,
  canAdd,
  onSelect,
  onMove,
  onAdd,
}: {
  workouts: TemplateWorkoutView[]
  activeWorkoutId: string
  pending?: boolean
  canAdd: boolean
  onSelect: (id: string) => void
  onMove: (id: string, delta: number) => void
  onAdd: () => void
}) {
  const activeIndex = Math.max(0, workouts.findIndex(workout => workout.id === activeWorkoutId))
  const activeWorkout = workouts[activeIndex]

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % workouts.length
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + workouts.length) % workouts.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = workouts.length - 1
    if (nextIndex === null) return

    event.preventDefault()
    const nextWorkout = workouts[nextIndex]
    onSelect(nextWorkout.id)
    window.requestAnimationFrame(() => {
      document.getElementById(`template-day-tab-${nextWorkout.id}`)?.focus({ preventScroll: true })
    })
  }

  return (
    <div className="flex min-w-0 max-w-full items-stretch gap-2 overflow-x-auto snap-x pb-1">
      <div className="flex items-stretch gap-2" role="tablist" aria-label="Días de la rutina" aria-orientation="horizontal">
        {workouts.map((workout, index) => (
          <button
            key={workout.id}
            type="button"
            role="tab"
            id={`template-day-tab-${workout.id}`}
            aria-selected={workout.id === activeWorkoutId}
            aria-controls={`template-day-panel-${workout.id}`}
            tabIndex={workout.id === activeWorkoutId ? 0 : -1}
            onClick={() => onSelect(workout.id)}
            onKeyDown={event => handleTabKeyDown(event, index)}
            className={`min-h-11 min-w-32 shrink-0 snap-start rounded-xl border border-border/70 px-3 text-left text-sm ${workout.id === activeWorkoutId ? 'bg-primary text-background' : 'bg-muted/20 text-foreground'}`}
          >
            <span className="block font-semibold">{workout.name}</span>
            <span className={`block text-xs ${workout.id === activeWorkoutId ? '' : 'opacity-80'}`}>{workout.exercises.length} {workout.exercises.length === 1 ? 'ejercicio' : 'ejercicios'}</span>
          </button>
        ))}
      </div>
      <div className="flex shrink-0 snap-start overflow-hidden rounded-xl border border-border/70 bg-muted/20" role="group" aria-label={`Ordenar ${activeWorkout.name}`}>
        <button type="button" aria-label={`Subir ${activeWorkout.name}`} disabled={pending || activeIndex === 0} onClick={() => onMove(activeWorkout.id, -1)} className="min-h-11 min-w-11 px-2 text-xs disabled:opacity-30">↑</button>
        <button type="button" aria-label={`Bajar ${activeWorkout.name}`} disabled={pending || activeIndex === workouts.length - 1} onClick={() => onMove(activeWorkout.id, 1)} className="min-h-11 min-w-11 border-l border-border/70 px-2 text-xs disabled:opacity-30">↓</button>
      </div>
      {canAdd ? (
        <button type="button" onClick={onAdd} disabled={pending} className="min-h-11 shrink-0 snap-start rounded-xl border border-dashed border-primary/50 px-4 text-sm font-semibold text-primary disabled:opacity-50">
          Agregar día
        </button>
      ) : null}
    </div>
  )
}

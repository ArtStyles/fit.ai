'use client'

import type { TemplateWorkoutView } from './types'

export function TemplateDayTabs({
  workouts,
  activeWorkoutId,
  pending,
  onSelect,
  onMove,
  onAdd,
}: {
  workouts: TemplateWorkoutView[]
  activeWorkoutId: string
  pending?: boolean
  onSelect: (id: string) => void
  onMove: (id: string, delta: number) => void
  onAdd: () => void
}) {
  return (
    <div className="flex min-w-0 max-w-full items-stretch gap-2 overflow-x-auto snap-x pb-1" role="tablist" aria-label="Días de la rutina">
      {workouts.map((workout, index) => (
        <div key={workout.id} className="flex shrink-0 snap-start items-stretch overflow-hidden rounded-xl border border-border/70 bg-muted/20">
          <button
            type="button"
            role="tab"
            id={`template-day-tab-${workout.id}`}
            aria-selected={workout.id === activeWorkoutId}
            aria-controls={`template-day-panel-${workout.id}`}
            onClick={() => onSelect(workout.id)}
            className={`min-h-11 min-w-32 px-3 text-left text-sm ${workout.id === activeWorkoutId ? 'bg-primary text-primary-foreground' : 'text-foreground'}`}
          >
            <span className="block font-semibold">{workout.name}</span>
            <span className="block text-xs opacity-80">{workout.exercises.length} {workout.exercises.length === 1 ? 'ejercicio' : 'ejercicios'}</span>
          </button>
          <div className="grid border-l border-border/70">
            <button type="button" aria-label={`Subir ${workout.name}`} disabled={pending || index === 0} onClick={() => onMove(workout.id, -1)} className="min-h-[22px] min-w-11 px-2 text-xs disabled:opacity-30">↑</button>
            <button type="button" aria-label={`Bajar ${workout.name}`} disabled={pending || index === workouts.length - 1} onClick={() => onMove(workout.id, 1)} className="min-h-[22px] min-w-11 border-t border-border/70 px-2 text-xs disabled:opacity-30">↓</button>
          </div>
        </div>
      ))}
      <button type="button" onClick={onAdd} disabled={pending} className="min-h-11 shrink-0 snap-start rounded-xl border border-dashed border-primary/50 px-4 text-sm font-semibold text-primary disabled:opacity-50">
        Agregar día
      </button>
    </div>
  )
}

'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExercisePicker } from '@/components/plan/ExercisePicker'
import type { PlanExerciseOption } from '@/components/plan/WorkoutExerciseList'

export type TemplateExerciseView = {
  id: string
  exercise_id: string
  order_index: number
  sets: number
  reps: number
  weight_kg: number | null
  target_rpe: number | null
  rest_seconds: number
  notes: string | null
  exercise?: { name: string } | null
}

export type TemplateWorkoutView = {
  id: string
  name: string
  day_of_week: number
  order_in_plan: number
  exercises: TemplateExerciseView[]
}

type Result = { ok: boolean; error?: string }

async function callAction<T extends Result>(loader: () => Promise<T>) {
  try { return await loader() } catch { return { ok: false, error: 'No se pudo guardar el entrenamiento.' } as T }
}

export function TemplateWorkoutEditor({ workout, options }: { workout: TemplateWorkoutView; options: PlanExerciseOption[] }) {
  const [announcement, setAnnouncement] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const id = useId()

  async function addExercise(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    const formData = new FormData(event.currentTarget)
    const result = await callAction(async () => (await import('@/app/actions/trainerPrograms')).addTrainerTemplateExercise(formData))
    if (result.ok) router.refresh()
    setAnnouncement(result.ok ? 'Ejercicio agregado.' : result.error ?? 'No se pudo agregar el ejercicio.')
    setSaving(false)
  }

  async function moveExercise(exerciseIds: string[]) {
    if (saving) return
    setSaving(true)
    const formData = new FormData()
    formData.set('templateWorkoutId', workout.id)
    formData.set('templateExerciseIds', exerciseIds.join(','))
    const result = await callAction(async () => (await import('@/app/actions/trainerPrograms')).reorderTrainerTemplateExercises(formData))
    if (result.ok) router.refresh()
    setAnnouncement(result.ok ? 'Orden actualizado.' : result.error ?? 'No se pudo actualizar el orden.')
    setSaving(false)
  }
  async function removeWorkout() { if (saving || !window.confirm(`¿Eliminar ${workout.name}?`)) return; setSaving(true); const data = new FormData(); data.set('templateWorkoutId', workout.id); const result = await callAction(async () => (await import('@/app/actions/trainerPrograms')).deleteTrainerTemplateWorkout(data)); if (result.ok) router.refresh(); setAnnouncement(result.ok ? 'Entrenamiento eliminado.' : result.error ?? 'No se pudo eliminar el entrenamiento.'); setSaving(false) }
  async function removeExercise(id: string) { if (saving || !window.confirm('¿Eliminar este ejercicio?')) return; setSaving(true); const data = new FormData(); data.set('templateExerciseId', id); const result = await callAction(async () => (await import('@/app/actions/trainerPrograms')).deleteTrainerTemplateExercise(data)); if (result.ok) router.refresh(); setAnnouncement(result.ok ? 'Ejercicio eliminado.' : result.error ?? 'No se pudo eliminar el ejercicio.'); setSaving(false) }

  return (
    <article className="rounded-2xl border border-border/70 bg-muted/10 p-4" aria-labelledby={`template-workout-${id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h3 id={`template-workout-${id}`} className="font-semibold text-foreground">{workout.name}</h3><p className="text-xs text-muted-foreground">Día {workout.day_of_week} · Orden {workout.order_in_plan}</p></div><button type="button" disabled={saving} onClick={() => void removeWorkout()} className="min-h-11 rounded-lg border border-red-500/50 px-3 text-xs text-red-300 disabled:opacity-50">Eliminar entrenamiento</button>
      </div>
      <ol className="mt-4 space-y-2" aria-label={`Ejercicios de ${workout.name}`}>
        {workout.exercises.map((item, index) => <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-2 text-sm">
          <span><strong>{index + 1}. {item.exercise?.name ?? 'Ejercicio'}</strong><span className="ml-2 text-muted-foreground">{item.sets} × {item.reps}</span></span>
          <div className="flex gap-1"><button type="button" disabled={saving || index === 0} onClick={() => void moveExercise([...workout.exercises.slice(0, index - 1), item, workout.exercises[index - 1], ...workout.exercises.slice(index + 1)].map(row => row.id))} className="min-h-11 rounded-lg border border-border px-3 text-xs disabled:opacity-40" aria-label={`Subir ${item.exercise?.name ?? 'ejercicio'}`}>Subir</button><button type="button" disabled={saving || index === workout.exercises.length - 1} onClick={() => void moveExercise([...workout.exercises.slice(0, index), workout.exercises[index + 1], item, ...workout.exercises.slice(index + 2)].map(row => row.id))} className="min-h-11 rounded-lg border border-border px-3 text-xs disabled:opacity-40" aria-label={`Bajar ${item.exercise?.name ?? 'ejercicio'}`}>Bajar</button><button type="button" disabled={saving} onClick={() => void removeExercise(item.id)} className="min-h-11 rounded-lg border border-red-500/50 px-3 text-xs text-red-300" aria-label={`Eliminar ${item.exercise?.name ?? 'ejercicio'}`}>Eliminar</button></div>
        </li>)}
      </ol>
      <form onSubmit={event => void addExercise(event)} noValidate className="mt-4 grid gap-3 rounded-xl border border-violet-500/20 p-3 sm:grid-cols-2">
        <input type="hidden" name="templateWorkoutId" value={workout.id} />
        <ExercisePicker name="exerciseId" label="Ejercicio" options={options} disabled={saving || options.length === 0} />
        <label className="text-xs font-medium text-muted-foreground">Orden<input name="orderIndex" type="number" min="1" max="30" defaultValue={workout.exercises.length + 1} className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground" /></label>
        <label className="text-xs font-medium text-muted-foreground">Series<input name="sets" type="number" min="1" max="20" defaultValue="3" className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground" /></label>
        <label className="text-xs font-medium text-muted-foreground">Repeticiones<input name="reps" type="number" min="1" max="100" defaultValue="10" className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground" /></label>
        <label className="text-xs font-medium text-muted-foreground">Peso (kg)<input name="weightKg" type="number" min="0" max="1000" step="0.25" className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground" /></label>
        <label className="text-xs font-medium text-muted-foreground">RPE objetivo<input name="targetRpe" type="number" min="1" max="10" step="0.5" className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground" /></label>
        <label className="text-xs font-medium text-muted-foreground">Descanso (seg.)<input name="restSeconds" type="number" min="0" max="3600" defaultValue="60" className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground" /></label>
        <label className="sm:col-span-2 text-xs font-medium text-muted-foreground">Notas<textarea name="notes" maxLength={1000} rows={2} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground" /></label>
        <button type="submit" disabled={saving || options.length === 0} className="min-h-11 rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Guardando…' : 'Agregar ejercicio'}</button>
      </form>
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    </article>
  )
}

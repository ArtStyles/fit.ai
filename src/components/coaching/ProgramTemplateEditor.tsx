'use client'

import { useId, useState } from 'react'
import type { PlanExerciseOption } from '@/components/plan/WorkoutExerciseList'
import { TemplateWorkoutEditor, type TemplateWorkoutView } from './TemplateWorkoutEditor'

export type ProgramTemplateView = { id: string; name: string; goal: string | null; description: string | null; days_per_week: number; status: 'draft' | 'active' | 'archived' }
type Result = { ok: boolean; error?: string }

export function ProgramTemplateEditor({ template, workouts, options }: { template: ProgramTemplateView; workouts: TemplateWorkoutView[]; options: PlanExerciseOption[] }) {
  const [saving, setSaving] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const formId = useId()

  async function saveTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const result: Result = await (await import('@/app/actions/trainerPrograms')).updateTrainerProgram(new FormData(event.currentTarget))
      setAnnouncement(result.ok ? 'Rutina guardada.' : result.error ?? 'No se pudo guardar la rutina.')
    } catch { setAnnouncement('No se pudo guardar la rutina.') } finally { setSaving(false) }
  }

  async function addWorkout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const result: Result = await (await import('@/app/actions/trainerPrograms')).createTrainerTemplateWorkout(new FormData(event.currentTarget))
      setAnnouncement(result.ok ? 'Entrenamiento agregado.' : result.error ?? 'No se pudo agregar el entrenamiento.')
    } catch { setAnnouncement('No se pudo agregar el entrenamiento.') } finally { setSaving(false) }
  }

  async function reorderWorkouts(workoutIds: string[]) {
    if (saving) return
    setSaving(true)
    const data = new FormData(); data.set('templateId', template.id); data.set('workoutIds', workoutIds.join(','))
    try {
      const result: Result = await (await import('@/app/actions/trainerPrograms')).reorderTrainerTemplateWorkouts(data)
      setAnnouncement(result.ok ? 'Orden actualizado.' : result.error ?? 'No se pudo actualizar el orden.')
    } catch { setAnnouncement('No se pudo actualizar el orden.') } finally { setSaving(false) }
  }

  return <section className="space-y-6" aria-labelledby={`program-template-${formId}`}>
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-foreground"><strong>Plantilla editable.</strong> Las ediciones de esta plantilla no cambian asignaciones ya publicadas ni sus rutinas bloqueadas.</div>
    <form onSubmit={event => void saveTemplate(event)} noValidate className="rounded-2xl border border-border/70 bg-muted/10 p-4">
      <input type="hidden" name="templateId" value={template.id} />
      <h1 id={`program-template-${formId}`} className="text-xl font-bold text-foreground">Editar rutina profesional</h1>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-foreground">Nombre<input name="name" required maxLength={120} defaultValue={template.name} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" /></label><label className="text-sm font-semibold text-foreground">Días por semana<input name="daysPerWeek" required type="number" min="1" max="7" defaultValue={template.days_per_week} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" /></label><label className="text-sm font-semibold text-foreground sm:col-span-2">Objetivo<input name="goal" maxLength={240} defaultValue={template.goal ?? ''} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" /></label><label className="text-sm font-semibold text-foreground sm:col-span-2">Descripción<textarea name="description" maxLength={2000} defaultValue={template.description ?? ''} rows={3} className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 font-normal" /></label></div>
      <button type="submit" disabled={saving} className="mt-4 min-h-11 rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar plantilla'}</button>
    </form>
    <section aria-labelledby={`workouts-${formId}`}><div className="flex items-center justify-between gap-3"><h2 id={`workouts-${formId}`} className="text-lg font-bold text-foreground">Entrenamientos</h2><span className="text-sm text-muted-foreground">{workouts.length} de {template.days_per_week} días</span></div><div className="mt-3 space-y-3">{workouts.map((workout, index) => <div key={workout.id} className="space-y-2"><div className="flex justify-end gap-2"><button type="button" aria-label={`Subir ${workout.name}`} disabled={saving || index === 0} onClick={() => void reorderWorkouts([...workouts.slice(0, index - 1), workout, workouts[index - 1], ...workouts.slice(index + 1)].map(row => row.id))} className="min-h-11 rounded-lg border border-border px-3 text-xs disabled:opacity-40">Subir</button><button type="button" aria-label={`Bajar ${workout.name}`} disabled={saving || index === workouts.length - 1} onClick={() => void reorderWorkouts([...workouts.slice(0, index), workouts[index + 1], workout, ...workouts.slice(index + 2)].map(row => row.id))} className="min-h-11 rounded-lg border border-border px-3 text-xs disabled:opacity-40">Bajar</button></div><TemplateWorkoutEditor workout={workout} options={options} /></div>)}</div></section>
    <form onSubmit={event => void addWorkout(event)} noValidate className="rounded-2xl border border-border/70 p-4"><input type="hidden" name="templateId" value={template.id} /><h2 className="font-bold text-foreground">Agregar entrenamiento</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="text-sm">Nombre<input required name="name" maxLength={120} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3" /></label><label className="text-sm">Día<select name="dayOfWeek" defaultValue={String(Math.min(7, workouts.length + 1))} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3">{[1,2,3,4,5,6,7].map(day => <option key={day} value={day}>{day}</option>)}</select></label><label className="text-sm">Orden<select name="orderInPlan" defaultValue={String(Math.min(7, workouts.length + 1))} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3">{[1,2,3,4,5,6,7].map(order => <option key={order} value={order}>{order}</option>)}</select></label></div><button type="submit" disabled={saving || workouts.length >= template.days_per_week} className="mt-4 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold text-foreground disabled:opacity-50">Agregar entrenamiento</button></form>
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
  </section>
}

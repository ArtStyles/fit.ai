'use client'

import { useId } from 'react'
import { MAX_SESSION_DURATION_SECONDS, MAX_SESSION_REPS, MAX_SESSION_SETS } from '@/lib/session/limits'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DisclosureSection } from '@/components/evidence/DisclosureSection'
import { TrainingGoalSelect } from './TrainingGoalSelect'
import { TrainingDatePicker } from './TrainingDatePicker'
import type { FreeTrainingCatalogItem } from './types'
import { emptySet, type ExerciseFields, type FreeTrainingForm } from './view-model'

export function ExerciseFieldsCard({ exercise, item, index, update, remove, reuse, language }: {
  exercise: ExerciseFields; item?: FreeTrainingCatalogItem; index: number
  update: (value: ExerciseFields) => void; remove: () => void; reuse: () => void; language: 'es' | 'en'
}) {
  const t = (es: string, en: string) => language === 'es' ? es : en
  const name = item?.name ?? t('Ejercicio guardado', 'Saved exercise')
  return <section className="space-y-4 rounded-2xl border border-border/60 bg-muted/10 p-4" aria-label={name}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0"><p className="text-xs text-muted-foreground">{t('Ejercicio', 'Exercise')} {index + 1}</p><h3 className="break-words font-display text-xl font-semibold">{name}</h3></div>
      <Button type="button" variant="ghost" className="h-11 w-11 shrink-0 p-0" aria-label={`${t('Quitar', 'Remove')} ${name}`} onClick={remove}><Trash2 className="h-4 w-4" /></Button>
    </div>
    {item?.previous?.length ? <div className="rounded-xl border border-border/40 bg-background/50 p-3 text-sm tabular-nums">
      <p className="font-medium">{t('Último registro · referencia', 'Last entry · reference')} {item.previousDate?.slice(0, 10)}</p>
      <p className="mt-1 text-muted-foreground">{item.previous.map(set => exercise.timed ? `${set.durationSeconds ?? 0} s${set.weightKg ? ` · ${set.weightKg} kg` : ''}` : `${set.weightKg} kg × ${set.reps}`).join(' / ')}</p>
      <Button type="button" variant="outline" className="mt-2 h-auto min-h-12 w-full whitespace-normal rounded-xl" onClick={reuse}>{t('Confirmar que hice estas series', 'Confirm I performed these sets')}</Button>
    </div> : null}
    <p className="text-xs text-muted-foreground">{exercise.timed ? t('Registra los segundos de cada serie realizada.', 'Enter seconds for each set you performed.') : t('Solo las series que realizaste. Peso vacío = sin carga externa (0–500 kg).', 'Only sets you performed. Empty weight = no external load (0–500 kg).')}</p>
    {exercise.sets.map((set, setIndex) => <div key={setIndex} className="flex items-end gap-2">
      <span className="flex h-12 w-5 shrink-0 items-center text-xs text-muted-foreground" aria-hidden="true">{setIndex + 1}</span>
      {!exercise.timed && <label className="min-w-0 flex-1 space-y-1 text-xs">{t('Peso (kg)', 'Weight (kg)')}<Input className="h-12 min-w-0 rounded-xl text-base" inputMode="decimal" type="text" aria-label={`${name}, ${t('serie', 'set')} ${setIndex + 1}, kg`} value={set.weightKg} placeholder="0" onChange={event => update({ ...exercise, sets: exercise.sets.map((s, i) => i === setIndex ? { ...s, weightKg: event.target.value } : s) })} /></label>}
      <label className="min-w-0 flex-1 space-y-1 text-xs">{exercise.timed ? t('Segundos', 'Seconds') : t('Repeticiones', 'Reps')}<Input className="h-12 min-w-0 rounded-xl text-base" inputMode="numeric" type="text" aria-label={`${name}, ${t('serie', 'set')} ${setIndex + 1}, ${exercise.timed ? t('segundos', 'seconds') : 'reps'}`} value={exercise.timed ? set.durationSeconds : set.reps} placeholder={`1–${exercise.timed ? MAX_SESSION_DURATION_SECONDS : MAX_SESSION_REPS}`} onChange={event => update({ ...exercise, sets: exercise.sets.map((s, i) => i === setIndex ? { ...s, [exercise.timed ? 'durationSeconds' : 'reps']: event.target.value } : s) })} /></label>
      <Button type="button" variant="ghost" className="h-12 w-11 shrink-0 p-0" aria-label={`${t('Quitar serie', 'Remove set')} ${setIndex + 1} · ${name}`} onClick={() => update({ ...exercise, sets: exercise.sets.filter((_, i) => i !== setIndex) })}><Trash2 className="h-4 w-4" /></Button>
    </div>)}
    <Button type="button" variant="outline" className="min-h-12 w-full rounded-xl" disabled={exercise.sets.length >= MAX_SESSION_SETS} onClick={() => update({ ...exercise, sets: [...exercise.sets, emptySet()] })}><Plus className="mr-2 h-4 w-4" />{t('Añadir serie', 'Add set')}</Button>
  </section>
}

export function TrainingFields({ form, today, onChange, language, hasActivePlan, disabled = false }: { form: FreeTrainingForm; today: string; onChange: (form: FreeTrainingForm) => void; language: 'es' | 'en'; hasActivePlan: boolean; disabled?: boolean }) {
  const t = (es: string, en: string) => language === 'es' ? es : en
  const fieldId = useId()
  return <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/10 p-4">
    <div className="space-y-2 text-sm font-medium">
      <label htmlFor={`${fieldId}-date`}>{t('Fecha', 'Date')}</label>
      <TrainingDatePicker id={`${fieldId}-date`} value={form.date} max={today} language={language} disabled={disabled} onChange={date => onChange({ ...form, date })} />
    </div>
    <label className="block space-y-2 text-sm font-medium">{t('Nombre (opcional)', 'Name (optional)')}<Input maxLength={120} className="h-12 rounded-xl text-base" placeholder={t('Entrenamiento libre', 'Free workout')} value={form.name} onChange={e => onChange({ ...form, name: e.target.value })} /></label>
    <DisclosureSection summary={t('Duración y nota (opcionales)', 'Duration and note (optional)')} className="border-border/50">
      <div className="space-y-4">
        <label className="block space-y-2 text-sm">{t('Duración (minutos)', 'Duration (minutes)')}<Input className="h-12 rounded-xl text-base" type="text" inputMode="decimal" value={form.durationMinutes} placeholder={`1–${MAX_SESSION_DURATION_SECONDS / 60}`} onChange={e => onChange({ ...form, durationMinutes: e.target.value })} /></label>
        <label className="block space-y-2 text-sm">{t('Nota', 'Note')}<textarea maxLength={2000} rows={3} className="w-full rounded-xl border border-input bg-background p-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={form.notes} onChange={e => onChange({ ...form, notes: e.target.value })} /></label>
      </div>
    </DisclosureSection>
    {!hasActivePlan && <div className="space-y-2 text-sm font-medium">
      <label htmlFor={`${fieldId}-goal`}>{t('Meta de entrenamientos por semana', 'Workout goal per week')}</label>
      <TrainingGoalSelect id={`${fieldId}-goal`} value={form.weeklyGoal} language={language} disabled={disabled} onChange={weeklyGoal => onChange({ ...form, weeklyGoal })} />
    </div>}
  </div>
}

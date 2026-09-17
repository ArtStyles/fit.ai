'use client'

import { useEffect, useRef, useState } from 'react'
import { ImageIcon, Loader2 } from 'lucide-react'
import { MUSCLE_GROUPS, type MuscleGroupId } from '@/lib/muscles/activity'
import { PERSONAL_EXERCISE_ILLUSTRATIONS } from '@/lib/exercises/personal-illustrations'
import { createPersonalExercise, loadPersonalExerciseContext } from '@/lib/exercises/personal-platform'
import type { ExerciseCatalogOption } from '@/components/plan/ExercisePicker'

export type PersonalExerciseDraft = { name: string; description: string; recording: 'reps' | 'time'; muscleGroups: MuscleGroupId[]; illustration: MuscleGroupId | null }
export type PersonalExerciseFormViewProps = {
  language?: 'es' | 'en'; draft: PersonalExerciseDraft; busy?: boolean; ready?: boolean; error?: string | null
  onChange: (draft: PersonalExerciseDraft) => void; onSubmit: () => void; onCancel: () => void
}
export function formatPersonalExerciseError(cause: unknown, language: 'es' | 'en'): string {
  const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : ''
  const messages: Record<string, [string, string]> = {
    'account-changed': ['La cuenta cambió. Vuelve a abrir el selector.', 'The account changed. Open the picker again.'],
    'invalid-fields': ['Revisa el nombre, la descripción y los músculos elegidos.', 'Check the name, description and selected muscles.'],
    'invalid-illustration': ['Elige una ilustración de los músculos seleccionados o continúa sin imagen.', 'Choose an illustration for a selected muscle or continue without an image.'],
    'identity-conflict': ['No se pudo guardar este ejercicio. Vuelve a abrir el formulario.', 'Could not save this exercise. Open the form again.'],
    'profile-unavailable': ['Vuelve a iniciar sesión para crear el ejercicio.', 'Sign in again to create the exercise.'],
  }
  return (messages[code] ?? ['No se pudo guardar. Inténtalo otra vez.', 'Could not save. Try again.'])[language === 'es' ? 0 : 1]
}
export function PersonalExerciseFormView({ language = 'es', draft, busy = false, ready = false, error, onChange, onSubmit, onCancel }: PersonalExerciseFormViewProps) {
  const [showGallery, setShowGallery] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ready) nameInput.current?.focus() }, [ready])
  const copy = (es: string, en: string) => language === 'es' ? es : en
  const choices = PERSONAL_EXERCISE_ILLUSTRATIONS.filter(item => draft.muscleGroups.includes(item.id))
  const selectedImage = choices.find(item => item.id === draft.illustration)
  return (
    <form className="flex min-h-0 min-w-0 flex-1 flex-col" aria-busy={busy || undefined} onSubmit={event => { event.preventDefault(); onSubmit() }}>
      <fieldset disabled={busy || !ready} className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto border-0 p-4">
        <p className="text-sm text-muted-foreground">{copy('Solo tú puedes usar este ejercicio. Podrás añadirlo a tu entrenamiento después de guardarlo.', 'Only you can use this exercise. You can add it to your workout after saving it.')}</p>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{copy('Nombre', 'Name')}</span>
          <input ref={nameInput} name="name" required maxLength={120} value={draft.name} onChange={event => onChange({ ...draft, name: event.target.value })} autoFocus autoComplete="off" placeholder={copy('Ej. Sentadilla con pausa', 'e.g. Paused squat')} className="h-12 w-full rounded-xl border border-border bg-muted/30 px-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{copy('Descripción', 'Description')} <span className="font-normal text-muted-foreground">{copy('(opcional)', '(optional)')}</span></span>
          <textarea name="description" maxLength={2000} rows={2} value={draft.description} onChange={event => onChange({ ...draft, description: event.target.value })} placeholder={copy('Una indicación que te ayude a recordarlo', 'A cue to help you remember it')} className="w-full resize-y rounded-xl border border-border bg-muted/30 px-3 py-2 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        </label>
        <div className="space-y-2">
          <p className="text-sm font-medium">{copy('¿Cómo lo registras?', 'How do you track it?')}</p>
          <div className="grid grid-cols-2 gap-2">
            {(['reps', 'time'] as const).map(mode => (
              <label key={mode} className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border px-2 text-sm ${draft.recording === mode ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-muted/20 text-muted-foreground'}`}>
                <input type="radio" name="recording" value={mode} checked={draft.recording === mode} onChange={() => onChange({ ...draft, recording: mode })} className="accent-primary" />
                {mode === 'reps' ? copy('Repeticiones', 'Repetitions') : copy('Tiempo', 'Time')}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">{copy('Músculos', 'Muscles')} <span className="font-normal text-muted-foreground">{copy('(opcional)', '(optional)')}</span></p>
          <p className="text-xs leading-relaxed text-muted-foreground">{copy('Elige los que trabaja. Si no los conoces, puedes dejarlo vacío.', 'Choose the muscles it works. You can leave this empty if you are unsure.')}</p>
          <div className="flex flex-wrap gap-2">
            {MUSCLE_GROUPS.map(group => {
              const selected = draft.muscleGroups.includes(group.id)
              return <button key={group.id} type="button" aria-pressed={selected} onClick={() => {
                const muscleGroups = selected ? draft.muscleGroups.filter(id => id !== group.id) : [...draft.muscleGroups, group.id]
                onChange({ ...draft, muscleGroups, illustration: draft.illustration && muscleGroups.includes(draft.illustration) ? draft.illustration : null })
              }} className={`min-h-11 rounded-xl border px-3 py-2 text-xs font-medium ${selected ? 'border-primary/70 bg-primary/15 text-foreground' : 'border-border bg-muted/20 text-muted-foreground'}`}>{group[language]}</button>
            })}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">{copy('Imagen', 'Image')} <span className="font-normal text-muted-foreground">{copy('(opcional)', '(optional)')}</span></p>
            <button type="button" aria-expanded={showGallery} onClick={() => setShowGallery(value => !value)} className="min-h-11 rounded-lg px-2 text-xs font-semibold text-primary">{showGallery ? copy('Ocultar ilustraciones', 'Hide illustrations') : copy('Elegir ilustración', 'Choose illustration')}</button>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-3">
            {selectedImage ? <img src={selectedImage.src} alt="" className="h-14 w-14 rounded-lg object-contain" /> : <ImageIcon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
            <span className="text-sm text-muted-foreground">{selectedImage ? selectedImage[language] : copy('Sin imagen', 'No image')}</span>
            {selectedImage ? <button type="button" onClick={() => onChange({ ...draft, illustration: null })} className="ml-auto min-h-11 px-2 text-xs font-medium text-primary">{copy('Quitar', 'Remove')}</button> : null}
          </div>
          {showGallery || selectedImage ? <p className="text-xs leading-relaxed text-muted-foreground">{copy('Son ilustraciones genéricas del músculo, no demostraciones de la técnica del ejercicio.', 'These are generic muscle illustrations, not demonstrations of exercise technique.')}</p> : null}
          {showGallery ? <div className="space-y-2">
            {choices.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{choices.map(item => <button key={item.id} type="button" aria-pressed={draft.illustration === item.id} onClick={() => onChange({ ...draft, illustration: item.id })} className={`rounded-xl border p-2 ${draft.illustration === item.id ? 'border-primary bg-primary/10' : 'border-border bg-muted/20'}`}><img src={item.src} alt="" loading="lazy" className="mx-auto h-20 w-20 object-contain" /><span className="mt-1 block text-xs">{item[language]}</span></button>)}</div> : <p className="text-xs text-muted-foreground">{copy('Selecciona un músculo con ilustración disponible para ver sus opciones.', 'Select a muscle with an available illustration to see its options.')}</p>}
          </div> : null}
        </div>
      </fieldset>
      <div className="shrink-0 space-y-3 border-t border-border/60 bg-background p-4">
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {!ready && !error ? <p role="status" className="text-sm text-muted-foreground">{copy('Preparando formulario…', 'Preparing form…')}</p> : null}
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className="min-h-12 rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-50">{copy('Volver', 'Back')}</button>
          <button type="submit" disabled={busy || !ready || !draft.name.trim()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{copy('Guardando…', 'Saving…')}</> : copy('Crear ejercicio', 'Create exercise')}</button>
        </div>
      </div>
    </form>
  )
}

export function PersonalExerciseForm({ language = 'es', onCreated, onCancel, onBusyChange }: {
  language?: 'es' | 'en'; onCreated: (exercise: ExerciseCatalogOption) => void; onCancel: () => void; onBusyChange?: (busy: boolean) => void
}) {
  const [draft, setDraft] = useState<PersonalExerciseDraft>({ name: '', description: '', recording: 'reps', muscleGroups: [], illustration: null })
  const [context, setContext] = useState<Awaited<ReturnType<typeof loadPersonalExerciseContext>>>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true), submitting = useRef(false)
  const operation = useRef<{ fingerprint: string; id: string } | null>(null)
  const copy = (es: string, en: string) => language === 'es' ? es : en
  useEffect(() => {
    let active = true
    mounted.current = true
    void loadPersonalExerciseContext().then(value => {
      if (!active) return
      setContext(value)
      if (!value) setError(language === 'es' ? 'Vuelve a iniciar sesión para crear un ejercicio.' : 'Sign in again to create an exercise.')
    }).catch(() => { if (active) setError(language === 'es' ? 'No pudimos cargar tu cuenta. Vuelve a abrir el formulario.' : 'We could not load your account. Open the form again.') })
    return () => { active = false; mounted.current = false }
  }, [language])

  async function submit() {
    if (submitting.current || !context) return
    if (!draft.name.trim()) { setError(copy('Escribe un nombre para el ejercicio.', 'Enter an exercise name.')); return }
    submitting.current = true; setBusy(true); setError(null); onBusyChange?.(true)
    const payload = { ...draft, name: draft.name.trim(), description: draft.description.trim() }
    const fingerprint = JSON.stringify(payload)
    if (operation.current?.fingerprint !== fingerprint) operation.current = { fingerprint, id: crypto.randomUUID() }
    try {
      const exercise = await createPersonalExercise({ ...payload, accountId: context.accountId, sessionVersion: context.sessionVersion, operationId: operation.current.id })
      const latest = await loadPersonalExerciseContext()
      if (!mounted.current) return
      if (!latest || latest.accountId !== context.accountId || latest.sessionVersion !== context.sessionVersion) {
        setError(copy('La cuenta cambió. Vuelve a abrir el selector.', 'The account changed. Open the picker again.')); return
      }
      onCreated(exercise)
    } catch (cause) {
      if (mounted.current) setError(formatPersonalExerciseError(cause, language))
    } finally {
      submitting.current = false
      if (mounted.current) { setBusy(false); onBusyChange?.(false) }
    }
  }
  return <PersonalExerciseFormView language={language} draft={draft} onChange={setDraft} ready={!!context} busy={busy} error={error} onSubmit={() => void submit()} onCancel={onCancel} />
}

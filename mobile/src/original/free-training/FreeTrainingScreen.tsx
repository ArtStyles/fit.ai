'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, Plus, Search, TrendingUp } from 'lucide-react'
import { EvidenceHero } from '@/components/evidence/EvidenceHero'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Link, { navigate } from '../router'
import { clearFreeTrainingDraft, saveFreeTraining, saveFreeTrainingDraft } from './data'
import type { FreeTrainingModel, FreeTrainingResult } from './types'
import { addExercise, inputFromForm, localizeSaveError, restoreDraft, reusePrevious, type FreeTrainingDraft, type FreeTrainingForm } from './view-model'
import { ExerciseFieldsCard, TrainingFields } from './FreeTrainingFields'

type Saved = Extract<FreeTrainingResult, { success: true }>
export function FreeTrainingScreen({ model, draft, draftLoadFailed = false }: { model: FreeTrainingModel; draft: FreeTrainingDraft | null; draftLoadFailed?: boolean }) {
  const t = (es: string, en: string) => model.language === 'es' ? es : en
  const saveError = (message: string) => localizeSaveError(message, model.language)
  const base = useRef({ ...model.initial, ...(!model.hasActivePlan && model.weeklyGoal != null ? { weeklyGoal: model.weeklyGoal } : {}) })
  const validDraft = draft?.accountId === model.accountId && draft.sessionId === model.initial.sessionId && draft.expectedVersion === model.initial.expectedVersion ? draft : null
  const [form, setForm] = useState(() => restoreDraft(base.current, validDraft, model.catalog))
  const formRef = useRef(form)
  const operationId = useRef(validDraft?.operationId ?? model.initial.operationId)
  const [showExercises, setShowExercises] = useState(form.exercises.length > 0)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [draftError, setDraftError] = useState(draftLoadFailed)
  const [draftSaved, setDraftSaved] = useState(Boolean(validDraft))
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Saved | null>(null)
  const resultRef = useRef<Saved | null>(null)
  const busyRef = useRef(false)
  const alive = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const resultHeading = useRef<HTMLHeadingElement>(null)

  function cancelTimer() { if (timer.current) clearTimeout(timer.current); timer.current = null }
  function persistDraft() {
    cancelTimer()
    const snapshot: FreeTrainingDraft = { ...base.current, operationId: operationId.current, uiDraft: structuredClone(formRef.current) }
    const pending = queue.current.catch(() => {}).then(() => saveFreeTrainingDraft(snapshot))
    queue.current = pending
    void pending.then(() => { if (alive.current && snapshot.operationId === operationId.current) { setDraftError(false); setDraftSaved(true) } }, () => { if (alive.current && snapshot.operationId === operationId.current) { setDraftError(true); setDraftSaved(false) } })
    return pending
  }
  // Keep the latest form through navigation/backgrounding; writes are serialized
  // so an older slow draft cannot replace the newest values or resurrect a save.
  const flushRef = useRef(persistDraft)
  flushRef.current = persistDraft
  useEffect(() => {
    alive.current = true
    const background = () => { if (document.visibilityState === 'hidden' && !busyRef.current && !resultRef.current) void flushRef.current().catch(() => {}) }
    document.addEventListener('visibilitychange', background)
    return () => {
      alive.current = false
      document.removeEventListener('visibilitychange', background)
      if (!busyRef.current && !resultRef.current) void flushRef.current().catch(() => {})
      else cancelTimer()
    }
  }, [])
  useEffect(() => { if (result) resultHeading.current?.focus() }, [result])

  function update(next: FreeTrainingForm) {
    if (busyRef.current) return
    formRef.current = next
    operationId.current = crypto.randomUUID()
    setForm(next); setError(''); setDraftSaved(false)
    cancelTimer()
    timer.current = setTimeout(() => { void flushRef.current().catch(() => {}) }, 400)
  }
  async function save() {
    if (busyRef.current) return
    let input
    try { input = inputFromForm(formRef.current, { ...base.current, operationId: operationId.current }, model.today, model.language) }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('Revisa los campos.', 'Check the fields.')); return }
    busyRef.current = true; setBusy(true); setError('')
    try {
      // Failure to cache must not prevent the user from saving the real log.
      await persistDraft().catch(() => {})
      const saved = await saveFreeTraining(input)
      if (!saved.success) { if (alive.current) setError(saveError(saved.error)); return }
      resultRef.current = saved
      base.current = { ...input, expectedVersion: saved.version, operationId: crypto.randomUUID() }
      operationId.current = base.current.operationId
      await queue.current.catch(() => {})
      await clearFreeTrainingDraft(model.accountId, input.sessionId).catch(() => { if (alive.current) setDraftError(true) })
      if (alive.current) { setResult(saved); setDraftSaved(false) }
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? saveError(reason.message) : t('No se pudo guardar. Conservamos los campos; vuelve a intentarlo.', 'Could not save. Your fields are preserved; try again.'))
    } finally { busyRef.current = false; if (alive.current) setBusy(false) }
  }
  const query = search.trim().toLocaleLowerCase(model.language)
  const available = model.catalog.filter(item => !form.exercises.some(e => e.exerciseId === item.id) && (!query || `${item.name} ${item.muscleGroups.join(' ')}`.toLocaleLowerCase(model.language).includes(query)))
  const detailLabel = (level: string) => level === 'attendance' ? t('Solo constancia', 'Attendance only') : level === 'partial' ? t('Detalle parcial', 'Partial details') : t('Detalle completo', 'Complete details')
  const savedSets = base.current.exercises.flatMap(exercise => exercise.sets)
  const onlyTimedSets = savedSets.length > 0 && savedSets.every(set => set.durationSeconds !== undefined)
  const recordedSeconds = savedSets.reduce((total, set) => total + (set.durationSeconds ?? 0), 0)

  return <>
    <PageTopBar title={t('Registrar entrenamiento', 'Log workout')} backHref="/dashboard" backLabel={t('Volver a Inicio', 'Back to Home')} />
    <main className="mx-auto w-full max-w-lg space-y-6 px-4 pb-28 pt-6 text-foreground">
      {result ? <section className="space-y-5 rounded-3xl border border-border/60 bg-muted/10 p-5" aria-labelledby="saved-title">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-700 dark:text-violet-300"><Check className="h-6 w-6" /></span>
        <div><h2 id="saved-title" ref={resultHeading} tabIndex={-1} className="font-display text-2xl font-bold leading-tight outline-none">{t('Entrenamiento guardado', 'Workout saved')}</h2><p className="mt-2 text-sm text-muted-foreground">{form.name || t('Entrenamiento libre', 'Free workout')} · {form.date}</p><p className="mt-2 text-sm font-semibold text-violet-700 dark:text-violet-300">{detailLabel(result.detailLevel)}</p></div>
        <p className="text-sm text-muted-foreground">{result.detailLevel === 'attendance' ? t('Tu entrenamiento ya cuenta. Puedes añadir los ejercicios después.', 'Your workout counts. You can add the exercises later.') : result.detailLevel === 'partial' ? t('El progreso refleja únicamente las series que registraste.', 'Progress reflects only the sets you logged.') : t('Guardamos las series que confirmaste para esta sesión.', 'The sets you confirmed for this session are saved.')}</p>
        {result.detailLevel !== 'attendance' && <div className="grid grid-cols-2 gap-4 border-y border-border/50 py-4"><div><strong className="font-display text-2xl font-bold tabular-nums">{result.sets}</strong><p className="text-sm text-muted-foreground">{t('Series registradas', 'Logged sets')}</p></div><div><strong className="font-display text-2xl font-bold tabular-nums">{new Intl.NumberFormat(model.language, { maximumFractionDigits: 1 }).format(onlyTimedSets ? recordedSeconds : result.volumeKg)} <span className="text-sm">{onlyTimedSets ? 's' : 'kg'}</span></strong><p className="text-sm text-muted-foreground">{onlyTimedSets ? t('Tiempo registrado', 'Logged time') : t('Volumen registrado', 'Logged volume')}</p></div></div>}
        <p className="text-sm">{result.trainedDaysThisWeek} {result.trainedDaysThisWeek === 1 ? t('día con entrenamiento en esa semana', 'training day in that week') : t('días con entrenamiento en esa semana', 'training days in that week')}</p>
        {result.improvements.map((item, i) => <div key={i} className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.05] p-4 text-sm tabular-nums"><p className="font-semibold">{item.exerciseName}</p><p>{item.previousWeightKg} kg × {item.previousReps} → {item.weightKg} kg × {item.reps}</p></div>)}
        <div className="grid gap-2"><Button asChild className="h-12 rounded-xl bg-violet-600 text-white hover:bg-violet-700"><Link href="/progress"><TrendingUp className="mr-2 h-4 w-4" />{t('Ver mi progreso', 'View my progress')}</Link></Button><Button asChild variant="outline" className="h-12 whitespace-normal rounded-xl border-border/60"><Link href={`/history/${result.logId}`}>{t('Ver registro', 'View entry')}</Link></Button><Button type="button" variant="outline" className="h-12 whitespace-normal rounded-xl border-border/60" onClick={() => navigate(`/registrar?log=${result.logId}`, true)}>{t('Añadir o editar detalles', 'Add or edit details')}</Button><Button type="button" variant="ghost" className="h-12 rounded-xl" onClick={() => navigate(`/registrar?draft=${crypto.randomUUID()}`)}>{t('Registrar otra sesión', 'Log another session')}</Button></div>
      </section> : <>
        <EvidenceHero
          eyebrow={base.current.expectedVersion == null ? t('Entrenamiento libre', 'Free workout') : t('Editar el mismo entrenamiento', 'Edit this workout')}
          title={t('Lo que hiciste hoy cuenta', 'What you did today counts')}
          description={t('Guarda tu entrenamiento. Si quieres, añade los ejercicios que realizaste.', 'Save your workout. If you want, add the exercises you performed.')}
        />
        <form className="space-y-5" onSubmit={event => { event.preventDefault(); void save() }}>
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <TrainingFields disabled={busy} form={form} today={model.today} onChange={update} language={model.language} hasActivePlan={model.hasActivePlan} />
            <Button type="button" variant="outline" className="h-12 w-full rounded-xl border-border/60 font-semibold" aria-expanded={showExercises} aria-controls="free-training-exercises" onClick={() => setShowExercises(value => !value)}><Plus className="mr-2 h-4 w-4" />{showExercises ? t('Ocultar ejercicios', 'Hide exercises') : t('Añadir ejercicios', 'Add exercises')}{form.exercises.length ? ` (${form.exercises.length})` : ''}</Button>
            {showExercises && <section id="free-training-exercises" className="space-y-4" aria-label={t('Ejercicios realizados', 'Performed exercises')}>
              {form.exercises.map((exercise, index) => { const item = model.catalog.find(e => e.id === exercise.exerciseId); return <ExerciseFieldsCard key={exercise.exerciseId} exercise={exercise} item={item} index={index} language={model.language} update={value => update({ ...form, exercises: form.exercises.map((e, i) => i === index ? value : e) })} remove={() => update({ ...form, exercises: form.exercises.filter((_, i) => i !== index) })} reuse={() => { if (item) update(reusePrevious(form, item)) }} /> })}
              <label className="block space-y-2 text-xs font-medium text-muted-foreground"><span className="inline-flex items-center gap-2"><Search className="h-4 w-4" />{t('Buscar ejercicio', 'Search exercises')}</span><Input type="search" className="h-12 rounded-xl border-border/70 px-4 text-base text-foreground" placeholder={t('Nombre o músculo', 'Name or muscle')} value={search} onChange={event => setSearch(event.target.value)} /></label>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-2xl border border-border/60 bg-background/50 p-1">{available.slice(0, 30).map(item => <button key={item.id} type="button" className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-violet-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => update(addExercise(form, item))}><span className="min-w-0 break-words">{item.name}</span><Plus className="h-4 w-4 shrink-0 text-violet-700 dark:text-violet-300" /></button>)}{available.length === 0 && <p className="p-3 text-sm text-muted-foreground">{t('No hay ejercicios con esa búsqueda.', 'No exercises match your search.')}</p>}{available.length > 30 && <p className="p-3 text-xs text-muted-foreground">{t('Escribe para encontrar más ejercicios.', 'Type to find more exercises.')}</p>}</div>
            </section>}
            {form.exercises.length > 0 && <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl border border-border/60 bg-muted/10 p-4 text-sm"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2" checked={form.complete} onChange={e => update({ ...form, complete: e.target.checked })} /><span><span className="block font-medium">{t('Registré todo el entrenamiento', 'I logged the whole workout')}</span><span className="text-muted-foreground">{t('Si faltan ejercicios o series, lo guardaremos como parcial.', 'If exercises or sets are missing, we will save it as partial.')}</span></span></label>}
          </fieldset>
          {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy} className="min-h-12 w-full whitespace-normal rounded-xl bg-violet-600 text-base font-semibold text-white hover:bg-violet-700">{busy ? t('Guardando…', 'Saving…') : base.current.expectedVersion != null ? t('Guardar cambios', 'Save changes') : form.exercises.length ? t('Guardar entrenamiento', 'Save workout') : t('Guardar constancia', 'Save attendance')}</Button>
          <p className="text-center text-xs text-muted-foreground" role="status">{draftError ? t('No se pudo guardar el borrador. Tus campos siguen aquí. Puedes guardar o reintentar.', 'Draft could not be saved. Your fields are still here. Save or retry.') : draftSaved ? t('Borrador guardado en este dispositivo', 'Draft saved on this device') : t('Disponible sin conexión', 'Available offline')}</p>
          {draftError && <Button type="button" variant="outline" className="h-12 w-full rounded-xl border-border/60" disabled={busy} onClick={() => { void persistDraft().catch(() => {}) }}>{t('Reintentar borrador', 'Retry draft')}</Button>}
        </form>
        {model.recent.length > 0 && <section className="space-y-2 rounded-2xl border border-border/60 bg-muted/10 p-5"><h2 className="text-base font-semibold">{t('¿Quieres completar un registro anterior?', 'Want to complete an earlier entry?')}</h2><p className="text-xs text-muted-foreground">{t('Ábrelo para añadir detalles al mismo entrenamiento.', 'Open it to add details to the same workout.')}</p>{model.recent.filter(entry => entry.id !== model.initial.sessionId).slice(0, 3).map(entry => <Link key={entry.id} href={`/registrar?log=${entry.id}`} className="flex min-h-14 items-center justify-between gap-3 border-t border-border/50 py-3 text-sm transition-colors hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:hover:text-violet-300"><span className="min-w-0"><span className="block break-words font-medium">{entry.name}</span><span className="text-xs text-muted-foreground">{entry.date.slice(0, 10)} · {detailLabel(entry.detailLevel)}</span></span><ChevronRight className="h-4 w-4 shrink-0" /></Link>)}</section>}
      </>}
    </main>
  </>
}

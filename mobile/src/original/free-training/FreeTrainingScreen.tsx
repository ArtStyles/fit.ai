'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronRight, Dumbbell, Plus, TrendingUp } from 'lucide-react'
import { DisclosureSection } from '@/components/evidence/DisclosureSection'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { ExerciseCatalogDialog, type ExerciseCatalogOption } from '@/components/plan/ExercisePicker'
import { Button } from '@/components/ui/button'
import Link, { navigate } from '../router'
import { clearFreeTrainingDraft, saveFreeTraining, saveFreeTrainingDraft } from './data'
import type { FreeTrainingCatalogItem, FreeTrainingModel, FreeTrainingResult } from './types'
import { addExercise, inputFromForm, localizeSaveError, restoreDraft, reusePrevious, type FreeTrainingDraft, type FreeTrainingForm } from './view-model'
import { ExerciseFieldsCard, TrainingFields, TrainingPreferences } from './FreeTrainingFields'

type Saved = Extract<FreeTrainingResult, { success: true }>
export function FreeTrainingScreen({ model, draft, draftLoadFailed = false }: { model: FreeTrainingModel; draft: FreeTrainingDraft | null; draftLoadFailed?: boolean }) {
  const t = (es: string, en: string) => model.language === 'es' ? es : en
  const saveError = (message: string) => localizeSaveError(message, model.language)
  const base = useRef({ ...model.initial, ...(!model.hasActivePlan && model.weeklyGoal != null ? { weeklyGoal: model.weeklyGoal } : {}) })
  const validDraft = draft?.accountId === model.accountId && draft.sessionId === model.initial.sessionId && draft.expectedVersion === model.initial.expectedVersion ? draft : null
  const [form, setForm] = useState(() => restoreDraft(base.current, validDraft, model.catalog))
  const formRef = useRef(form)
  const operationId = useRef(validDraft?.operationId ?? model.initial.operationId)
  const [catalog, setCatalog] = useState(model.catalog)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const catalogButton = useRef<HTMLButtonElement>(null)
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
  const catalogOptions = useMemo<ExerciseCatalogOption[]>(() => catalog
    .filter(item => !form.exercises.some(exercise => exercise.exerciseId === item.id))
    .map(item => ({ id: item.id, name: item.name, muscleGroups: item.muscleGroups, equipment: item.equipment ?? [], imageUrl: item.imageUrl ?? null, personal: item.personal })), [catalog, form.exercises])
  function changeCatalogOpen(open: boolean) {
    if (busyRef.current) return
    setCatalogOpen(open)
  }
  function personalCatalogItem(selected: ExerciseCatalogOption): FreeTrainingCatalogItem {
    return { id: selected.id, name: selected.name, muscleGroups: selected.muscleGroups, equipment: selected.equipment, imageUrl: selected.imageUrl, personal: selected.personal, timed: ['cardio', 'flexibility'].includes(selected.exerciseType ?? ''), previous: null, previousDate: null }
  }
  function rememberPersonalExercise(selected: ExerciseCatalogOption) {
    if (!alive.current || busyRef.current) return
    const item = personalCatalogItem(selected)
    // Creation saves a library item; choosing it for this workout remains separate.
    setCatalog(current => current.some(existing => existing.id === item.id) ? current : [...current, item])
  }
  function confirmExercises(ids: string[], selectedOptions: ExerciseCatalogOption[] = []) {
    if (!alive.current || busyRef.current) return false
    const additions: FreeTrainingCatalogItem[] = ids.flatMap(id => {
      const existing = catalog.find(item => item.id === id)
      if (existing) return [existing]
      const selected = selectedOptions.find(item => item.id === id)
      return selected ? [personalCatalogItem(selected)] : []
    })
    if (additions.length !== ids.length) throw new Error(t('No se pudo añadir la selección. Vuelve a elegir los ejercicios.', 'Could not add your selection. Choose the exercises again.'))
    setCatalog(current => [...current, ...additions.filter(item => !current.some(existing => existing.id === item.id))])
    update(additions.reduce((current, item) => addExercise(current, item), formRef.current))
    return true
  }
  const detailLabel = (level: string) => level === 'attendance' ? t('Solo constancia', 'Attendance only') : level === 'partial' ? t('Detalle parcial', 'Partial details') : t('Detalle completo', 'Complete details')
  const savedSets = base.current.exercises.flatMap(exercise => exercise.sets)
  const onlyTimedSets = savedSets.length > 0 && savedSets.every(set => set.durationSeconds !== undefined)
  const recordedSeconds = savedSets.reduce((total, set) => total + (set.durationSeconds ?? 0), 0)

  return <>
    <PageTopBar title={base.current.expectedVersion != null && !result ? t('Editar entrenamiento', 'Edit workout') : t('Registrar entrenamiento', 'Log workout')} backHref="/dashboard" backLabel={t('Volver a Inicio', 'Back to Home')} />
    <main className="mx-auto w-full max-w-lg space-y-5 px-4 pb-28 pt-5 text-foreground">
      {result ? <section className="space-y-5 rounded-3xl border border-border/60 bg-muted/10 p-5" aria-labelledby="saved-title">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-700 dark:text-violet-300"><Check className="h-6 w-6" /></span>
        <div><h2 id="saved-title" ref={resultHeading} tabIndex={-1} className="font-display text-2xl font-bold leading-tight outline-none">{t('Entrenamiento guardado', 'Workout saved')}</h2><p className="mt-2 text-sm text-muted-foreground">{form.name || t('Entrenamiento libre', 'Free workout')} · {form.date}</p><p className="mt-2 text-sm font-semibold text-violet-700 dark:text-violet-300">{detailLabel(result.detailLevel)}</p></div>
        <p className="text-sm text-muted-foreground">{result.detailLevel === 'attendance' ? t('Tu entrenamiento ya cuenta. Puedes añadir los ejercicios después.', 'Your workout counts. You can add the exercises later.') : result.detailLevel === 'partial' ? t('El progreso refleja únicamente las series que registraste.', 'Progress reflects only the sets you logged.') : t('Guardamos las series que confirmaste para esta sesión.', 'The sets you confirmed for this session are saved.')}</p>
        {result.detailLevel !== 'attendance' && <div className="grid grid-cols-2 gap-4 border-y border-border/50 py-4"><div><strong className="font-display text-2xl font-bold tabular-nums">{result.sets}</strong><p className="text-sm text-muted-foreground">{t('Series registradas', 'Logged sets')}</p></div><div><strong className="font-display text-2xl font-bold tabular-nums">{new Intl.NumberFormat(model.language, { maximumFractionDigits: 1 }).format(onlyTimedSets ? recordedSeconds : result.volumeKg)} <span className="text-sm">{onlyTimedSets ? 's' : 'kg'}</span></strong><p className="text-sm text-muted-foreground">{onlyTimedSets ? t('Tiempo registrado', 'Logged time') : t('Volumen registrado', 'Logged volume')}</p></div></div>}
        <p className="text-sm">{result.trainedDaysThisWeek} {result.trainedDaysThisWeek === 1 ? t('día con entrenamiento en esa semana', 'training day in that week') : t('días con entrenamiento en esa semana', 'training days in that week')}</p>
        {result.improvements.map((item, i) => <div key={i} className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.05] p-4 text-sm tabular-nums"><p className="font-semibold">{item.exerciseName}</p><p>{item.previousWeightKg} kg × {item.previousReps} → {item.weightKg} kg × {item.reps}</p></div>)}
        <div className="grid gap-2"><Button asChild className="h-12 rounded-xl bg-violet-600 text-white hover:bg-violet-700"><Link href="/progress"><TrendingUp className="mr-2 h-4 w-4" />{t('Ver mi progreso', 'View my progress')}</Link></Button><Button asChild variant="outline" className="h-12 whitespace-normal rounded-xl border-border/60"><Link href={`/history/${result.logId}`}>{t('Ver registro', 'View entry')}</Link></Button><Button type="button" variant="outline" className="h-12 whitespace-normal rounded-xl border-border/60" onClick={() => navigate(`/registrar?log=${result.logId}`, true)}>{t('Añadir o editar detalles', 'Add or edit details')}</Button><Button type="button" variant="ghost" className="h-12 rounded-xl" onClick={() => navigate(`/registrar?draft=${crypto.randomUUID()}`)}>{t('Registrar otra sesión', 'Log another session')}</Button></div>
      </section> : <>
        <div className="space-y-1 px-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">{t('A tu manera', 'Your way')}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{base.current.expectedVersion != null ? t('Completa o corrige este registro. Sigue siendo el mismo entrenamiento.', 'Complete or correct this entry. It remains the same workout.') : t('Guarda lo que hiciste, con el detalle que quieras.', 'Log what you did, with as much detail as you want.')}</p>
        </div>
        <form className="space-y-5" onSubmit={event => { event.preventDefault(); void save() }}>
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <TrainingFields disabled={busy} form={form} today={model.today} onChange={update} language={model.language} />
            <section className="space-y-3" aria-labelledby="free-training-exercises-title">
              <div className="flex items-center justify-between gap-3 px-1"><h2 id="free-training-exercises-title" className="text-base font-semibold">{t('Ejercicios y series', 'Exercises and sets')}</h2>{form.exercises.length > 0 && <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-xs font-semibold tabular-nums text-violet-700 dark:text-violet-300">{form.exercises.length}</span>}</div>
              {!form.exercises.length && <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border/70 p-4"><Dumbbell aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-violet-700 dark:text-violet-300" /><p className="text-sm leading-relaxed text-muted-foreground">{t('Puedes guardar solo la constancia o añadir los ejercicios que hiciste.', 'Save attendance only, or add the exercises you performed.')}</p></div>}
              {form.exercises.map((exercise, index) => { const item = catalog.find(e => e.id === exercise.exerciseId); return <ExerciseFieldsCard key={exercise.exerciseId} exercise={exercise} item={item} index={index} language={model.language} update={value => update({ ...form, exercises: form.exercises.map((e, i) => i === index ? value : e) })} remove={() => update({ ...form, complete: false, exercises: form.exercises.filter((_, i) => i !== index) })} reuse={() => { if (item) update(reusePrevious(form, item)) }} /> })}
              <Button ref={catalogButton} type="button" variant="outline" disabled={form.exercises.length >= 100} className="h-12 w-full rounded-xl border-violet-500/30 bg-violet-500/5 font-semibold text-violet-700 hover:bg-violet-500/10 dark:text-violet-300" aria-haspopup="dialog" aria-expanded={catalogOpen} onClick={() => changeCatalogOpen(true)}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />{t('Añadir ejercicios', 'Add exercises')}</Button>
            </section>
            {!model.hasActivePlan && <TrainingPreferences disabled={busy} form={form} onChange={update} language={model.language} />}
            <section className="space-y-3 rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-4" aria-label={t('Detalle del registro', 'Entry detail')}>
              <p className="text-sm font-semibold">{form.exercises.length ? detailLabel(form.complete ? 'complete' : 'partial') : detailLabel('attendance')}</p>
              {form.exercises.length > 0 ? <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2" checked={form.complete} onChange={e => update({ ...form, complete: e.target.checked })} /><span><span className="block font-medium">{t('Registré todo el entrenamiento', 'I logged the whole workout')}</span><span className="mt-1 block text-muted-foreground">{t('Si faltan ejercicios o series, déjalo sin marcar para guardar un registro parcial.', 'Leave this unchecked if exercises or sets are missing, to save a partial entry.')}</span></span></label> : <p className="text-sm text-muted-foreground">{t('Cuenta como un día entrenado. Puedes añadir las series después.', 'Counts as a training day. You can add sets later.')}</p>}
            </section>
          </fieldset>
          {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy} className="min-h-12 w-full whitespace-normal rounded-xl bg-violet-600 text-base font-semibold text-white hover:bg-violet-700">{busy ? t('Guardando…', 'Saving…') : base.current.expectedVersion != null ? t('Guardar cambios', 'Save changes') : form.exercises.length ? t('Guardar entrenamiento', 'Save workout') : t('Guardar constancia', 'Save attendance')}</Button>
          <p className="text-center text-xs text-muted-foreground" role="status">{draftError ? t('No se pudo guardar el borrador. Tus campos siguen aquí. Puedes guardar o reintentar.', 'Draft could not be saved. Your fields are still here. Save or retry.') : draftSaved ? t('Borrador guardado en este dispositivo', 'Draft saved on this device') : t('Disponible sin conexión', 'Available offline')}</p>
          {draftError && <Button type="button" variant="outline" className="h-12 w-full rounded-xl border-border/60" disabled={busy} onClick={() => { void persistDraft().catch(() => {}) }}>{t('Reintentar borrador', 'Retry draft')}</Button>}
        </form>
        {model.recent.some(entry => entry.id !== model.initial.sessionId) && <DisclosureSection summary={t('Completar un registro anterior', 'Complete an earlier entry')} className="px-1"><p className="mb-2 text-xs text-muted-foreground">{t('Ábrelo para añadir detalles al mismo entrenamiento.', 'Open it to add details to the same workout.')}</p>{model.recent.filter(entry => entry.id !== model.initial.sessionId).slice(0, 3).map(entry => <Link key={entry.id} href={`/registrar?log=${entry.id}`} className="flex min-h-14 items-center justify-between gap-3 border-t border-border/50 py-3 text-sm transition-colors hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:hover:text-violet-300"><span className="min-w-0"><span className="block break-words font-medium">{entry.name}</span><span className="text-xs text-muted-foreground">{entry.date.slice(0, 10)} · {detailLabel(entry.detailLevel)}</span></span><ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" /></Link>)}</DisclosureSection>}
        <ExerciseCatalogDialog open={catalogOpen} onOpenChange={changeCatalogOpen} options={catalogOptions} selectionMode="multiple" maxSelections={Math.min(12, 100 - form.exercises.length)} language={model.language} allowPersonalExercises title={t('Añadir ejercicios', 'Add exercises')} confirmVerb={t('Añadir', 'Add')} onPersonalExerciseCreated={rememberPersonalExercise} onConfirm={confirmExercises} onCloseAutoFocus={event => { event.preventDefault(); catalogButton.current?.focus() }} />
      </>}
    </main>
  </>
}

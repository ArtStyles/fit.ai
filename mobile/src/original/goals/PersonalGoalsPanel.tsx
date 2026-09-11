import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Plus, Target } from 'lucide-react'
import type { PersonalGoalsSlotProps } from '@/components/progress/PersonalGoalsSlot'
import { PendingLink } from '@/components/navigation/PendingLink'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MAX_SESSION_DURATION_SECONDS, MAX_SESSION_REPS, MAX_SESSION_WEIGHT_KG } from '@/lib/session/limits'
import { getAppStore } from '../storage'
import { saveExerciseGoal, removeExerciseGoal } from './data'
import { formatGoalSet, formatGoalTarget, normalizeGoalSearch, parseGoalTarget } from './view-model'
import type { ExerciseGoalsModel, GoalActionResult, PersonalExerciseGoal } from './types'

const primary = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50'
const secondary = 'inline-flex min-h-12 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50'
type Screen = { kind: 'create'; exerciseId?: string } | { kind: 'detail' | 'edit' | 'remove'; id: string } | null

export function PersonalGoalsPanel({ model, language, selectedExerciseId, onSelectionHandled, sessionVersion, refresh }: PersonalGoalsSlotProps & { model: ExerciseGoalsModel; sessionVersion: number; refresh(): Promise<void> }) {
  const en = language === 'en'
  const [screen, setScreen] = useState<Screen>(null)
  const [notice, setNotice] = useState('')
  const addButton = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const dialogTitle = useRef<HTMLHeadingElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const openingLocation = useRef('')
  const mounted = useRef(false)
  const mutating = useRef(false)
  const pendingChanged = (value: boolean) => { mutating.current = value }
  const currentScreen = useRef(screen)
  currentScreen.current = screen
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const open = (next: NonNullable<Screen>, trigger?: HTMLElement) => {
    setNotice('')
    const focused = document.activeElement
    opener.current = trigger ?? (focused instanceof HTMLElement && focused !== document.body ? focused : null)
    openingLocation.current = window.location.href
    setScreen(next)
  }
  const previousScreen = useRef<Screen>(null)
  useLayoutEffect(() => {
    const previous = previousScreen.current
    previousScreen.current = screen
    if (previous && screen && (previous.kind !== screen.kind || ('id' in previous && 'id' in screen && previous.id !== screen.id))) {
      dialogTitle.current?.focus({ preventScroll: true })
    }
  }, [screen])
  useEffect(() => {
    if (!selectedExerciseId) return
    const existing = model.goals.find(goal => goal.exerciseId === selectedExerciseId)
    if (existing) open({ kind: 'detail', id: existing.id })
    else if (model.goals.length >= 3) setNotice(en ? 'You already follow three exercises. Remove one to choose another.' : 'Ya sigues tres ejercicios. Quita uno para elegir otro.')
    else if (model.catalog.some(item => item.id === selectedExerciseId)) open({ kind: 'create', exerciseId: selectedExerciseId })
    else setNotice(en ? 'This exercise is not available in your catalog.' : 'Este ejercicio no está disponible en tu catálogo.')
    onSelectionHandled()
  }, [selectedExerciseId, model, onSelectionHandled, en])
  const goal = screen && screen.kind !== 'create' ? model.goals.find(item => item.id === screen.id) : undefined
  const date = (value: string) => new Intl.DateTimeFormat(en ? 'en-US' : 'es-ES', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))
  return <>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 ref={heading} tabIndex={-1} className="font-display text-xl font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">{en ? 'My goals' : 'Mis objetivos'}</h2><p className="mt-1 text-xs text-muted-foreground">{en ? 'All your available history' : 'Todo tu historial disponible'}</p></div>
      <button ref={addButton} type="button" className={primary} disabled={model.goals.length >= 3} onClick={event => { setNotice(''); open({ kind: 'create' }, event.currentTarget) }}><Plus className="h-4 w-4" aria-hidden="true" />{en ? 'Follow an exercise' : 'Seguir ejercicio'}</button>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">{model.goals.length}/3 {en ? 'exercises followed' : 'ejercicios en seguimiento'}</p>
    {notice && <p role="status" className="mt-3 text-sm text-muted-foreground">{notice}</p>}
    {!model.goals.length ? <div className="mt-4 rounded-2xl border border-dashed border-border p-5"><Target className="h-5 w-5 text-violet-300" aria-hidden="true" /><p className="mt-2 text-sm text-muted-foreground">{en ? 'Choose an exercise to see your evolution. A numeric target is optional.' : 'Elige un ejercicio para ver tu evolución. La meta numérica es opcional.'}</p></div> : <div className="mt-4 grid gap-3 xl:grid-cols-3">{model.goals.map(item => <button key={item.id} type="button" onClick={event => open({ kind: 'detail', id: item.id }, event.currentTarget)} className="min-w-0 rounded-2xl border border-border bg-muted/10 p-4 text-left transition-colors hover:border-violet-400/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
      <h3 className="break-words font-semibold">{item.name}</h3><p className="mt-1 text-xs text-muted-foreground">{formatGoalTarget(item.target, language)}</p>
      {item.achieved && <p className="mt-2 text-xs font-semibold text-emerald-300">{en ? 'Reached in your records' : 'Alcanzada en tus registros'}</p>}
      <GoalResults goal={item} language={language} />
    </button>)}</div>}
    <Dialog open={screen !== null} onOpenChange={open => { if (!open && !mutating.current) setScreen(null) }}>
      <DialogContent closeLabel={en ? 'Close' : 'Cerrar'} className="rounded-2xl" onEscapeKeyDown={event => { if (mutating.current) event.preventDefault() }} onInteractOutside={event => { if (mutating.current) event.preventDefault() }} onCloseAutoFocus={event => {
        event.preventDefault()
        // Restore only after an explicit close in this mounted screen, never
        // during account changes, tab unmounts, or navigation to a session.
        if (!mounted.current || currentScreen.current !== null || window.location.href !== openingLocation.current) return
        const available = (element: HTMLElement | null) => element?.isConnected && !element.matches(':disabled, [aria-disabled="true"]') && element.getClientRects().length > 0
        const target = available(opener.current) ? opener.current : available(addButton.current) ? addButton.current : heading.current
        if (available(target)) target?.focus({ preventScroll: true })
      }}>
        <DialogHeader><DialogTitle ref={dialogTitle} tabIndex={-1}>{screen?.kind === 'create' ? en ? 'Follow an exercise' : 'Seguir ejercicio' : screen?.kind === 'edit' ? en ? 'Edit target' : 'Editar meta' : screen?.kind === 'remove' ? en ? 'Remove goal' : 'Quitar objetivo' : goal?.name ?? (en ? 'Goal' : 'Objetivo')}</DialogTitle><DialogDescription>{screen?.kind === 'remove' ? en ? 'Your sessions and exercise history will be preserved.' : 'Tus sesiones y el historial del ejercicio se conservan.' : en ? 'All your available history. Targets use results from a single recorded set.' : 'Todo tu historial disponible. Las metas usan resultados de una misma serie registrada.'}</DialogDescription></DialogHeader>
        {screen?.kind === 'create' || screen?.kind === 'edit' ? <GoalForm key={screen.kind === 'create' ? `create:${screen.exerciseId ?? ''}` : `edit:${screen.id}`} model={model} language={language} sessionVersion={sessionVersion} refresh={refresh} onPendingChange={pendingChanged} initialGoal={goal} initialExerciseId={screen.kind === 'create' ? screen.exerciseId : goal?.exerciseId} onSaved={() => setScreen(null)} /> : screen?.kind === 'remove' && goal ? <RemoveGoal goal={goal} model={model} language={language} sessionVersion={sessionVersion} refresh={refresh} onPendingChange={pendingChanged} onCancel={() => setScreen({ kind: 'detail', id: goal.id })} onRemoved={() => setScreen(null)} /> : goal ? <div className="mt-5 space-y-5">
          <p className="text-sm font-semibold text-violet-300">{formatGoalTarget(goal.target, language)}</p>
          {goal.achieved && <p className="text-sm text-emerald-300">{en ? 'Reached in your records' : 'Alcanzada en tus registros'}</p>}
          <GoalResults goal={goal} language={language} />
          <div className="flex flex-wrap gap-2"><button type="button" className={primary} onClick={() => setScreen({ kind: 'edit', id: goal.id })}>{en ? 'Edit target' : 'Editar meta'}</button><button type="button" className={secondary} onClick={() => setScreen({ kind: 'remove', id: goal.id })}>{en ? 'Remove goal' : 'Quitar objetivo'}</button></div>
          <div><h3 className="text-sm font-semibold">{en ? 'Recorded sets' : 'Series registradas'}</h3><ol className="mt-2 divide-y divide-border">{goal.points.map(point => <li key={point.sessionId} className="py-3"><PendingLink href={`/history/${point.sessionId}`} className="flex min-h-12 items-center justify-between gap-3 rounded-lg text-sm font-semibold text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"><span className="min-w-0 break-words">{point.sessionName}<span className="mt-1 block text-xs font-normal text-muted-foreground">{date(point.date)}</span></span><span aria-hidden="true">→</span></PendingLink><p className="mt-1 text-sm tabular-nums">{point.sets.map(set => formatGoalSet(set, goal.kind, language)).join(' · ')}</p></li>)}</ol></div>
        </div> : screen && <p role="status" className="mt-4 text-sm">{en ? 'This goal is no longer available. Close this dialog and choose another.' : 'Este objetivo ya no está disponible. Cierra este diálogo y elige otro.'}</p>}
      </DialogContent>
    </Dialog>
  </>
}

export function GoalResults({ goal, language }: { goal: PersonalExerciseGoal; language: 'es' | 'en' }) {
  const en = language === 'en'
  if (!goal.points.length) return <p className="mt-4 text-sm text-muted-foreground">{en ? 'No recorded sets yet. Log this exercise to begin.' : 'Aún no hay series registradas. Registra este ejercicio para empezar.'}</p>
  return <dl className="mt-4 grid grid-cols-3 gap-2">{[[en ? 'First' : 'Primero', goal.first], [en ? 'Latest' : 'Último', goal.latest], [en ? 'Best' : 'Mejor', goal.best]].map(([label, point]) => {
    const value = point as PersonalExerciseGoal['first']
    return <div key={String(label)} className="min-w-0"><dt className="text-xs text-muted-foreground">{String(label)}</dt><dd className="mt-1 break-words text-sm font-semibold tabular-nums">{value ? formatGoalSet(value.best, goal.kind, language) : '—'}</dd></div>
  })}</dl>
}

function useGoalAction(accountId: string, sessionVersion: number, language: 'es' | 'en', refresh: () => Promise<void>, onPendingChange: (value: boolean) => void) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const mounted = useRef(true), pending = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const run = async (action: () => Promise<GoalActionResult>, success: () => void) => {
    if (pending.current) return
    pending.current = true; onPendingChange(true); setBusy(true); setError('')
    let current = async () => false
    try {
      const store = await getAppStore()
      current = async () => mounted.current && store.sessionVersion() === sessionVersion && (await store.read())?.accountId === accountId && store.sessionVersion() === sessionVersion && mounted.current
      if (!await current()) return
      const result = await action()
      if (!await current()) return
      if (result.success) { await refresh(); if (await current()) success() }
      else setError(language === 'en' ? 'The change could not be saved. Check your goal or close and reopen it to load the latest version. Your entries are preserved.' : result.error)
    } catch { if (await current().catch(() => false)) setError(language === 'en' ? 'The change could not be saved. Your entries are preserved.' : 'No se pudo guardar el cambio. Conservamos los datos del formulario.') }
    finally { pending.current = false; onPendingChange(false); if (await current().catch(() => false)) setBusy(false) }
  }
  return { busy, error, setError, run }
}

function GoalForm({ model, language, initialGoal, initialExerciseId, sessionVersion, refresh, onPendingChange, onSaved }: { model: ExerciseGoalsModel; language: 'es' | 'en'; initialGoal?: PersonalExerciseGoal; initialExerciseId?: string; sessionVersion: number; refresh(): Promise<void>; onPendingChange(value: boolean): void; onSaved(): void }) {
  const en = language === 'en'
  const [id] = useState(() => initialGoal?.id ?? crypto.randomUUID())
  const [expectedVersion] = useState(initialGoal?.version ?? null)
  const [exerciseId, setExerciseId] = useState(initialExerciseId ?? '')
  const [search, setSearch] = useState('')
  const [targetEnabled, setTargetEnabled] = useState(Boolean(initialGoal?.target))
  const [weight, setWeight] = useState(initialGoal?.target?.kind === 'strength' ? String(initialGoal.target.weightKg) : '')
  const [reps, setReps] = useState(initialGoal?.target?.kind === 'strength' ? String(initialGoal.target.reps) : '')
  const [seconds, setSeconds] = useState(initialGoal?.target?.kind === 'duration' ? String(initialGoal.target.seconds) : '')
  const { busy, error, setError, run } = useGoalAction(model.accountId, sessionVersion, language, refresh, onPendingChange)
  const chosen = model.catalog.find(item => item.id === exerciseId) ?? initialGoal
  const available = model.catalog.filter(item => !model.goals.some(goal => goal.exerciseId === item.id && goal.id !== initialGoal?.id))
  const filtered = available.filter(item => item.id === exerciseId || normalizeGoalSearch(`${item.name} ${item.muscleGroups.join(' ')}`).includes(normalizeGoalSearch(search)))
  const submit = () => {
    try {
      if (!chosen) throw new Error(en ? 'Choose an exercise.' : 'Elige un ejercicio.')
      const target = parseGoalTarget(targetEnabled, chosen.kind, weight, reps, seconds, language)
      void run(() => saveExerciseGoal({ accountId: model.accountId, id, exerciseId, expectedVersion, target }), onSaved)
    } catch (reason) { setError(reason instanceof Error ? reason.message : en ? 'Review the target.' : 'Revisa la meta.') }
  }
  const field = 'h-12 rounded-xl'
  return <form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); submit() }}>
    {!initialGoal && <><label className="block text-sm font-medium">{en ? 'Search exercises' : 'Buscar ejercicio'}<Input type="search" value={search} onChange={event => setSearch(event.target.value)} className={`mt-2 ${field}`} /></label><Select value={exerciseId} onValueChange={setExerciseId} disabled={busy}><SelectTrigger aria-label={en ? 'Exercise' : 'Ejercicio'} className={field}><SelectValue placeholder={en ? 'Choose an exercise' : 'Elige un ejercicio'} /></SelectTrigger><SelectContent>{filtered.map(item => <SelectItem key={item.id} value={item.id} className="min-h-12">{item.name}</SelectItem>)}</SelectContent></Select>{!filtered.length && <p role="status" className="text-sm text-muted-foreground">{en ? 'No matching exercises.' : 'No hay ejercicios que coincidan.'}</p>}</>}
    {initialGoal && <p className="font-semibold">{initialGoal.name}</p>}
    <Select value={targetEnabled ? 'target' : 'follow'} onValueChange={value => setTargetEnabled(value === 'target')} disabled={busy}><SelectTrigger aria-label={en ? 'Tracking mode' : 'Tipo de seguimiento'} className={field}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="follow" className="min-h-12">{en ? 'Follow without a target' : 'Seguir sin meta'}</SelectItem><SelectItem value="target" className="min-h-12">{en ? 'Set a numeric target' : 'Definir meta numérica'}</SelectItem></SelectContent></Select>
    {targetEnabled && chosen && (chosen.kind === 'duration' ? <label className="block text-sm font-medium">{en ? 'Seconds per set' : 'Segundos por serie'}<Input type="number" inputMode="numeric" min={1} max={MAX_SESSION_DURATION_SECONDS} step={1} value={seconds} onChange={event => setSeconds(event.target.value)} disabled={busy} className={`mt-2 ${field}`} /></label> : <div className="grid grid-cols-2 items-end gap-3"><label className="block text-sm font-medium">{en ? 'Weight (kg)' : 'Peso (kg)'}<Input type="text" inputMode="decimal" value={weight} onChange={event => setWeight(event.target.value)} disabled={busy} className={`mt-2 ${field}`} placeholder={`0–${MAX_SESSION_WEIGHT_KG}`} /></label><label className="block text-sm font-medium">{en ? 'Reps in the same set' : 'Repeticiones en la misma serie'}<Input type="number" inputMode="numeric" min={1} max={MAX_SESSION_REPS} step={1} value={reps} onChange={event => setReps(event.target.value)} disabled={busy} className={`mt-2 ${field}`} /></label></div>)}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <button type="submit" disabled={busy} className={`${primary} w-full`}>{busy ? en ? 'Saving…' : 'Guardando…' : en ? 'Save goal' : 'Guardar objetivo'}</button>
  </form>
}

function RemoveGoal({ goal, model, language, sessionVersion, refresh, onPendingChange, onRemoved, onCancel }: { goal: PersonalExerciseGoal; model: ExerciseGoalsModel; language: 'es' | 'en'; sessionVersion: number; refresh(): Promise<void>; onPendingChange(value: boolean): void; onRemoved(): void; onCancel(): void }) {
  const [expectedVersion] = useState(goal.version)
  const { busy, error, run } = useGoalAction(model.accountId, sessionVersion, language, refresh, onPendingChange), en = language === 'en'
  return <div className="mt-5 space-y-4"><p className="text-sm">{en ? `Stop following ${goal.name}?` : `¿Dejar de seguir ${goal.name}?`}</p>{error && <p role="alert" className="text-sm text-red-300">{error}</p>}<div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className={secondary} onClick={onCancel}>{en ? 'Cancel' : 'Cancelar'}</button><button type="button" disabled={busy} className={primary} onClick={() => void run(() => removeExerciseGoal({ accountId: model.accountId, id: goal.id, expectedVersion }), onRemoved)}>{busy ? en ? 'Removing…' : 'Quitando…' : en ? 'Remove goal' : 'Quitar objetivo'}</button></div></div>
}

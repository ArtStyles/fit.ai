import { useEffect, useRef, useState } from 'react'
import { Check, Timer, Pause, Flag, ChevronDown, Dumbbell } from 'lucide-react'
import { Haptics, NotificationType } from '@capacitor/haptics'
import type { MobileSession, MobileSet } from '../domain/types'
import { sessionVolume } from '../domain/training'

export function ExerciseImage({ src, name, eager = false }: { src: string | null; name: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false)
  return src && !failed ? <img className="exercise-image" src={src} alt={name} loading={eager ? 'eager' : 'lazy'} onError={() => setFailed(true)} /> : <div className="exercise-image image-fallback" role="img" aria-label={name}><Dumbbell size={36} /></div>
}

export function Workout({ session, save, onFinished, onUnsavedChange }: { session: MobileSession; save: (session: MobileSession, complete?: boolean) => Promise<void>; onFinished: () => void; onUnsavedChange: (unsaved: boolean) => void }) {
  const [draft, setDraft] = useState(session)
  const draftRef = useRef(session)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const revision = useRef(0)
  const [status, setStatus] = useState('Guardado en este dispositivo')
  const [error, setError] = useState('')
  const [finish, setFinish] = useState(false)
  const [busy, setBusy] = useState(false)
  const restKey = `vekira-rest:${session.accountId}:${session.id}`
  const [restUntil, setRestUntil] = useState(() => { try { return Number(localStorage.getItem(restKey)) || 0 } catch { return 0 } })
  const [now, setNow] = useState(Date.now())
  const rest = Math.max(0, Math.ceil((restUntil - now) / 1000))
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  useEffect(() => {
    if (restUntil && restUntil <= now) { setRestUntil(0); void Haptics.notification({ type: NotificationType.Success }).catch(() => {}) }
  }, [now, restUntil])
  useEffect(() => { try { localStorage.setItem(restKey, String(restUntil)) } catch { /* timer metadata is optional */ } }, [restKey, restUntil])
  function change(next: MobileSession) {
    draftRef.current = next; setDraft(next); setStatus('Guardando…'); setError(''); onUnsavedChange(true)
    const currentRevision = ++revision.current
    const write = queue.current.catch(() => {}).then(() => save(next))
    queue.current = write
    void write.then(() => { if (revision.current === currentRevision) { setStatus('Guardado en este dispositivo'); onUnsavedChange(false) } }).catch(e => { if (revision.current === currentRevision) { setStatus('Cambios sin guardar'); setError(e instanceof Error ? e.message : 'No se pudo guardar. Reintenta antes de salir.') } })
  }
  function updateSet(exerciseIndex: number, setIndex: number, patch: Partial<MobileSet>) {
    const next = structuredClone(draftRef.current)
    Object.assign(next.exercises[exerciseIndex].sets[setIndex], patch)
    change(next)
    if (patch.completed) { setNow(Date.now()); setRestUntil(Date.now() + next.exercises[exerciseIndex].prescription.restSeconds * 1000) }
  }
  async function complete() {
    if (busy) return
    setBusy(true); setError(''); onUnsavedChange(true)
    try {
      await queue.current.catch(() => {})
      const completed = { ...draftRef.current, finishedAt: new Date().toISOString() }
      await save(completed, true)
      try { localStorage.removeItem(restKey) } catch { /* optional timer cleanup */ }
      onUnsavedChange(false); onFinished()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo finalizar. Tu sesión permanece abierta.') }
    finally { setBusy(false) }
  }
  const total = draft.exercises.reduce((n, e) => n + e.sets.length, 0)
  const done = draft.exercises.reduce((n, e) => n + e.sets.filter(s => s.completed).length, 0)
  return <fieldset disabled={busy} className="stack workout"><div className="section-heading"><span className="eyebrow">TU SESIÓN EN CURSO</span><h1>{draft.workoutName}</h1><div className="row between"><span>{done} de {total} series</span><span className="muted">{Math.max(0, Math.floor((now - Date.parse(draft.startedAt)) / 60000))} min</span></div><progress value={done} max={total || 1} aria-label="Series completadas" /></div>
    <p className={`save-status ${error ? 'error' : ''}`} role="status">{status}</p>
    {error && <div className="error" role="alert">{error}<button className="secondary small" onClick={() => change(draftRef.current)}>Reintentar guardado</button></div>}
    {rest > 0 && <aside className="rest-timer"><Timer size={23} /><div><span>Descanso</span><strong>{Math.floor(rest / 60)}:{String(rest % 60).padStart(2, '0')}</strong></div><button className="secondary small" onClick={() => setRestUntil(t => t + 30000)}>+30 s</button><button className="icon-button" aria-label="Terminar descanso" onClick={() => setRestUntil(0)}><Pause size={21} /></button></aside>}
    {draft.exercises.map((exercise, ei) => <section className="card exercise-record" key={exercise.prescription.id}><div className="exercise-heading"><ExerciseImage src={exercise.prescription.imageUrl} name={exercise.prescription.name} /><div><span className="eyebrow">EJERCICIO {String(ei + 1).padStart(2, '0')}</span><h2>{exercise.prescription.name}</h2><p className="muted">{exercise.prescription.restSeconds} s de descanso{exercise.prescription.targetRpe ? ` · RPE ${exercise.prescription.targetRpe}` : ''}</p></div></div>
      <details className="instructions"><summary>Técnica y recomendaciones<ChevronDown size={16} /></summary><p>{exercise.prescription.instructions || 'Realiza un movimiento controlado y respeta tu rango de movimiento. Detente si aparece dolor.'}</p></details>
      <div className="set-grid set-labels" aria-hidden="true"><span>Serie</span><span>{exercise.prescription.durationSeconds !== null ? 'Segundos' : 'Reps'}</span><span>Kg</span><span>Lista</span></div>
      {exercise.sets.map((set, si) => <div className={`set-grid ${set.completed ? 'set-completed' : ''}`} key={set.id}><span className="set-number">{si + 1}</span><input aria-label={`${exercise.prescription.name}, serie ${si + 1}, ${exercise.prescription.durationSeconds !== null ? 'segundos' : 'repeticiones'}`} type="number" inputMode="numeric" min="0" max="86400" value={(exercise.prescription.durationSeconds !== null ? set.durationSeconds : set.reps) ?? ''} onChange={e => updateSet(ei, si, { [exercise.prescription.durationSeconds !== null ? 'durationSeconds' : 'reps']: e.target.value ? Math.max(0, Number(e.target.value)) : null })} /><input aria-label={`${exercise.prescription.name}, serie ${si + 1}, peso en kg`} type="number" inputMode="decimal" min="0" max="1000" step="0.5" value={set.weightKg ?? ''} placeholder="—" onChange={e => updateSet(ei, si, { weightKg: e.target.value ? Math.max(0, Number(e.target.value)) : null })} /><button className="set-check" aria-pressed={set.completed} aria-label={`${set.completed ? 'Desmarcar' : 'Completar'} serie ${si + 1}`} onClick={() => updateSet(ei, si, { completed: !set.completed })}><Check size={21} /></button></div>)}
    </section>)}
    {!finish ? <button className="primary full" disabled={!done || busy} onClick={() => setFinish(true)}><Flag size={20} />Finalizar entrenamiento</button> : <section className="card stack finish-panel"><h2>Un paso más para tu progreso</h2><p>{done} series completadas · {Math.round(sessionVolume(draft)).toLocaleString('es')} kg de volumen</p>{done < total && <p className="notice">Guardarás {done} de {total} series. Las series pendientes quedarán sin completar.</p>}<label>Esfuerzo percibido (RPE)<select value={draft.rpe ?? ''} onChange={e => change({ ...draftRef.current, rpe: e.target.value ? Number(e.target.value) : null })}><option value="">Sin valoración</option>{Array.from({ length: 10 }, (_, i) => <option key={i} value={i + 1}>{i + 1}{i === 0 ? ' · Muy suave' : i === 9 ? ' · Máximo esfuerzo' : ''}</option>)}</select></label><label>Cómo te sentiste<textarea maxLength={2000} value={draft.notes} onChange={e => change({ ...draftRef.current, notes: e.target.value })} placeholder="Sensaciones, ajustes, algo que recordar…" /></label><button className="primary full" disabled={busy} onClick={() => void complete()}>{busy ? 'Guardando entrenamiento…' : 'Guardar entrenamiento'}</button><button className="secondary full" disabled={busy} onClick={() => setFinish(false)}>Seguir entrenando</button></section>}
  </fieldset>
}

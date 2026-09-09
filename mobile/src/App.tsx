import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowRight, BookOpen, CalendarDays, Check, ChevronRight, Dumbbell, Home, Play, Plus, Settings as SettingsIcon, TrendingUp, Users, WifiOff, X } from 'lucide-react'
import { App as NativeApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { openMobileRepository } from './data'
import { createMobileCloud } from './cloud'
import type { MobileCloud } from './cloud/types'
import type { MobileAccount, MobileData, MobileExercise, MobilePlan, MobileRepository, MobileSession, MobileWorkout } from './domain/types'
import { createPersonalPlan, createWorkoutSession, sessionVolume } from './domain/training'
import { exerciseCatalog } from './domain/catalog'
import { ProfileForm } from './ui/ProfileForm'
import { Workout, ExerciseImage } from './ui/Workout'
import { Settings } from './ui/Settings'
import { Trainers } from './ui/Trainers'

type Screen = 'home' | 'plans' | 'workout' | 'history' | 'catalog' | 'trainers' | 'settings' | 'profile'
const emptyData: MobileData = { plans: [], sessions: [], measurements: [], activePlanId: null }
const nav = [{ id: 'home', label: 'Inicio', icon: Home }, { id: 'plans', label: 'Rutinas', icon: Dumbbell }, { id: 'history', label: 'Historial', icon: TrendingUp }, { id: 'catalog', label: 'Ejercicios', icon: BookOpen }, { id: 'settings', label: 'Ajustes', icon: SettingsIcon }] as const
const date = (value: string) => new Date(value).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
let repositoryPromise: Promise<MobileRepository> | null = null

export default function App() {
  const [repository, setRepository] = useState<MobileRepository | null>(null)
  const [cloud, setCloud] = useState<MobileCloud | null>(null)
  const [account, setAccount] = useState<MobileAccount | null>(null)
  const accountRef = useRef<MobileAccount | null>(null)
  const [accounts, setAccounts] = useState<MobileAccount[]>([])
  const [data, setData] = useState<MobileData>(emptyData)
  const [screen, setScreen] = useState<Screen>('home')
  const [newProfile, setNewProfile] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [unsavedWorkout, setUnsavedWorkout] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(0)
  const [syncStatus, setSyncStatus] = useState('')
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [selectedExercise, setSelectedExercise] = useState<MobileExercise | null>(null)
  const [search, setSearch] = useState('')
  const [historySession, setHistorySession] = useState<string | null>(null)
  const syncRunning = useRef(false)
  const syncBlocked = useRef(false)

  const refresh = useCallback(async () => {
    if (!repository) return
    const owner = accountRef.current
    const list = await repository.listAccounts(); setAccounts(list)
    if (!owner) return
    const [next, operations] = await Promise.all([repository.loadData(owner.id), repository.pending(owner.id)])
    if (accountRef.current?.id !== owner.id) return
    setData(next); setPending(operations.length)
    const updated = list.find(a => a.id === owner.id)
    if (updated) { accountRef.current = updated; setAccount(updated) }
  }, [repository])

  const synchronize = useCallback(async () => {
    const current = accountRef.current
    if (!cloud || !current?.remoteUserId || !navigator.onLine || !cloud.configured || syncRunning.current || syncBlocked.current) return
    syncRunning.current = true; setSyncStatus('Sincronizando respaldo móvil…')
    try { const result = await cloud.sync(current.id); if (accountRef.current?.id === current.id) { setSyncStatus(result.pending ? `${result.pending} cambios pendientes. Se conservan en el dispositivo.` : `Respaldo móvil actualizado · ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`); await refresh() } }
    catch (e) {
      if (accountRef.current?.id === current.id) {
        // Pulls may have succeeded even when an upload capability is unavailable.
        // Keep that downloaded data visible without hiding the original sync error.
        const message = e instanceof Error ? e.message : 'No se pudo sincronizar. Tus datos siguen guardados aquí.'
        try { await refresh() } catch { /* Preserve the actionable synchronization error. */ }
        if (accountRef.current?.id === current.id) setSyncStatus(message)
      }
    }
    finally { syncRunning.current = false }
  }, [cloud, refresh])

  useEffect(() => {
    let alive = true
    let adapter: MobileCloud | null = null
    repositoryPromise ??= openMobileRepository()
    void repositoryPromise.then(async repo => {
      const [list, activeId] = await Promise.all([repo.listAccounts(), repo.getActiveAccountId()])
      const owner = list.find(a => a.id === activeId) ?? null
      const local = owner ? await repo.loadData(owner.id) : emptyData
      if (!alive) return
      adapter = createMobileCloud(repo)
      setRepository(repo); setCloud(adapter); setAccounts(list); setAccount(owner); accountRef.current = owner; setData(local); setLoading(false)
    }).catch(e => { if (alive) { setError(e instanceof Error ? e.message : 'No se pudo abrir el almacenamiento.'); setLoading(false) } })
    return () => { alive = false; adapter?.dispose() }
  }, [])
  useEffect(() => { const update = () => { setOnline(navigator.onLine); if (navigator.onLine) void synchronize() }; window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) } }, [synchronize])
  useEffect(() => { if (account) { void refresh(); void synchronize() } }, [account?.id, refresh, synchronize]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const back = NativeApp.addListener('backButton', () => { if (unsavedWorkout) return; if (selectedExercise) setSelectedExercise(null); else if (historySession) setHistorySession(null); else if (newProfile) { setNewProfile(false); setScreen('settings') } else if (screen !== 'home') setScreen('home'); else void NativeApp.minimizeApp() })
    const resume = NativeApp.addListener('appStateChange', ({ isActive }) => { if (isActive) void synchronize() })
    return () => { void back.then(h => h.remove()); void resume.then(h => h.remove()) }
  }, [screen, selectedExercise, historySession, synchronize, unsavedWorkout, newProfile])
  useEffect(() => { window.scrollTo({ top: 0 }); setSelectedExercise(null); setHistorySession(null) }, [screen])
  useEffect(() => { if (historySession) document.getElementById('session-details')?.scrollIntoView({ block: 'start' }) }, [historySession])
  useEffect(() => {
    if (!selectedExercise) return
    const previous = document.activeElement as HTMLElement | null
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); setSelectedExercise(null) }
      if (event.key === 'Tab') {
        const controls = document.querySelectorAll<HTMLElement>('.exercise-dialog button, .exercise-dialog [tabindex="0"]')
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus() }
  }, [selectedExercise])

  async function activate(next: MobileAccount) {
    if (!repository) return
    syncBlocked.current = true
    try {
      const [nextData, nextPending] = await Promise.all([repository.loadData(next.id), repository.pending(next.id)])
      await repository.setActiveAccountId(next.id)
      accountRef.current = next; setAccount(next); setData(nextData); setPending(nextPending.length); setAccounts(await repository.listAccounts()); setSelectedPlan(null); setSyncStatus(''); setNewProfile(false); setScreen('home'); setError('')
    } finally { syncBlocked.current = false }
  }
  async function run(action: () => Promise<void>) { if (busy) return; setBusy(true); setError(''); try { await action() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar. Vuelve a intentarlo.') } finally { setBusy(false) } }
  async function generate() {
    if (!account || !repository) return
    await run(async () => { const plan = createPersonalPlan(account, data.plans.find(p => p.source === 'personal')); await repository.savePlan(plan); await repository.setActivePlan(account.id, plan.id); await refresh(); setSelectedPlan(plan.id); setScreen('plans'); setNotice('Tu rutina está lista y disponible sin conexión.'); void synchronize() })
  }
  async function start(plan: MobilePlan, workout: MobileWorkout) {
    if (!account || !repository) return
    const unfinished = data.sessions.find(s => !s.finishedAt)
    if (unfinished) { setScreen('workout'); setNotice('Continúa tu sesión abierta antes de comenzar otra.'); return }
    await run(async () => { const session = createWorkoutSession(account.id, plan, workout); await repository.saveSession(session, false); await refresh(); setScreen('workout'); setNotice('') })
  }
  async function saveSession(session: MobileSession, complete = false) {
    if (!repository || session.accountId !== accountRef.current?.id) throw new Error('El perfil cambió. Vuelve a abrir tu sesión desde su perfil.')
    await repository.saveSession(session, complete)
    if (session.accountId === accountRef.current?.id) setData(d => ({ ...d, sessions: [session, ...d.sessions.filter(s => s.id !== session.id)] }))
    if (complete) { await refresh(); void synchronize() }
  }
  const completed = useMemo(() => data.sessions.filter(s => s.finishedAt).sort((a, b) => b.finishedAt!.localeCompare(a.finishedAt!)), [data.sessions])
  const active = data.sessions.find(s => !s.finishedAt)
  const plan = data.plans.find(p => p.id === (selectedPlan ?? data.activePlanId)) ?? data.plans[0]
  const activePlan = data.plans.find(p => p.id === data.activePlanId) ?? data.plans[0]
  const measurements = data.measurements.filter(m => !m.deletedAt).sort((a, b) => b.date.localeCompare(a.date))
  const totalVolume = completed.reduce((n, s) => n + sessionVolume(s), 0)
  const recent = completed.slice(0, 7).reverse()
  const maxVolume = Math.max(1, ...recent.map(sessionVolume))
  const filteredExercises = exerciseCatalog.filter(e => `${e.name} ${e.muscleGroups.join(' ')} ${e.equipment.join(' ')}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')))
  const detail = completed.find(s => s.id === historySession)

  if (loading) return <div className="boot"><div className="brand-mark">V</div><h1>Vekira</h1><p>Abriendo tu espacio…</p></div>
  if (!repository || !cloud) return <div className="boot"><h1>No pudimos abrir tus datos</h1><p role="alert" className="error">{error}</p><button className="primary" onClick={() => location.reload()}>Volver a intentar</button></div>

  return <div className="app-shell"><header className="topbar"><button className="brand" disabled={unsavedWorkout} aria-label="Vekira, ir a Inicio" onClick={() => setScreen('home')}><span className="brand-mark">V</span>vekira<span className="brand-dot">.</span></button><div className="row"><span className="connection"><span className={`status-dot ${online ? '' : 'offline'}`} />{online ? 'En tu dispositivo' : 'Sin conexión'}</span>{account && <button className={`icon-button ${screen === 'trainers' ? 'selected' : ''}`} aria-label="Entrenadores" disabled={unsavedWorkout} onClick={() => setScreen('trainers')}><Users size={22} /></button>}</div></header>
    <main id="main" className={`main-content ${!account || newProfile ? 'onboarding' : ''}`}>
      {!account && accounts.length > 0 && <section className="card stack saved-profiles"><h2>Retoma tu espacio</h2><p className="muted">Estos perfiles y sus registros siguen guardados en este dispositivo.</p>{accounts.map(saved => <button key={saved.id} className="secondary full" disabled={busy} onClick={() => void run(() => activate(saved))}>Abrir perfil de {saved.name}<ChevronRight size={18} /></button>)}{error && <p className="error" role="alert">{error}</p>}</section>}
      {!account || newProfile || screen === 'profile' ? <ProfileForm key={newProfile ? 'new' : account?.id ?? 'first'} account={screen === 'profile' && !newProfile ? account ?? undefined : undefined} onCancel={account ? () => { setNewProfile(false); setScreen('settings') } : undefined} onSave={async (name, profile) => { const now = new Date().toISOString(); const next = screen === 'profile' && account && !newProfile ? { ...account, name, profile, updatedAt: now } : { id: crypto.randomUUID(), remoteUserId: null, name, profile, createdAt: now, updatedAt: now }; await repository.saveAccount(next); await activate(next); setNotice('Perfil guardado en este dispositivo.'); void synchronize() }} /> : <>
        {error && <div className="error row between" role="alert"><span>{error}</span><button className="icon-button" aria-label="Cerrar error" onClick={() => setError('')}><X size={18} /></button></div>}
        {notice && <div className="success row between" role="status"><span>{notice}</span><button className="icon-button" aria-label="Cerrar aviso" onClick={() => setNotice('')}><X size={18} /></button></div>}
        {screen === 'home' && <div className="stack"><div className="section-heading"><span className="eyebrow">TU ESPACIO PERSONAL</span><h1>Vamos, {account.name.split(' ')[0]}<span className="violet">.</span></h1><p>Cada sesión cuenta. Hoy también.</p></div>
          <section className="hero-card"><div className="hero-orbit" aria-hidden="true"><Dumbbell /></div><span className="chip light">{active ? 'SESIÓN EN CURSO' : activePlan ? 'LISTO PARA ENTRENAR' : 'EMPIEZA A TU RITMO'}</span><h2>{active ? active.workoutName : activePlan ? activePlan.name : 'Tu próxima versión empieza aquí.'}</h2><p>{active ? 'Tus series están guardadas. Retoma donde lo dejaste.' : activePlan ? `${activePlan.workouts.length} sesiones · ${account.profile.sessionDurationMinutes} min por sesión` : 'Una rutina que se adapta a tu objetivo, experiencia y material.'}</p><button className="training-button" disabled={busy} onClick={() => active ? setScreen('workout') : activePlan ? setScreen('plans') : void generate()}>{active ? 'Continuar entrenamiento' : activePlan ? 'Ver mi rutina' : 'Crear mi primera rutina'}<ArrowRight size={20} /></button><div className="hero-caption"><Check size={15} />Disponible sin conexión</div></section>
          <div className="stat-grid"><div className="stat"><Activity size={18} /><strong>{completed.length}</strong><span>Sesiones</span></div><div className="stat"><Dumbbell size={18} /><strong>{Math.round(totalVolume / 1000 * 10) / 10}<small>t</small></strong><span>Volumen total</span></div><div className="stat"><CalendarDays size={18} /><strong>{account.profile.daysPerWeek}</strong><span>Días / semana</span></div></div>
          <div className="row between section-row"><h2>Hazlo tuyo</h2><span className="muted small-text">UN PASO CADA DÍA</span></div><div className="quick-grid"><button className="card quick-card" onClick={() => setScreen('catalog')}><BookOpen className="violet" /><strong>Conoce el movimiento</strong><span>{exerciseCatalog.length} ejercicios con técnica</span><ChevronRight size={18} /></button><button className="card quick-card" onClick={() => setScreen('trainers')}><Users className="violet" /><strong>Entrena acompañado</strong><span>Conecta con profesionales</span><ChevronRight size={18} /></button></div>
          {completed.length > 0 && <section className="card stack"><div className="row between"><h2>Tu última sesión</h2><button className="text-button" onClick={() => setScreen('history')}>Ver historial</button></div><strong>{completed[0].workoutName}</strong><p className="muted">{date(completed[0].finishedAt!)} · {completed[0].exercises.reduce((n, e) => n + e.sets.filter(s => s.completed).length, 0)} series</p></section>}
          {!online && <p className="muted row"><WifiOff size={17} />Tu entrenamiento personal funciona sin internet.</p>}
        </div>}
        {screen === 'plans' && <div className="stack"><div className="section-heading"><span className="eyebrow">CONSTANCIA CON DIRECCIÓN</span><h1>Mis rutinas</h1><p>Elige tu sesión. Tu progreso se guarda a tu ritmo.</p></div>{active && <button className="resume-card" onClick={() => setScreen('workout')}><Play size={20} /><span>Continuar entrenamiento<strong>{active.workoutName}</strong></span><ChevronRight /></button>}{data.plans.length > 0 && <label>Rutina<select value={plan?.id ?? ''} onChange={e => setSelectedPlan(e.target.value)}>{data.plans.map(p => <option key={p.id} value={p.id}>{p.name}{p.source === 'trainer' ? ' · Profesional' : ''}{p.id === data.activePlanId ? ' · Principal' : ''}</option>)}</select></label>}
          {plan ? <><section className="card stack"><div className="row between"><span className="chip">{plan.source === 'trainer' ? 'DEL PROFESIONAL' : 'PERSONAL'}</span>{plan.id === data.activePlanId && <span className="success-text small-text">✓ Principal</span>}</div><h2>{plan.name}</h2>{plan.notes && <details className="instructions"><summary>Sobre esta rutina<ChevronRight size={16} /></summary><p>{plan.notes}</p></details>}{plan.id !== data.activePlanId && <button className="secondary" disabled={busy} onClick={() => void run(async () => { await repository.setActivePlan(account.id, plan.id); await refresh() })}>Usar como principal</button>}{plan.source === 'trainer' && <p className="muted small-text">Copia descargada del profesional. Mantiene sus indicaciones originales.</p>}</section>{plan.workouts.map((w, i) => <section className="card stack" key={w.id}><div className="row"><div className="day-number">{String(i + 1).padStart(2, '0')}</div><div><h2>{w.name}</h2><p className="muted">{w.exercises.length} ejercicios · {w.exercises.reduce((n, e) => n + e.sets, 0)} series</p></div></div><div className="exercise-preview">{w.exercises.map(e => <div className="row" key={e.id}><ExerciseImage src={e.imageUrl} name={e.name} /><div><strong>{e.name}</strong><p className="muted small-text">{e.sets} × {e.reps ?? `${e.durationSeconds} s`}</p></div></div>)}</div><button className="primary full" disabled={busy} onClick={() => void start(plan, w)}><Play size={17} />Empezar entrenamiento</button></section>)}</> : <section className="card empty"><Dumbbell size={36} /><h2>Una rutina para tu momento</h2><p>Usaremos tu perfil y revisión de preparación para crearla.</p></section>}
          <button className="secondary full" disabled={busy} onClick={() => void generate()}><Plus size={18} />{busy ? 'Creando…' : data.plans.some(p => p.source === 'personal') ? 'Crear nueva rutina personal' : 'Crear mi primera rutina'}</button><button className="text-button" onClick={() => setScreen('profile')}>Revisar mi perfil antes de generar</button>
        </div>}
        {screen === 'workout' && (active ? <Workout onUnsavedChange={setUnsavedWorkout} key={active.id} session={active} save={saveSession} onFinished={() => { setNotice('Entrenamiento guardado'); setScreen('history') }} /> : <section className="card empty"><Check size={36} /><h1>No hay una sesión abierta</h1><button className="primary" onClick={() => setScreen('plans')}>Elegir entrenamiento</button></section>)}
        {screen === 'history' && <div className="stack"><div className="section-heading"><span className="eyebrow">MIRA LO QUE HAS LOGRADO</span><h1>Tu progreso</h1><p>{completed.length} {completed.length === 1 ? 'entrenamiento' : 'entrenamientos'}</p></div>{completed.length > 0 ? <><div className="stat-grid two"><div className="stat"><strong>{completed.length}</strong><span>Sesiones completadas</span></div><div className="stat"><strong>{Math.round(totalVolume).toLocaleString('es')}<small>kg</small></strong><span>Volumen acumulado</span></div></div><section className="card stack"><h2>Un esfuerzo que se acumula</h2><p className="muted small-text">Volumen por sesión · últimas {recent.length}</p><div className="bar-chart" role="img" aria-label={recent.map(s => `${date(s.finishedAt!)}: ${Math.round(sessionVolume(s))} kg`).join('; ')}>{recent.map(s => <div className="bar-column" key={s.id}><span>{Math.round(sessionVolume(s))}</span><div className="bar" style={{ height: `${Math.max(4, sessionVolume(s) / maxVolume * 100)}%` }} /><small>{new Date(s.finishedAt!).toLocaleDateString('es', { day: 'numeric', month: 'numeric' })}</small></div>)}</div></section><section className="stack"><h2>Historial de sesiones</h2>{completed.map(s => <button className="card history-row" key={s.id} onClick={() => setHistorySession(historySession === s.id ? null : s.id)}><span className="history-icon"><Check size={20} /></span><span><strong>{s.workoutName}</strong><small>{date(s.finishedAt!)} · {s.exercises.reduce((n, e) => n + e.sets.filter(x => x.completed).length, 0)} series</small></span><ChevronRight size={18} /></button>)}</section>{detail && <section id="session-details" className="card stack"><div className="row between"><h2>{detail.workoutName}</h2><button className="icon-button" aria-label="Cerrar detalle" onClick={() => setHistorySession(null)}><X size={18} /></button></div>{detail.exercises.map(e => <div key={e.prescription.id}><strong>{e.prescription.name}</strong><p className="muted">{e.sets.filter(s => s.completed).map(s => `${s.reps !== null ? `${s.reps} reps` : `${s.durationSeconds ?? 0} s`}${s.weightKg ? ` × ${s.weightKg} kg` : ''}`).join(' · ') || 'Sin series completadas'}</p></div>)}{detail.rpe && <p>Esfuerzo percibido: {detail.rpe}/10</p>}{detail.notes && <p>{detail.notes}</p>}</section>}</> : <section className="card empty"><TrendingUp size={38} /><h2>Tu historia empieza aquí</h2><p>Al terminar tu primera sesión verás tus registros y evolución.</p><button className="primary" onClick={() => setScreen('plans')}>Ir a mis rutinas</button></section>}
          <section className="card stack"><h2>Medidas corporales</h2><p className="muted">Un registro personal para observar tu evolución.</p><form className="stack" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const values = new FormData(form); void run(async () => { await repository.saveMeasurement({ id: crypto.randomUUID(), accountId: account.id, date: String(values.get('date')), weightKg: Number(values.get('weight')), waistCm: values.get('waist') ? Number(values.get('waist')) : null, notes: '', updatedAt: new Date().toISOString(), deletedAt: null }); await refresh(); form.reset(); setNotice('Medida guardada'); void synchronize() }) }}><div className="form-grid"><label>Peso (kg)<input name="weight" type="number" inputMode="decimal" step="0.1" required min="20" max="500" /></label><label>Cintura (cm)<input name="waist" type="number" inputMode="decimal" step="0.1" min="20" max="300" /></label></div><label>Fecha<input name="date" type="date" required defaultValue={new Date().toLocaleDateString('en-CA')} /></label><button className="secondary full" disabled={busy}><Plus size={17} />Guardar medida</button></form>{measurements.map(m => <div className="row between measurement" key={m.id}><span className="muted">{date(`${m.date.slice(0, 10)}T12:00:00`)}</span><strong>{m.weightKg} kg{m.waistCm ? ` · ${m.waistCm} cm` : ''}</strong></div>)}</section>
        </div>}
        {screen === 'catalog' && <div className="stack"><div className="section-heading"><span className="eyebrow">MUÉVETE CON CONFIANZA</span><h1>Biblioteca de ejercicios</h1><p>La técnica también se entrena. Disponible sin internet.</p></div><label className="search-label">Buscar ejercicio<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre, músculo o material…" /></label><p className="muted small-text">{filteredExercises.length} ejercicios</p><div className="catalog-grid">{filteredExercises.map(e => <button className="card catalog-card" key={e.id} onClick={() => setSelectedExercise(e)}><ExerciseImage src={e.imageUrl} name={e.name} /><div><span className="eyebrow">{e.muscleGroups.slice(0, 2).join(' · ')}</span><h2>{e.name}</h2><p>{e.equipment.join(' · ') || 'Sin material'}</p></div></button>)}</div>{!filteredExercises.length && <p className="empty">No hay ejercicios con esa búsqueda.</p>}</div>}
        {screen === 'settings' && <Settings openMeasurements={() => setScreen('history')} notify={setNotice} key={account.id} account={account} accounts={accounts} repository={repository} cloud={cloud} online={online} pending={pending} syncStatus={syncStatus} sync={synchronize} activate={activate} refresh={refresh} editProfile={() => setScreen('profile')} newProfile={() => { setNewProfile(true); setScreen('profile') }} />}
        {screen === 'trainers' && <Trainers syncStatus={syncStatus} key={account.id} cloud={cloud} linked={!!account.remoteUserId} online={online} plans={data.plans.filter(p => p.source === 'trainer')} openPlan={id => { setSelectedPlan(id); setScreen('plans') }} synchronize={synchronize} />}
      </>}
    </main>
    {account && !newProfile && <nav className="bottom-nav" aria-label="Navegación principal">{nav.map(item => <button key={item.id} disabled={unsavedWorkout} className={screen === item.id ? 'active' : ''} aria-current={screen === item.id ? 'page' : undefined} onClick={() => setScreen(item.id)}><item.icon size={22} /><span>{item.label}</span></button>)}</nav>}
    {selectedExercise && <div className="modal-backdrop" onClick={() => setSelectedExercise(null)}><section className="exercise-dialog card stack" role="dialog" aria-modal="true" aria-labelledby="exercise-title" onClick={e => e.stopPropagation()}><button autoFocus className="icon-button modal-close" aria-label="Cerrar ejercicio" onClick={() => setSelectedExercise(null)}><X /></button><ExerciseImage eager src={selectedExercise.imageUrl} name={selectedExercise.name} /><h2 id="exercise-title">{selectedExercise.name}</h2><p className="violet">{selectedExercise.muscleGroups.join(' · ')}</p><p className="instruction-text">{selectedExercise.instructions}</p><p className="muted">{selectedExercise.equipment.join(' · ') || 'Sin material'}</p><button className="secondary full" onClick={() => setSelectedExercise(null)}>Volver a ejercicios</button></section></div>}
  </div>
}

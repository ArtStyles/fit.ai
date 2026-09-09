import { useEffect, useState, type FormEvent } from 'react'
import { WifiOff, RefreshCw, Users } from 'lucide-react'
import type { MobileCloud, TrainerCard, CoachingOverview } from '../cloud/types'
import type { MobilePlan } from '../domain/types'

const statuses: Record<string, string> = { pending: 'Pendiente', accepted: 'Aceptada', declined: 'No aceptada', rejected: 'No aceptada', cancelled: 'Cancelada', active: 'Activo', ended: 'Finalizado', assigned: 'Asignado', available: 'Disponible', superseded: 'Versión anterior', frozen: 'Guardado' }

export function Trainers({ cloud, linked, online, plans, openPlan, synchronize, syncStatus }: { cloud: MobileCloud; linked: boolean; online: boolean; plans: MobilePlan[]; openPlan: (id: string) => void; synchronize: () => Promise<void>; syncStatus: string }) {
  const [trainers, setTrainers] = useState<TrainerCard[]>([])
  const [coaching, setCoaching] = useState<CoachingOverview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [consent, setConsent] = useState(false)
  const [success, setSuccess] = useState('')
  async function load() {
    if (!linked || !online || !cloud.configured) return
    setBusy(true); setError('')
    try { const [cards, overview] = await Promise.all([cloud.listTrainers(), cloud.listCoaching()]); setTrainers(cards); setCoaching(overview) }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo consultar a los entrenadores.') }
    finally { setBusy(false) }
  }
  useEffect(() => { void load() }, [cloud, linked, online]) // eslint-disable-line react-hooks/exhaustive-deps
  async function request(e: FormEvent) {
    e.preventDefault()
    if (!selected || !consent || busy) return
    setBusy(true); setError('')
    try { await cloud.requestTrainer(selected, message); setSelected(null); setMessage(''); setConsent(false); setSuccess('Solicitud enviada'); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'La solicitud no se pudo enviar.') }
    finally { setBusy(false) }
  }
  return <div className="stack"><div className="section-heading"><span className="eyebrow">ACOMPAÑAMIENTO</span><h1>Entrena con un profesional</h1><p>Conecta para solicitar orientación. Las rutinas descargadas te acompañan sin conexión.</p></div>
    {linked && syncStatus && <p className="notice" role="status">{syncStatus}</p>}
    {plans.length > 0 && <section className="card stack"><h2>Rutinas descargadas</h2>{plans.map(p => <div className="row between" key={p.id}><div><strong>{p.name}</strong><p className="muted small-text">{p.workouts.length} sesiones · disponible sin conexión</p></div><button className="secondary small" onClick={() => openPlan(p.id)}>Ver rutina</button></div>)}</section>}
    {!online && <div className="notice row"><WifiOff size={20} /><span>Sin conexión. Puedes entrenar con tus rutinas descargadas.</span></div>}
    {!linked ? <section className="card empty"><Users size={34} /><h2>Tu próximo paso, acompañado</h2><p>Conecta tu cuenta desde Ajustes para consultar profesionales y enviar solicitudes.</p></section> : !cloud.configured ? <p className="notice">La conexión con entrenadores no está configurada en esta versión.</p> : <>
      <button className="secondary" disabled={busy || !online} onClick={() => void load()}><RefreshCw size={17} />{busy ? 'Consultando…' : 'Actualizar entrenadores'}</button>
      {error && <p className="error" role="alert">{error}</p>}{success && <p className="success" role="status">{success}</p>}
      {coaching && (coaching.relationships.length > 0 || coaching.requests.length > 0 || coaching.assignments.length > 0) && <section className="card stack"><h2>Mi acompañamiento</h2>{coaching.relationships.map(r => <div className="row between" key={r.id}><strong>{r.trainerName}</strong><span className="chip">{statuses[r.status] ?? r.status}</span></div>)}{coaching.requests.map(r => <div key={r.id} className="inset"><strong>Solicitud · {statuses[r.status] ?? r.status}</strong><p className="muted">{r.message || 'Sin mensaje'}</p></div>)}{coaching.assignments.map(a => <div className="row between" key={a.id}><div><strong>{a.name}</strong><p className="muted">{statuses[a.status] ?? a.status}</p></div><button className="secondary small" disabled={busy || !online} onClick={() => void synchronize().catch(e => setError(String(e)))}>Descargar</button></div>)}</section>}
      {trainers.map(t => <article className="card stack" key={t.id}><div className="row"><div className="avatar">{t.name.slice(0, 1)}</div><div><h2>{t.name}</h2><p className="muted">{t.specialties.join(' · ')}</p></div></div><p>{t.bio}</p>{t.services.map(s => <div className="inset stack compact" key={s.id}><h3>{s.name}</h3><p className="muted">{s.description}</p><p className="small-text">{s.durationMinutes} min · {s.modality}</p><button className="secondary" disabled={!online || busy} onClick={() => { setSelected(s.id); setConsent(false); setSuccess('') }}>Solicitar acompañamiento</button>{selected === s.id && <form className="stack" onSubmit={request}><label>Mensaje al profesional<textarea maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} placeholder="Cuéntale tu objetivo y disponibilidad" /></label><label className="check"><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} />Acepto compartir los datos de mi perfil de entrenamiento con este profesional si acepta mi solicitud. Esto no incluye mis medidas corporales.</label><button className="primary full" disabled={busy || !consent}>{busy ? 'Enviando…' : 'Enviar solicitud'}</button><button type="button" className="secondary" onClick={() => setSelected(null)}>Cancelar</button></form>}</div>)}</article>)}
      {!busy && !error && online && trainers.length === 0 && <p className="muted">No hay profesionales disponibles en este momento.</p>}
    </>}
  </div>
}

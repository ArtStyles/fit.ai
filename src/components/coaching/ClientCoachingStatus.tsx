'use client'

import { useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cancelCoachingRequest } from '@/app/actions/coachingRequests'
import type { CoachingRequestStatus } from '@/lib/coaching/relationships'
import { CoachingActionAnnouncement } from './CoachingRequestForm'
import { useI18n } from '@/components/i18n/I18nProvider'
import { dateLocale, type AppLanguage } from '@/lib/i18n'

const statusLabels: Record<CoachingRequestStatus, string> = { pending: 'Pendiente', accepted: 'Aceptada', declined: 'No aceptada', cancelled: 'Cancelada' }

export type ClientCoachingRequestView = {
  id: string
  status: CoachingRequestStatus
  createdAt: string
  trainerName: string
  trainerAvatarUrl: string | null
  serviceName: string
}
export type ClientCoachingRelationshipView = {
  id: string
  status: 'active' | 'paused_by_platform'
  startedAt: string
  sourceRequestId: string | null
  trainerName: string
  trainerAvatarUrl: string | null
  serviceName: string
}

type CancelRequestAction = typeof cancelCoachingRequest

export async function performCoachingRequestCancellation(
  requestId: string,
  action: CancelRequestAction,
  update: { setCancellingId: (id: string | null) => void; setMessage: (message: string, isError?: boolean) => void },
) {
  update.setCancellingId(requestId)
  const formData = new FormData()
  formData.set('requestId', requestId)
  try {
    const result = await action(formData)
    update.setMessage(result.ok ? 'La solicitud fue cancelada.' : 'No se pudo cancelar la solicitud.', !result.ok)
  } catch {
    update.setMessage('No se pudo cancelar la solicitud.', true)
  } finally {
    update.setCancellingId(null)
  }
}

function nextIdempotencyKey() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
}

function formatCoachingDate(value: string, language: AppLanguage, timeZone: string) {
  return new Intl.DateTimeFormat(dateLocale(language), { dateStyle: 'medium', timeZone }).format(new Date(value))
}

function TrainerIdentity({ name, avatarUrl, serviceName }: { name: string; avatarUrl: string | null; serviceName: string }) {
  return <div className="flex items-center gap-3">
    {avatarUrl ? <img src={avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" /> : <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">{name.slice(0, 1).toUpperCase()}</span>}
    <div className="min-w-0">
      <p className="break-words font-semibold text-foreground">{name}</p>
      <p className="break-words text-sm text-muted-foreground">{serviceName}</p>
    </div>
  </div>
}

export function ClientCoachingStatus({ requests, relationship, children }: { requests: ClientCoachingRequestView[]; relationship?: ClientCoachingRelationshipView; children?: ReactNode }) {
  const { language, timeZone } = useI18n()
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [message, setMessage] = useState({ text: '', isError: false })
  const [confirming, setConfirming] = useState<'end' | 'resume' | null>(null)
  const [relationshipBusy, setRelationshipBusy] = useState(false)
  const attemptKeys = useRef(new Map<'end' | 'resume', string>())

  async function cancel(requestId: string) {
    await performCoachingRequestCancellation(requestId, cancelCoachingRequest, {
      setCancellingId,
      setMessage: (text, isError = false) => setMessage({ text, isError }),
    })
  }

  async function manageRelationship(action: 'end' | 'resume') {
    if (!relationship) return
    setRelationshipBusy(true)
    try {
      const formData = new FormData()
      formData.set('relationshipId', relationship.id)
      const key = attemptKeys.current.get(action) ?? nextIdempotencyKey()
      attemptKeys.current.set(action, key)
      formData.set('idempotencyKey', key)
      const actions = await import('@/app/actions/coachingRelationships')
      const result = action === 'end'
        ? await actions.endCoachingRelationship(formData)
        : await actions.resumePausedCoachingRelationship(formData)
      setMessage({ text: result.ok ? action === 'end' ? 'El acompañamiento fue finalizado.' : 'El acompañamiento fue reanudado.' : result.error, isError: !result.ok })
      if (result.ok) {
        attemptKeys.current.delete(action)
        setConfirming(null)
      }
    } catch {
      setMessage({ text: 'No se pudo actualizar el acompañamiento.', isError: true })
    } finally {
      setRelationshipBusy(false)
    }
  }

  const pendingRequests = requests.filter(request => request.status === 'pending')
  const historyRequests = requests.filter(request => request.status !== 'pending')

  function renderRequest(request: ClientCoachingRequestView) {
    return <li key={request.id} className="rounded-xl border border-border/70 bg-card p-4">
      <TrainerIdentity name={request.trainerName} avatarUrl={request.trainerAvatarUrl} serviceName={request.serviceName} />
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-foreground">{statusLabels[request.status]}</p>
        <p className="text-xs text-muted-foreground">Enviada el {formatCoachingDate(request.createdAt, language, timeZone)}</p>
      </div>
      {request.status === 'accepted' && relationship?.sourceRequestId && request.id !== relationship.sourceRequestId ? <p className="mt-2 text-sm text-muted-foreground">Esta solicitud aceptada corresponde a un acompañamiento anterior.</p> : null}
      {request.status === 'pending' ? <button type="button" onClick={() => void cancel(request.id)} disabled={cancellingId === request.id} className="mt-3 min-h-11 rounded-xl border border-border/70 px-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">{cancellingId === request.id ? 'Cancelando…' : 'Cancelar solicitud'}</button> : null}
    </li>
  }

  const relationshipControls = relationship ? <>
    <p className="text-sm text-muted-foreground">Iniciado el {formatCoachingDate(relationship.startedAt, language, timeZone)}.</p>
    {relationship.status === 'paused_by_platform' ? <p className="mt-2 text-sm text-muted-foreground">Confirma si deseas reanudar el acompañamiento.</p> : null}
    <button type="button" onClick={() => setConfirming(relationship.status === 'active' ? 'end' : 'resume')} disabled={relationshipBusy}
      aria-controls="client-relationship-confirmation" aria-expanded={confirming !== null} className="mt-3 min-h-11 rounded-xl border border-border/70 px-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">{relationship.status === 'active' ? 'Finalizar acompañamiento' : 'Reanudar acompañamiento'}</button>
    {confirming ? <div id="client-relationship-confirmation" role="group" aria-describedby="client-relationship-confirmation-description" className="mt-3 rounded-xl border border-border/70 p-3">
      <p id="client-relationship-confirmation-description" className="text-sm text-muted-foreground">{confirming === 'end' ? 'Se revocará el acceso a tus datos de entrenamiento de inmediato.' : 'Se creará un nuevo consentimiento de datos de entrenamiento. Las medidas corporales seguirán sin compartirse hasta que las autorices.'}</p>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void manageRelationship(confirming)} disabled={relationshipBusy} className="min-h-11 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">{relationshipBusy ? 'Guardando…' : confirming === 'end' ? 'Confirmar finalización' : 'Confirmar reanudación'}</button><button type="button" onClick={() => setConfirming(null)} disabled={relationshipBusy} className="min-h-11 rounded-xl border border-border/70 px-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">Cancelar</button></div>
    </div> : null}
  </> : null

  return <section className="space-y-5">
    {relationship ? <article className="rounded-2xl border border-border/70 bg-card p-4" aria-labelledby="coaching-relationship-title">
      <div className="mb-4 space-y-2">
        <h2 id="coaching-relationship-title" className="text-sm font-semibold text-muted-foreground">Mi entrenador</h2>
        <p className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${relationship.status === 'active' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-800 dark:text-amber-200'}`}>{relationship.status === 'active' ? 'Acompañamiento activo' : 'Acompañamiento pausado'}</p>
      </div>
      <TrainerIdentity name={relationship.trainerName} avatarUrl={relationship.trainerAvatarUrl} serviceName={relationship.serviceName} />
      {relationship.status === 'active' ? <details className="group mt-4 border-t border-border/70">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg text-sm font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">Gestionar acompañamiento<ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" /></summary>
        <div className="pt-1">{relationshipControls}</div>
      </details> : <div className="mt-4 border-t border-border/70 pt-4">{relationshipControls}</div>}
    </article> : !requests.length ? <div className="rounded-2xl border border-border/70 p-4 text-sm text-muted-foreground">
      <p>Aún no tienes un entrenador conectado.</p>
      <a href="/trainers" className="mt-3 inline-flex min-h-11 items-center font-semibold text-violet-700 underline underline-offset-4 dark:text-violet-300">Buscar entrenadores</a>
    </div> : null}
    {children}
    {pendingRequests.length ? <section aria-labelledby="coaching-pending-title">
      <h2 id="coaching-pending-title" className="text-base font-bold text-foreground">Solicitudes pendientes</h2>
      <ul className="mt-3 space-y-3">{pendingRequests.map(renderRequest)}</ul>
    </section> : null}
    {historyRequests.length ? <details className="group rounded-2xl border border-border/70 bg-card">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden"><span>Historial de solicitudes <span className="ml-1 text-muted-foreground">({historyRequests.length})</span></span><ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" /></summary>
      <ul className="space-y-3 border-t border-border/70 p-3">{historyRequests.map(renderRequest)}</ul>
    </details> : null}
    <CoachingActionAnnouncement message={message.text} isError={message.isError} />
  </section>
}

'use client'

import { useRef, useState } from 'react'
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
    {avatarUrl ? <img src={avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" /> : <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">{name.slice(0, 1).toUpperCase()}</span>}
    <div className="min-w-0">
      <p className="font-semibold text-foreground">{name}</p>
      <p className="text-sm text-muted-foreground">{serviceName}</p>
    </div>
  </div>
}

export function ClientCoachingStatus({ requests, relationship }: { requests: ClientCoachingRequestView[]; relationship?: ClientCoachingRelationshipView }) {
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

  if (!requests.length && !relationship) return <section className="rounded-2xl border border-border/70 p-4 text-sm text-muted-foreground">
    <p>Aún no tienes un entrenador conectado.</p>
    <a href="/trainers" className="mt-3 inline-flex min-h-11 items-center font-semibold text-violet-700 underline underline-offset-4">Buscar entrenadores</a>
  </section>

  return <section className="space-y-5">
    {relationship ? <article className="rounded-2xl border border-border/70 p-4" aria-labelledby="coaching-relationship-title">
      <h2 id="coaching-relationship-title" className="mb-3 text-lg font-bold text-foreground">Mi entrenador</h2>
      <TrainerIdentity name={relationship.trainerName} avatarUrl={relationship.trainerAvatarUrl} serviceName={relationship.serviceName} />
      <h3 className="mt-4 font-semibold text-foreground">{relationship.status === 'active' ? 'Acompañamiento activo' : 'Acompañamiento pausado'}</h3>
      <p className="mt-1 text-sm text-muted-foreground">Iniciado el {formatCoachingDate(relationship.startedAt, language, timeZone)}.</p>
      <p className="mt-1 text-sm text-muted-foreground">{relationship.status === 'active' ? 'Puedes finalizar este acompañamiento en cualquier momento.' : 'Tu entrenador ya puede atenderte. Confirma si deseas reanudarlo.'}</p>
      <button type="button" onClick={() => setConfirming(relationship.status === 'active' ? 'end' : 'resume')} disabled={relationshipBusy}
        aria-controls="client-relationship-confirmation" aria-expanded={confirming !== null} className="mt-3 min-h-11 rounded-xl border border-border/70 px-3 text-sm font-semibold text-foreground disabled:opacity-50">{relationship.status === 'active' ? 'Finalizar acompañamiento' : 'Reanudar acompañamiento'}</button>
      {confirming ? <div id="client-relationship-confirmation" role="group" aria-describedby="client-relationship-confirmation-description" className="mt-3 rounded-xl border border-border/70 p-3">
        <p id="client-relationship-confirmation-description" className="text-sm text-muted-foreground">{confirming === 'end' ? 'Se revocará el acceso a tus datos de entrenamiento de inmediato.' : 'Se creará un nuevo consentimiento de datos de entrenamiento. Las medidas corporales seguirán sin compartirse hasta que las autorices.'}</p>
        <div className="mt-3 flex gap-2"><button type="button" onClick={() => void manageRelationship(confirming)} disabled={relationshipBusy} className="min-h-11 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{relationshipBusy ? 'Guardando…' : confirming === 'end' ? 'Confirmar finalización' : 'Confirmar reanudación'}</button><button type="button" onClick={() => setConfirming(null)} disabled={relationshipBusy} className="min-h-11 rounded-xl border border-border/70 px-3 text-sm font-semibold text-foreground disabled:opacity-50">Cancelar</button></div>
      </div> : null}
    </article> : null}
    <section aria-labelledby="coaching-requests-title">
      <h2 id="coaching-requests-title" className="text-lg font-bold text-foreground">Tus solicitudes</h2>
      <ul className="mt-3 space-y-3">{requests.map(request => <li key={request.id} className="rounded-2xl border border-border/70 p-4">
      <TrainerIdentity name={request.trainerName} avatarUrl={request.trainerAvatarUrl} serviceName={request.serviceName} />
      <p className="mt-3 font-semibold text-foreground">{statusLabels[request.status]}</p>
      <p className="mt-1 text-sm text-muted-foreground">Enviada el {formatCoachingDate(request.createdAt, language, timeZone)}</p>
      {request.status === 'accepted' && request.id !== relationship?.sourceRequestId ? <p className="mt-2 text-sm text-muted-foreground">Esta solicitud aceptada corresponde a un acompañamiento anterior.</p> : null}
      {request.status === 'pending' ? <button type="button" onClick={() => void cancel(request.id)} disabled={cancellingId === request.id} className="mt-3 min-h-11 rounded-xl border border-border/70 px-3 text-sm font-semibold text-foreground disabled:opacity-50">{cancellingId === request.id ? 'Cancelando…' : 'Cancelar solicitud'}</button> : null}
      </li>)}</ul>
    </section>
    <CoachingActionAnnouncement message={message.text} isError={message.isError} />
  </section>
}

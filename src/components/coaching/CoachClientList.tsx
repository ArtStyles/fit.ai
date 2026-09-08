'use client'

import Link from 'next/link'
import { AlertTriangle, UsersRound } from 'lucide-react'
import { useState } from 'react'
import type { CoachClientSummary } from '@/lib/coaching/insights'
import type { CoachManagedRelationship } from '@/lib/coaching/relationshipManagement'
import { CoachRelationshipActions } from './CoachRelationshipActions'
import { trackEvent } from '@/lib/analytics/events'

function evidenceDate(value: string | null, timeZone: string) {
  if (!value) return 'Aún no hay evidencia profesional registrada'
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeZone }).format(new Date(value))
}

function clientInitials(relationship: CoachManagedRelationship) {
  const identity = relationship.clientName?.trim() || relationship.username?.trim()
  return identity?.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase() ?? ''
}

export function CoachClientList({ relationships, clients, viewerTimeZone }: {
  relationships: readonly CoachManagedRelationship[]
  clients: readonly CoachClientSummary[] | null
  viewerTimeZone: string
}) {
  const [filter, setFilter] = useState<'all' | 'attention'>('all')
  const rows = relationships.map(relationship => ({
    relationship,
    evidence: relationship.trainingAccessAvailable
      ? clients?.find(client => client.relationshipId === relationship.relationshipId && client.clientId === relationship.clientId)
      : undefined,
  }))
  const attentionClients = rows.filter(row => row.evidence && row.evidence.alerts.length > 0)

  if (!relationships.length) return <section className="rounded-3xl border border-dashed border-border/70 bg-muted/10 p-8 text-center">
    <UsersRound className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
    <h1 className="mt-4 text-xl font-bold text-foreground">Todavía no tienes clientes</h1>
    <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Los acompañamientos activos y pausados aparecerán aquí.</p>
  </section>

  const visibleClients = filter === 'attention' ? attentionClients : rows

  function selectFilter(nextFilter: 'all' | 'attention') {
    if (nextFilter === filter) return
    setFilter(nextFilter)
    void trackEvent('coach_alert_filter_used', {
      alert_filter: nextFilter,
      matching_client_count: nextFilter === 'attention' ? attentionClients.length : relationships.length,
    })
  }

  return <section aria-labelledby="coach-client-list-title">
    <h1 id="coach-client-list-title" className="text-xl font-bold text-foreground">Tus clientes</h1>
    <div aria-label="Filtrar alertas" className="mt-4 flex flex-wrap gap-2">
      <button type="button" aria-pressed={filter === 'all'} onClick={() => selectFilter('all')} className="min-h-11 rounded-full border border-border/70 px-3 py-1.5 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">Todos ({relationships.length})</button>
      <button type="button" aria-pressed={filter === 'attention'} onClick={() => selectFilter('attention')} className="min-h-11 rounded-full border border-border/70 px-3 py-1.5 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">Con atención ({attentionClients.length})</button>
    </div>
    {clients === null ? <p role="status" className="mt-4 text-sm text-muted-foreground">No se pudo cargar el seguimiento. Puedes gestionar los acompañamientos e intentarlo de nuevo más tarde.</p> : null}
    {visibleClients.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-border/70 p-5 text-sm text-muted-foreground">No hay clientes con alertas operativas disponibles.</p> : <ul className="mt-4 space-y-3">{visibleClients.map(({ relationship, evidence }) => <li key={relationship.relationshipId} className="grid min-w-0 gap-4 break-words rounded-2xl md:grid-cols-[minmax(0,1fr)_19rem] border border-border/70 bg-muted/10 p-4">
      <div className="min-w-0">
      <div className="flex items-start gap-3">
        {relationship.avatarUrl ? <img src={relationship.avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" /> : clientInitials(relationship) ? <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">{clientInitials(relationship)}</span> : <UsersRound className="h-11 w-11 shrink-0 rounded-full bg-muted p-2 text-muted-foreground" aria-hidden="true" />}
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground">{relationship.clientName ?? 'Identidad no disponible'}</h2>
          {relationship.username ? <p className="text-sm text-muted-foreground">@{relationship.username}</p> : null}
          <p className="mt-1 text-sm text-muted-foreground">{relationship.serviceName}</p>
          <p className="mt-1 text-sm text-muted-foreground">{relationship.status === 'active' ? 'Acompañamiento activo' : 'Acompañamiento pausado'} · Desde {evidenceDate(relationship.startedAt, viewerTimeZone)}</p>
        </div>
      </div>
      {!relationship.trainingAccessAvailable ? <p className="mt-3 text-sm text-muted-foreground">Sin autorización para ver el progreso o asignar rutinas.{!relationship.trainingConsentActive ? ' El consentimiento de entrenamiento no está activo.' : ''}</p> : evidence ? <>
        <p className="mt-3 text-sm text-muted-foreground">Última evidencia profesional: {evidenceDate(evidence.lastProfessionalEvidenceAt, viewerTimeZone)}</p>
        <p className="mt-3 text-sm font-medium text-foreground">{evidence.adherence.completed} de {evidence.adherence.prescribed} sesiones prescritas ({evidence.adherence.adherencePercent}%)</p>
        {evidence.alerts.length > 0 ? <div className="mt-3 flex items-start gap-2 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div><span className="font-medium">Atención operativa: </span>{evidence.alerts.map(alert => alert.message).join(' ')}</div>
        </div> : null}
      </> : <p className="mt-3 text-sm text-muted-foreground">No se pudo cargar el seguimiento de este acompañamiento.</p>}
      </div>
      <div className="min-w-0 space-y-4 border-t border-border/70 pt-4 md:border-l md:border-t-0 md:pl-4 md:pt-0">
      {relationship.trainingAccessAvailable ? <div className="flex flex-wrap gap-2">
        <Link href={`/coach/clients/${relationship.clientId}`} className="inline-flex min-h-11 items-center rounded-xl border border-border/70 px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">Ver cliente</Link>
        <Link href={`/coach/programs?clientId=${encodeURIComponent(relationship.clientId)}`} className="inline-flex min-h-11 items-center rounded-xl border border-border/70 px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">Asignar rutina</Link>
      </div> : null}
      <div><CoachRelationshipActions relationshipId={relationship.relationshipId} status={relationship.status} clientName={relationship.clientName} serviceName={relationship.serviceName} /></div>
      </div>
    </li>)}</ul>}
  </section>
}

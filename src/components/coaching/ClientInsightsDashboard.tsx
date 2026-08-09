import Link from 'next/link'
import { AlertTriangle, CalendarDays, ClipboardList } from 'lucide-react'
import { ClientSessionEvidence } from './ClientSessionEvidence'
import type { CoachClientInsights } from '@/lib/coaching/insights'
import { CoachInsightsAnalytics } from './CoachInsightsAnalytics'

export function ClientInsightsDashboard({ detail, weeks }: { detail: CoachClientInsights; weeks: 4 | 12 }) {
  return <div className="space-y-6">
    <CoachInsightsAnalytics
      kind="client-insights"
      weeks={weeks}
      prescribedSessionCount={detail.adherence.prescribed}
      evidenceSessionCount={detail.sessions.length}
      measurementsShared={detail.activeScopes?.includes('body_measurements') ?? false}
    />
    <section aria-labelledby="client-insights-title" className="rounded-3xl border border-border/70 bg-muted/10 p-5">
      <h1 id="client-insights-title" className="text-2xl font-bold text-foreground">{detail.client.fullName ?? 'Cliente'}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Evidencia de entrenamiento compartida con consentimiento vigente. Vista de solo lectura.</p>
      <nav aria-label="Periodo de evidencia" className="mt-4 flex gap-2">
        {[4, 12].map(period => <Link key={period} href={`?weeks=${period}`} aria-current={weeks === period ? 'page' : undefined} className="rounded-full border border-border/70 px-3 py-1.5 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">{period} semanas</Link>)}
      </nav>
    </section>

    <section aria-labelledby="adherence-title" className="rounded-3xl border border-border/70 bg-muted/10 p-5">
      <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-violet-300" aria-hidden="true" /><h2 id="adherence-title" className="text-lg font-bold text-foreground">Calendario y tendencia prescrita</h2></div>
      <p className="mt-3 text-sm text-muted-foreground">{detail.adherence.completed} completadas · {detail.adherence.missed} missed · {detail.adherence.pending} pending · {detail.adherence.adherencePercent}% de adherencia cerrada</p>
      <p className="mt-2 text-sm text-muted-foreground">Las sesiones profesionales adicionales se muestran como evidencia, pero quedan fuera del cálculo de adherencia.</p>
      {detail.occurrences.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No hay sesiones prescritas en este periodo.</p> : <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {detail.occurrences.map(occurrence => <li key={occurrence.id} className="rounded-xl border border-border/60 p-3 text-sm"><p className="font-medium text-foreground">{occurrence.workoutName}</p><p className="mt-1 text-muted-foreground">{occurrence.scheduledDate} · <span className="font-medium">{occurrence.status}</span></p></li>)}
      </ul>}
    </section>

    {detail.alerts.length === 0 ? null : <section aria-labelledby="operational-alerts-title" className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-5"><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-300" aria-hidden="true" /><h2 id="operational-alerts-title" className="text-lg font-bold text-foreground">Alertas operativas</h2></div><ul className="mt-3 space-y-2 text-sm text-muted-foreground">{detail.alerts.map(alert => <li key={alert.code}>{alert.message}</li>)}</ul></section>}

    <section aria-labelledby="session-evidence-title">
      <div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-violet-300" aria-hidden="true" /><h2 id="session-evidence-title" className="text-lg font-bold text-foreground">Evidencia de sesiones</h2></div>
      <p className="mt-2 text-sm text-muted-foreground">Sets, carga, repeticiones, RPE, duración y notas se muestran sin edición histórica.</p>
      {detail.sessions.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-border/70 p-5 text-sm text-muted-foreground">No hay evidencia profesional en este periodo.</p> : <div className="mt-4 space-y-3">{detail.sessions.map(session => <ClientSessionEvidence key={session.id} session={session} timeZone={detail.client.timeZone} />)}</div>}
    </section>
  </div>
}

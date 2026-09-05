import { notFound } from 'next/navigation'
import { ClientInsightsDashboard } from '@/components/coaching/ClientInsightsDashboard'
import { ClientMeasurementsPanel } from '@/components/coaching/ClientMeasurementsPanel'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { getCoachClientInsights, getCoachClientMeasurements } from '@/lib/coaching/insights'
import { requireActiveTrainerContext } from '@/lib/coaching/access'
import { resolveUserTimeZone } from '@/lib/workouts/schedule'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

class CoachClientStateLoadError extends Error {
  constructor() {
    super('No se pudo cargar el estado del acompañamiento.')
    this.name = 'CoachClientStateLoadError'
  }
}

function selectedWeeks(value: string | string[] | undefined): 4 | 12 {
  const candidate = Array.isArray(value) ? value[0] : value
  return candidate === '12' ? 12 : 4
}

function utcDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export default async function CoachClientDetailPage({ params, searchParams }: {
  params: { clientId: string }
  searchParams?: { weeks?: string | string[] }
}) {
  if (!UUID.test(params.clientId)) notFound()
  const weeks = selectedWeeks(searchParams?.weeks)
  const now = new Date()
  const range = {
    fromDate: utcDate(new Date(now.getTime() - (weeks * 7 + 2) * 24 * 60 * 60 * 1000)),
    toDate: utcDate(new Date(now.getTime() + 24 * 60 * 60 * 1000)),
  }
  try {
    const { profile, supabase, user } = await requireActiveTrainerContext()
    const viewerTimeZone = resolveUserTimeZone(profile.timezone)
    const detail = await getCoachClientInsights(supabase as any, {
      clientId: params.clientId, weeks, now, ...range,
    })
    const relationshipResponse = typeof (supabase as any).from === 'function'
      ? await ((supabase as any).from('coaching_relationships').select('id, status, started_at, trainer_service_offerings(name)').eq('trainer_user_id', user?.id).eq('client_user_id', params.clientId).eq('status', 'active').maybeSingle())
      : { data: null, error: null }
    if (relationshipResponse.error) throw new CoachClientStateLoadError()
    const relationship = relationshipResponse.data as any
    const assignmentResponse = relationship?.id
      ? await ((supabase as any).from('trainer_plan_assignments').select('id, status, created_at').eq('relationship_id', relationship.id).eq('trainer_user_id', user?.id).in('status', ['active', 'proposed']).order('created_at', { ascending: false }))
      : { data: null, error: null }
    if (assignmentResponse.error) throw new CoachClientStateLoadError()
    const assignments = (assignmentResponse.data ?? []) as Array<{ id: string; status: 'active' | 'proposed'; created_at: string }>
    const assignment = assignments.find(candidate => candidate.status === 'active')
      ?? assignments.find(candidate => candidate.status === 'proposed')
      ?? null
    const hasProposedAssignment = assignments.some(candidate => candidate.status === 'proposed')
    const assignmentStatus = assignment?.status === 'active'
      ? 'Rutina activa'
      : assignment?.status === 'proposed'
        ? 'Propuesta de rutina pendiente'
        : 'Sin rutina activa'
    const service = Array.isArray(relationship?.trainer_service_offerings) ? relationship.trainer_service_offerings[0] : relationship?.trainer_service_offerings
    let measurements = null
    if (detail.activeScopes.includes('body_measurements')) {
      try {
        measurements = await getCoachClientMeasurements(supabase as any, {
          clientId: params.clientId, fromDate: detail.rangeStart, toDate: detail.rangeEnd,
        })
      } catch {
        console.error('[coach-client-measurements] unavailable')
      }
    }
    return <div className="min-h-screen bg-background pb-28"><PageTopBar title="Detalle del cliente" subtitle="Evidencia compartida" backHref="/coach/clients" backLabel="Clientes" /><main className="mx-auto max-w-4xl px-4 py-8"><section className="mb-6 rounded-2xl border border-border/70 bg-muted/10 p-4" aria-label="Estado del acompañamiento"><p className="text-sm font-semibold text-foreground">{service?.name ?? 'Acompañamiento profesional'}</p><p className="mt-1 text-sm text-muted-foreground">{relationship?.status === 'active' ? 'Relación activa' : relationship?.status ? 'Relación no activa' : 'Estado de relación no disponible'} · {assignmentStatus}</p>{relationship?.status === 'active' && !hasProposedAssignment ? <a href={`/coach/programs?clientId=${params.clientId}`} className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white">{assignment?.status === 'active' ? 'Gestionar rutina' : 'Asignar rutina'}</a> : null}</section><ClientInsightsDashboard detail={detail} weeks={weeks} viewerTimeZone={viewerTimeZone} />{measurements === null ? null : <ClientMeasurementsPanel measurements={measurements} />}</main></div>
  } catch (error) {
    if (error instanceof CoachClientStateLoadError) throw error
    notFound()
  }
}

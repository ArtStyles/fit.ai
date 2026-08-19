import { notFound } from 'next/navigation'
import { ClientInsightsDashboard } from '@/components/coaching/ClientInsightsDashboard'
import { ClientMeasurementsPanel } from '@/components/coaching/ClientMeasurementsPanel'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { getCoachClientInsights, getCoachClientMeasurements } from '@/lib/coaching/insights'
import { requireActiveTrainerContext } from '@/lib/coaching/access'
import { resolveUserTimeZone } from '@/lib/workouts/schedule'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
    const { profile, supabase } = await requireActiveTrainerContext()
    const viewerTimeZone = resolveUserTimeZone(profile.timezone)
    const detail = await getCoachClientInsights(supabase as any, {
      clientId: params.clientId, weeks, now, ...range,
    })
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
    return <div className="min-h-screen bg-background pb-28"><PageTopBar title="Detalle del cliente" subtitle="Evidencia compartida" backHref="/coach/clients" backLabel="Clientes" /><main className="mx-auto max-w-4xl px-4 py-8"><ClientInsightsDashboard detail={detail} weeks={weeks} viewerTimeZone={viewerTimeZone} />{measurements === null ? null : <ClientMeasurementsPanel measurements={measurements} />}</main></div>
  } catch {
    notFound()
  }
}

import { getMeasurements } from '@/app/actions/measurements'
import { MeasurementsClient } from '@/components/measurements/MeasurementsClient'

export const metadata = { title: 'Medidas · Vekira' }

export default async function MedidasPage({
  searchParams,
}: {
  searchParams?: { from?: string | string[] }
}) {
  const fromSettings = searchParams?.from === 'settings'
  const measurements = await getMeasurements()
  return <MeasurementsClient initialMeasurements={measurements} fromSettings={fromSettings} />
}

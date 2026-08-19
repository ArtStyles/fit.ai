import { getMeasurements } from '@/app/actions/measurements'
import { MeasurementsClient } from '@/components/measurements/MeasurementsClient'

export const metadata = { title: 'Medidas · Vekira' }

export default async function MedidasPage({
  searchParams,
}: {
  searchParams?: { from?: string | string[] }
}) {
  const fromSettings = searchParams?.from === 'settings'
  const result = await getMeasurements()
  return (
    <MeasurementsClient
      initialMeasurements={result.measurements}
      initialLoadError={result.success ? null : result.error}
      fromSettings={fromSettings}
    />
  )
}

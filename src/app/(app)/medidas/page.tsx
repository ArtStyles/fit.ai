import { getMeasurements } from '@/app/actions/measurements'
import { MeasurementsClient } from '@/components/measurements/MeasurementsClient'

export const metadata = { title: 'Medidas · Vekira' }

export default async function MedidasPage() {
  const measurements = await getMeasurements()
  return <MeasurementsClient initialMeasurements={measurements} />
}

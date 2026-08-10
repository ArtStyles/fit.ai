import type { CoachClientMeasurement } from '@/lib/coaching/insights'

const fields: Array<{ key: Exclude<keyof CoachClientMeasurement, 'recordedOn'>; label: string; unit: string }> = [
  { key: 'weightKg', label: 'Peso', unit: 'kg' },
  { key: 'bodyFatPercentage', label: 'Grasa corporal', unit: '%' },
  { key: 'muscleMassKg', label: 'Masa muscular', unit: 'kg' },
  { key: 'chestCm', label: 'Pecho', unit: 'cm' },
  { key: 'waistCm', label: 'Cintura', unit: 'cm' },
  { key: 'hipsCm', label: 'Cadera', unit: 'cm' },
  { key: 'armsCm', label: 'Brazos', unit: 'cm' },
  { key: 'legsCm', label: 'Piernas', unit: 'cm' },
]

/** Read-only display of values explicitly shared through current consent. */
export function ClientMeasurementsPanel({ measurements }: { measurements: CoachClientMeasurement[] }) {
  const availableMeasurements = measurements.map(measurement => ({
    measurement,
    values: fields.flatMap(field => measurement[field.key] === null ? [] : [`${field.label}: ${measurement[field.key]} ${field.unit}`]),
  })).filter(item => item.values.length > 0)

  return <section aria-labelledby="client-measurements-title" className="rounded-3xl border border-border/70 bg-muted/10 p-5">
    <h2 id="client-measurements-title" className="text-lg font-bold text-foreground">Medidas corporales compartidas</h2>
    {availableMeasurements.length === 0
      ? <p aria-live="polite" className="mt-3 text-sm text-muted-foreground">No hay medidas corporales compartidas en este periodo.</p>
      : <ul className="mt-4 space-y-3">{availableMeasurements.map(({ measurement, values }) => <li key={measurement.recordedOn} className="rounded-xl border border-border/60 p-3 text-sm"><p className="font-medium text-foreground">{measurement.recordedOn}</p><p className="mt-1 text-muted-foreground">{values.join(' · ')}</p></li>)}</ul>}
  </section>
}

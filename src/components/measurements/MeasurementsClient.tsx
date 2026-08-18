'use client'

import { useState } from 'react'
import { BarChart3, Minus, Plus, Scale, TrendingDown, TrendingUp } from 'lucide-react'
import type { MeasurementRow } from '@/app/actions/measurements'
import { useI18n } from '@/components/i18n/I18nProvider'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { PendingLink } from '@/components/navigation/PendingLink'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { dateLocale } from '@/lib/i18n'
import { MeasurementForm } from './MeasurementForm'
import { MeasurementHistory } from './MeasurementHistory'
import { WeightChart } from './WeightChart'

type Props = {
  initialMeasurements: MeasurementRow[]
  fromSettings: boolean
}

function formatNumber(value: number | null, locale: string, suffix = ''): string {
  if (value === null) return '—'
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}${suffix}`
}

function difference(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null
  const result = Number((current - previous).toFixed(1))
  return result === 0 ? 0 : result
}

function SummaryCard({
  label,
  value,
  previous,
  suffix,
  locale,
}: {
  label: string
  value: number | null
  previous: number | null
  suffix: string
  locale: string
}) {
  const { t } = useI18n()
  const delta = difference(value, previous)

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-bold tabular-nums text-foreground">
        {formatNumber(value, locale, suffix)}
      </p>
      {delta === null ? null : delta === 0 ? (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Minus className="h-3 w-3" aria-hidden="true" /> {t('Sin cambio')}
        </p>
      ) : (
        <p className={`mt-1 flex items-center gap-1 text-[11px] font-medium ${delta < 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
          {delta < 0 ? <TrendingDown className="h-3 w-3" aria-hidden="true" /> : <TrendingUp className="h-3 w-3" aria-hidden="true" />}
          {delta > 0 ? '+' : ''}{formatNumber(delta, locale, suffix)} {t('vs. anterior')}
        </p>
      )}
    </div>
  )
}

export function MeasurementsClient({ initialMeasurements, fromSettings }: Props) {
  const { language, t } = useI18n()
  const locale = dateLocale(language)
  const [measurements, setMeasurements] = useState(initialMeasurements)
  const [formState, setFormState] = useState<{ open: boolean; editing?: MeasurementRow }>({ open: false })
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)
  const latest = measurements[0] ?? null
  const previous = measurements[1] ?? null

  function handleSaved(row: MeasurementRow) {
    const exists = measurements.some(measurement => measurement.id === row.id)
    setMeasurements(current => exists
      ? current.map(measurement => measurement.id === row.id ? row : measurement)
      : [row, ...current])
    setSaveFeedback(t(exists ? 'Medida actualizada.' : 'Medida guardada.'))
  }

  const latestDate = latest
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(latest.recorded_at))
    : ''

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageTopBar
        title={t('Medidas corporales')}
        subtitle={t('Peso, composición y perímetros')}
        backHref={fromSettings ? '/settings' : '/dashboard'}
        backLabel={t(fromSettings ? 'Ajustes' : 'Dashboard')}
        icon={<Scale className="h-5 w-5" aria-hidden="true" />}
        right={(
          <div className="flex items-center gap-1 sm:gap-2">
            <PendingLink
              href="/progress"
              showSpinner={false}
              aria-label={t('Ver progreso completo')}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-violet-300 transition hover:bg-muted/30 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              <BarChart3 className="h-5 w-5" aria-hidden="true" />
            </PendingLink>
            <button
              type="button"
              onClick={() => setFormState({ open: true })}
              aria-label={t('Registrar')}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('Registrar')}</span>
            </button>
          </div>
        )}
      />

      <main className="mx-auto max-w-lg space-y-8 px-4 py-8">
        {measurements.length === 0 ? (
          <section className="flex flex-col items-center rounded-3xl border border-dashed border-border/70 bg-muted/[0.06] px-6 py-14 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300">
              <Scale className="h-8 w-8" aria-hidden="true" />
            </span>
            <h2 className="mt-5 font-display text-xl font-bold text-foreground">{t('Sin medidas registradas')}</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              {t('Registra tu peso y medidas para ver tu evolución')}
            </p>
            <button
              type="button"
              onClick={() => setFormState({ open: true })}
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> {t('Primera medida')}
            </button>
          </section>
        ) : (
          <>
            <section aria-labelledby="measurement-summary-title">
              <h2 id="measurement-summary-title" className="text-xs font-bold uppercase tracking-[0.14em] text-violet-300">
                {t('Última medida · {date}', { date: latestDate })}
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <SummaryCard label={t('Peso')} value={latest?.weight_kg ?? null} previous={previous?.weight_kg ?? null} suffix=" kg" locale={locale} />
                <SummaryCard label={t('Grasa corporal')} value={latest?.body_fat_percentage ?? null} previous={previous?.body_fat_percentage ?? null} suffix="%" locale={locale} />
                <SummaryCard label={t('Masa muscular')} value={latest?.muscle_mass_kg ?? null} previous={previous?.muscle_mass_kg ?? null} suffix=" kg" locale={locale} />
                <SummaryCard label={t('Cintura')} value={latest?.waist_cm ?? null} previous={previous?.waist_cm ?? null} suffix=" cm" locale={locale} />
              </div>
            </section>

            {measurements.some(measurement => measurement.weight_kg !== null) ? (
              <section aria-labelledby="weight-chart-title">
                <h2 id="weight-chart-title" className="text-xs font-bold uppercase tracking-[0.14em] text-violet-300">
                  {t('Evolución del peso')}
                </h2>
                <div className="mt-3 rounded-2xl border border-border/60 bg-muted/10 p-4">
                  <WeightChart data={measurements} />
                </div>
              </section>
            ) : null}

            <section aria-labelledby="measurement-history-title">
              <h2 id="measurement-history-title" className="text-xs font-bold uppercase tracking-[0.14em] text-violet-300">
                {t('Historial')}
              </h2>
              <div className="mt-3">
                <MeasurementHistory rows={measurements} onRowsChange={setMeasurements} onEdit={row => setFormState({ open: true, editing: row })} />
              </div>
            </section>
          </>
        )}
      </main>

      <div aria-live="polite" aria-atomic="true" className="pointer-events-none fixed inset-x-4 bottom-24 z-40 flex justify-center">
        {saveFeedback ? (
          <p className="rounded-xl border border-emerald-500/30 bg-background/95 px-4 py-3 text-sm font-medium text-emerald-300 shadow-lg backdrop-blur">
            {saveFeedback}
          </p>
        ) : null}
      </div>

      <Dialog open={formState.open} onOpenChange={open => { if (!open) setFormState({ open: false }) }}>
        <DialogContent className="max-h-[90vh] max-w-lg gap-0 overflow-y-auto rounded-2xl border-border/60 bg-popover p-0">
          <DialogHeader className="border-b border-border/60 px-5 py-4">
            <DialogTitle className="text-base text-foreground">
              {t(formState.editing ? 'Editar medida' : 'Registrar medidas')}
            </DialogTitle>
          </DialogHeader>
          <MeasurementForm
            initial={formState.editing}
            onSaved={handleSaved}
            onClose={() => setFormState({ open: false })}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { ChevronDown, Pencil, Trash2 } from 'lucide-react'
import {
  deleteMeasurement,
  type MeasurementActionResult,
  type MeasurementRow,
} from '@/app/actions/measurements'
import { useI18n } from '@/components/i18n/I18nProvider'
import { dateLocale } from '@/lib/i18n'

type DeleteAction = (id: string) => Promise<MeasurementActionResult>

export async function deleteMeasurementInteraction(
  rows: MeasurementRow[],
  id: string,
  action: DeleteAction,
): Promise<{ rows: MeasurementRow[]; error: string | null }> {
  try {
    const result = await action(id)
    if (!result.success) return { rows, error: result.error }
    return { rows: rows.filter(row => row.id !== id), error: null }
  } catch {
    return { rows, error: 'No se pudo eliminar la medida.' }
  }
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}

function value(value: number | null, suffix: string, locale: string): string | null {
  return value === null ? null : `${formatNumber(value, locale)}${suffix}`
}

export function MeasurementHistory({
  rows,
  onRowsChange,
  onEdit,
}: {
  rows: MeasurementRow[]
  onRowsChange: (rows: MeasurementRow[]) => void
  onEdit: (row: MeasurementRow) => void
}) {
  const { language, t } = useI18n()
  const locale = dateLocale(language)
  const [showAll, setShowAll] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null)
  const visibleRows = showAll ? rows : rows.slice(0, 5)

  async function handleDelete(id: string) {
    if (!window.confirm(t('¿Eliminar esta medida?'))) return

    const snapshot = rows
    onRowsChange(rows.filter(row => row.id !== id))
    const result = await deleteMeasurementInteraction(snapshot, id, deleteMeasurement)
    onRowsChange(result.rows)
    setFeedback(result.error
      ? { message: t(result.error), error: true }
      : { message: t('Medida eliminada.'), error: false })
  }

  return (
    <>
      <ul className="space-y-3">
        {visibleRows.map((row, index) => {
          const date = formatDate(row.recorded_at, locale)
          const isExpanded = expanded === row.id
          const details = [
            row.chest_cm === null ? null : t('Pecho: {value}', { value: value(row.chest_cm, ' cm', locale)! }),
            row.hips_cm === null ? null : t('Cadera: {value}', { value: value(row.hips_cm, ' cm', locale)! }),
            row.arms_cm === null ? null : t('Brazos: {value}', { value: value(row.arms_cm, ' cm', locale)! }),
            row.legs_cm === null ? null : t('Piernas: {value}', { value: value(row.legs_cm, ' cm', locale)! }),
          ].filter((item): item is string => item !== null)
          const summary = [
            value(row.weight_kg, ' kg', locale),
            row.body_fat_percentage === null ? null : t('{value}% grasa', { value: formatNumber(row.body_fat_percentage, locale) }),
            row.waist_cm === null ? null : t('{value} cm cintura', { value: formatNumber(row.waist_cm, locale) }),
          ].filter((item): item is string => item !== null)
          const hasDisclosure = details.length > 0 || Boolean(row.notes)

          return (
            <li key={row.id} className="rounded-2xl border border-border/60 bg-muted/10 p-3.5">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => hasDisclosure && setExpanded(isExpanded ? null : row.id)}
                  aria-expanded={hasDisclosure ? isExpanded : undefined}
                  aria-label={t('Medida del {date}', { date })}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{date}</p>
                      {index === 0 ? (
                        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
                          {t('Última')}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {summary.join(' · ') || t('Sin datos principales')}
                    </p>
                  </div>
                  {hasDisclosure ? (
                    <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                  ) : null}
                </button>

                <button
                  type="button"
                  onClick={() => onEdit(row)}
                  aria-label={t('Editar medida del {date}', { date })}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(row.id)}
                  aria-label={t('Eliminar medida del {date}', { date })}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-red-300 transition hover:bg-red-500/10 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {isExpanded && hasDisclosure ? (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-border/50 pt-3">
                  {details.map(detail => (
                    <span key={detail} className="rounded-lg bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground">{detail}</span>
                  ))}
                  {row.notes ? <p className="w-full text-xs italic text-muted-foreground">“{row.notes}”</p> : null}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      {rows.length > 5 ? (
        <button
          type="button"
          onClick={() => setShowAll(value => !value)}
          className="mt-3 min-h-11 w-full rounded-xl border border-border/60 px-4 text-sm font-semibold text-muted-foreground transition hover:bg-muted/20 hover:text-foreground"
        >
          {showAll ? t('Ver menos') : t('Ver todas ({count})', { count: rows.length })}
        </button>
      ) : null}

      <div aria-live="polite" aria-atomic="true" className="mt-3 min-h-5">
        {feedback ? (
          <p className={`text-sm ${feedback.error ? 'text-red-300' : 'text-emerald-300'}`}>{feedback.message}</p>
        ) : null}
      </div>
    </>
  )
}

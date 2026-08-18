'use client'

import { useRef, useState } from 'react'
import {
  logMeasurement,
  updateMeasurement,
  type MeasurementActionResult,
  type LogMeasurementPayload,
  type MeasurementRow,
} from '@/app/actions/measurements'
import {
  MEASUREMENT_RANGES,
  type MeasurementField,
  type MeasurementFieldErrors,
} from '@/app/actions/measurements.logic'
import { useI18n } from '@/components/i18n/I18nProvider'

type Props = {
  initial?: MeasurementRow
  onSaved: (row: MeasurementRow) => void
  onClose: () => void
  onPendingChange?: (pending: boolean) => void
}

type Translate = (source: string, values?: Record<string, string | number>) => string
type NumericField = Exclude<MeasurementField, 'notes'>

export type MeasurementDraft = Record<NumericField, string> & { notes: string }

export type MeasurementSubmissionDecision =
  | { ok: true; id: string; fieldErrors: MeasurementFieldErrors }
  | { ok: false; error: string; fieldErrors: MeasurementFieldErrors }

const PRIMARY_FIELDS: Array<{ field: NumericField; label: string; unit: string; step: string }> = [
  { field: 'weight_kg', label: 'Peso', unit: 'kg', step: '0.1' },
  { field: 'body_fat_percentage', label: 'Grasa corporal', unit: '%', step: '0.1' },
  { field: 'waist_cm', label: 'Cintura', unit: 'cm', step: '0.5' },
  { field: 'muscle_mass_kg', label: 'Masa muscular', unit: 'kg', step: '0.1' },
]

const EXTRA_FIELDS: Array<{ field: NumericField; label: string; unit: string; step: string }> = [
  { field: 'chest_cm', label: 'Pecho', unit: 'cm', step: '0.5' },
  { field: 'hips_cm', label: 'Cadera', unit: 'cm', step: '0.5' },
  { field: 'arms_cm', label: 'Brazos', unit: 'cm', step: '0.5' },
  { field: 'legs_cm', label: 'Piernas', unit: 'cm', step: '0.5' },
]

export function shouldRevealExtraMeasurementFields(fieldErrors: MeasurementFieldErrors): boolean {
  return EXTRA_FIELDS.some(({ field }) => Boolean(fieldErrors[field]))
}

function draftValue(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

export function createMeasurementDraft(initial?: MeasurementRow): MeasurementDraft {
  return {
    weight_kg: draftValue(initial?.weight_kg),
    body_fat_percentage: draftValue(initial?.body_fat_percentage),
    muscle_mass_kg: draftValue(initial?.muscle_mass_kg),
    chest_cm: draftValue(initial?.chest_cm),
    waist_cm: draftValue(initial?.waist_cm),
    hips_cm: draftValue(initial?.hips_cm),
    arms_cm: draftValue(initial?.arms_cm),
    legs_cm: draftValue(initial?.legs_cm),
    notes: initial?.notes ?? '',
  }
}

function numericDraftValue(value: string): number | null {
  return value.trim() === '' ? null : Number(value)
}

export function measurementPayloadFromDraft(draft: MeasurementDraft): LogMeasurementPayload {
  return {
    weight_kg: numericDraftValue(draft.weight_kg),
    body_fat_percentage: numericDraftValue(draft.body_fat_percentage),
    muscle_mass_kg: numericDraftValue(draft.muscle_mass_kg),
    chest_cm: numericDraftValue(draft.chest_cm),
    waist_cm: numericDraftValue(draft.waist_cm),
    hips_cm: numericDraftValue(draft.hips_cm),
    arms_cm: numericDraftValue(draft.arms_cm),
    legs_cm: numericDraftValue(draft.legs_cm),
    notes: draft.notes.trim() || null,
  }
}

export async function submitMeasurementInteraction(
  action: () => Promise<MeasurementActionResult>,
  onPendingChange?: (pending: boolean) => void,
): Promise<MeasurementSubmissionDecision> {
  onPendingChange?.(true)
  try {
    const result = await action()
    if (!result.success) {
      return { ok: false, error: result.error, fieldErrors: result.fieldErrors ?? {} }
    }
    if (!result.id) {
      return { ok: false, error: 'No se pudo guardar la medida.', fieldErrors: {} }
    }
    return { ok: true, id: result.id, fieldErrors: {} }
  } catch {
    return { ok: false, error: 'No se pudo guardar la medida.', fieldErrors: {} }
  } finally {
    onPendingChange?.(false)
  }
}

function localizeMeasurementError(error: string, t: Translate): string {
  const range = /^Debe ser un número entre ([\d.]+) y ([\d.]+)\.$/.exec(error)
  return range
    ? t('Debe ser un número entre {minimum} y {maximum}.', { minimum: range[1]!, maximum: range[2]! })
    : t(error)
}

function NumericInput({
  field,
  label,
  unit,
  step,
  value,
  onChange,
  error,
  t,
}: {
  field: NumericField
  label: string
  unit: string
  step: string
  value: string
  onChange: (value: string) => void
  error?: string
  t: Translate
}) {
  const [minimum, maximum] = MEASUREMENT_RANGES[field]
  const helpId = `${field}-help`
  const errorId = `${field}-error`

  return (
    <div className="space-y-1.5">
      <label htmlFor={field} className="text-xs font-medium text-muted-foreground">
        {t(label)} <span>({unit})</span>
      </label>
      <input
        id={field}
        name={field}
        type="number"
        inputMode="decimal"
        step={step}
        min={minimum}
        max={maximum}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder="—"
        aria-describedby={`${helpId}${error ? ` ${errorId}` : ''}`}
        aria-invalid={error ? true : undefined}
        className="min-h-11 w-full rounded-xl border border-border/60 bg-muted/10 px-3 text-sm text-foreground outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-400/30"
      />
      <p id={helpId} className="text-[11px] text-muted-foreground">
        {t('Entre {minimum} y {maximum}.', { minimum, maximum })}
      </p>
      {error ? <p id={errorId} role="alert" className="text-xs text-red-300">{localizeMeasurementError(error, t)}</p> : null}
    </div>
  )
}

export function MeasurementForm({ initial, onSaved, onClose, onPendingChange }: Props) {
  const { t } = useI18n()
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<MeasurementFieldErrors>({})
  const [draft, setDraft] = useState<MeasurementDraft>(() => createMeasurementDraft(initial))
  const submitPending = useRef(false)
  const [showExtra, setShowExtra] = useState(
    Boolean(initial && (initial.chest_cm ?? initial.hips_cm ?? initial.arms_cm ?? initial.legs_cm)),
  )

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitPending.current) return
    setFormError(null)
    setFieldErrors({})

    const payload = measurementPayloadFromDraft(draft)
    const result = await submitMeasurementInteraction(() => initial
      ? updateMeasurement(initial.id, payload)
      : logMeasurement(payload), pending => {
      submitPending.current = pending
      setSaving(pending)
      onPendingChange?.(pending)
    })

    if (!result.ok) {
      setFormError(localizeMeasurementError(result.error, t))
      setFieldErrors(result.fieldErrors)
      if (shouldRevealExtraMeasurementFields(result.fieldErrors)) setShowExtra(true)
      return
    }

    onSaved({
      id: result.id,
      recorded_at: initial?.recorded_at ?? new Date().toISOString(),
      weight_kg: payload.weight_kg ?? null,
      body_fat_percentage: payload.body_fat_percentage ?? null,
      muscle_mass_kg: payload.muscle_mass_kg ?? null,
      chest_cm: payload.chest_cm ?? null,
      waist_cm: payload.waist_cm ?? null,
      hips_cm: payload.hips_cm ?? null,
      arms_cm: payload.arms_cm ?? null,
      legs_cm: payload.legs_cm ?? null,
      notes: payload.notes ?? null,
    })
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-5">
      {formError ? (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {formError}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PRIMARY_FIELDS.map(field => (
          <NumericInput
            key={field.field}
            {...field}
            value={draft[field.field]}
            onChange={value => setDraft(current => ({ ...current, [field.field]: value }))}
            error={fieldErrors[field.field]}
            t={t}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowExtra(value => !value)}
        aria-expanded={showExtra}
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border/60 px-3 text-sm font-semibold text-foreground transition hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      >
        {t(showExtra ? 'Menos campos' : 'Más perímetros')}
      </button>

      {showExtra ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {EXTRA_FIELDS.map(field => (
            <NumericInput
              key={field.field}
              {...field}
              value={draft[field.field]}
              onChange={value => setDraft(current => ({ ...current, [field.field]: value }))}
              error={fieldErrors[field.field]}
              t={t}
            />
          ))}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="notes" className="text-xs font-medium text-muted-foreground">{t('Notas')}</label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={500}
          placeholder={t('Notas opcionales…')}
          value={draft.notes}
          onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))}
          aria-describedby={fieldErrors.notes ? 'notes-help notes-error' : 'notes-help'}
          aria-invalid={fieldErrors.notes ? true : undefined}
          className="min-h-24 w-full resize-y rounded-xl border border-border/60 bg-muted/10 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-violet-400 focus:ring-2 focus:ring-violet-400/30"
        />
        <p id="notes-help" className="text-[11px] text-muted-foreground">{t('Máximo 500 caracteres.')}</p>
        {fieldErrors.notes ? (
          <p id="notes-error" role="alert" className="text-xs text-red-300">
            {localizeMeasurementError(fieldErrors.notes, t)}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="min-h-11 rounded-xl border border-border/60 px-4 text-sm font-semibold text-muted-foreground transition hover:bg-muted/20 hover:text-foreground disabled:opacity-50"
        >
          {t('Cancelar')}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? t('Guardando…') : t(initial ? 'Actualizar' : 'Guardar')}
        </button>
      </div>
    </form>
  )
}

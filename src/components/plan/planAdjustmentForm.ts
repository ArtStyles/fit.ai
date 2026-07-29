import type { CardioModality, PlanAdjustmentIntent } from '@/lib/training-engine'
import { translate, type AppLanguage } from '@/lib/i18n'
import type { PlanAdjustmentPreviewSummary } from '@/lib/plans/adjustmentIntent'

export type PlanAdjustmentCategory =
  | 'days'
  | 'duration'
  | 'intensity'
  | 'equipment'
  | 'cardio'
  | 'exercise'

export type PlanAdjustmentDraft =
  | { category: 'days'; daysPerWeek: number }
  | { category: 'duration'; minutes: 30 | 45 | 60 | 90 }
  | { category: 'intensity'; direction: 'easier' | 'harder' }
  | { category: 'equipment'; equipment: readonly string[] }
  | { category: 'cardio'; cardioPreferences: readonly CardioModality[] }
  | { category: 'exercise'; exerciseId: string }

export function buildPlanAdjustmentIntent(
  draft: PlanAdjustmentDraft,
): PlanAdjustmentIntent | null {
  switch (draft.category) {
    case 'days':
      return { type: 'change_days', daysPerWeek: draft.daysPerWeek }
    case 'duration':
      return { type: 'change_duration', sessionDurationMinutes: draft.minutes }
    case 'intensity':
      return { type: 'change_intensity', direction: draft.direction }
    case 'equipment':
      return draft.equipment.length > 0
        ? { type: 'equipment_unavailable', equipment: [...draft.equipment] }
        : null
    case 'cardio':
      return draft.cardioPreferences.length > 0
        ? {
            type: 'change_cardio_preferences',
            cardioPreferences: [...draft.cardioPreferences],
          }
        : null
    case 'exercise':
      return draft.exerciseId
        ? { type: 'replace_exercise', exerciseId: draft.exerciseId }
        : null
  }
}

export function buildPlanAdjustmentSummary(
  preview: PlanAdjustmentPreviewSummary,
  language: AppLanguage,
): string[] {
  const t = (source: string, values?: Record<string, string | number>) =>
    translate(language, source, values)
  const summary: string[] = []

  if (preview.daysBefore !== preview.daysAfter) {
    summary.push(t('Días semanales: {before} → {after}', {
      before: preview.daysBefore,
      after: preview.daysAfter,
    }))
  }
  if (preview.exercisesAddedCount === 1) {
    summary.push(t('{count} ejercicio añadido', { count: 1 }))
  } else if (preview.exercisesAddedCount > 1) {
    summary.push(t('{count} ejercicios añadidos', { count: preview.exercisesAddedCount }))
  }
  if (preview.exercisesRemovedCount === 1) {
    summary.push(t('{count} ejercicio sustituido o retirado', { count: 1 }))
  } else if (preview.exercisesRemovedCount > 1) {
    summary.push(t('{count} ejercicios sustituidos o retirados', {
      count: preview.exercisesRemovedCount,
    }))
  }
  if (preview.changedPrescriptionCount === 1) {
    summary.push(t('{count} prescripción ajustada', { count: 1 }))
  } else if (preview.changedPrescriptionCount > 1) {
    summary.push(t('{count} prescripciones ajustadas', {
      count: preview.changedPrescriptionCount,
    }))
  }
  summary.push(...preview.warnings.map(warning => t(warning)))

  return summary.length > 0
    ? summary
    : [t('El plan fue recalculado y validado sin cambios estructurales importantes.')]
}

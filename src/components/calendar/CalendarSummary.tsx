'use client'

import { MetricStrip } from '@/components/evidence/MetricStrip'
import { useI18n } from '@/components/i18n/I18nProvider'

export function CalendarSummary({
  trainedDays,
  currentStreak,
  frequency,
}: {
  trainedDays: number
  currentStreak: number
  frequency: number
}) {
  const { t } = useI18n()

  return (
    <MetricStrip
      items={[
        { label: t('Días este mes'), value: trainedDays },
        { label: t('Racha actual'), value: `${currentStreak}d` },
        { label: t('Sesiones por semana'), value: frequency },
      ]}
    />
  )
}

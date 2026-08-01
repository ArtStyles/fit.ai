'use client'

import { CalendarRange } from 'lucide-react'
import { EvidenceHero } from '@/components/evidence/EvidenceHero'
import { PendingLink } from '@/components/navigation/PendingLink'
import { useI18n } from '@/components/i18n/I18nProvider'

export function EmptyCalendar() {
  const { t } = useI18n()

  return (
    <EvidenceHero
      eyebrow={t('Ritmo de entrenamiento')}
      title={t('Aún no hay constancia que mostrar')}
      description={t('Cuando completes entrenamientos verás aquí tu mapa de constancia mes a mes.')}
      action={(
        <PendingLink
          href="/dashboard"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
        >
          {t('Ir al dashboard')}
        </PendingLink>
      )}
    >
      <div className="flex items-center gap-3 border-t border-border/60 pt-4 text-sm text-muted-foreground">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
          <CalendarRange className="h-5 w-5" aria-hidden="true" />
        </span>
        <p>{t('Tu primera sesión completada iniciará esta línea de tiempo.')}</p>
      </div>
    </EvidenceHero>
  )
}

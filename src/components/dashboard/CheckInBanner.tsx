'use client'

import { ChevronRight, ClipboardCheck } from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'
import { useI18n } from '@/components/i18n/I18nProvider'

export function CheckInBanner() {
  const { t } = useI18n()
  return (
    <div className="relative overflow-hidden rounded-2xl border border-violet-500/30 bg-violet-500/[0.07] p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/15">
          <ClipboardCheck className="h-5 w-5 text-violet-300" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-foreground">{t('Toca revisar tu perfil')}</p>
          <p className="mt-1 text-base leading-relaxed text-muted-foreground">
            {t('Han pasado más de 4 semanas. Actualiza peso, objetivo y lesiones para que tu plan se ajuste a tu momento actual.')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <PendingLink href="/settings/datos" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-violet-300 hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
              {t('Datos personales')}<ChevronRight className="h-4 w-4" aria-hidden="true" />
            </PendingLink>
            <PendingLink href="/settings/entrenamiento" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-violet-300 hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
              {t('Objetivo y lesiones')}<ChevronRight className="h-4 w-4" aria-hidden="true" />
            </PendingLink>
          </div>
        </div>
      </div>
    </div>
  )
}

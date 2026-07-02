'use client'

import { ChevronRight, ClipboardCheck } from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'
import { useI18n } from '@/components/i18n/I18nProvider'

/**
 * Invitación periódica a revisar el perfil (cada ~4 semanas).
 * Peso, objetivo y lesiones actualizados afinan la regeneración semanal.
 */
export function CheckInBanner() {
  const { t } = useI18n()
  return (
    <div className="relative overflow-hidden rounded-2xl border border-sky-500/25 bg-sky-500/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/15">
          <ClipboardCheck className="h-5 w-5 text-sky-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {t('Toca revisar tu perfil')}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {t('Han pasado más de 4 semanas. Actualiza peso, objetivo y lesiones para que tu plan se ajuste a tu momento actual.')}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
            <PendingLink
              href="/settings/datos"
              className="inline-flex items-center gap-0.5 text-xs font-semibold text-sky-400 hover:text-sky-300"
            >
              {t('Datos personales')}
              <ChevronRight className="h-3.5 w-3.5" />
            </PendingLink>
            <PendingLink
              href="/settings/entrenamiento"
              className="inline-flex items-center gap-0.5 text-xs font-semibold text-sky-400 hover:text-sky-300"
            >
              {t('Objetivo y lesiones')}
              <ChevronRight className="h-3.5 w-3.5" />
            </PendingLink>
          </div>
        </div>
      </div>
    </div>
  )
}

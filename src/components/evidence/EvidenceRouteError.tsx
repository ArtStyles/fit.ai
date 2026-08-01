'use client'

import { Button } from '@/components/ui/button'
import { ScreenState } from '@/components/feedback/ScreenState'
import { useI18n } from '@/components/i18n/I18nProvider'

export function EvidenceRouteError({ reset }: { reset: () => void }) {
  const { t } = useI18n()

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <ScreenState
        kind="error"
        title={t('No se pudo cargar esta vista')}
        description={t('Tus datos siguen guardados. Intenta nuevamente.')}
        action={(
          <Button type="button" size="lg" onClick={reset}>
            {t('Reintentar')}
          </Button>
        )}
      />
    </main>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { BellRing, Smartphone } from 'lucide-react'
import { updateProductNotificationPreferences } from '@/app/actions/notifications'
import { useToast } from '@/components/feedback/ToastProvider'
import { useI18n } from '@/components/i18n/I18nProvider'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { SettingsSwitchRow } from '@/components/settings/SettingsSwitchRow'
import { cn } from '@/lib/utils'

export type ProductNotificationPreferencesInput = {
  professionalEnabled: boolean
  pushEnabled: boolean
}

type PreferenceKey = keyof ProductNotificationPreferencesInput

const OPTIONS: Array<{
  key: PreferenceKey
  label: string
  description: string
  icon: typeof BellRing
}> = [
  {
    key: 'professionalEnabled',
    label: 'Notificaciones profesionales',
    description: 'Solicitudes, relaciones con entrenadores y rutinas compartidas.',
    icon: BellRing,
  },
  {
    key: 'pushEnabled',
    label: 'Notificaciones push',
    description: 'Recibir estos avisos también en la app instalada.',
    icon: Smartphone,
  },
]

export function ProductNotificationPreferences({
  initialPreferences,
}: {
  initialPreferences: ProductNotificationPreferencesInput
}) {
  const [preferences, setPreferences] = useState(initialPreferences)
  const [pending, startTransition] = useTransition()
  const [statusMessage, setStatusMessage] = useState('')
  const { showToast } = useToast()
  const { t } = useI18n()

  function toggle(key: PreferenceKey) {
    if (pending) return
    const previous = { ...preferences }
    const next = { ...previous, [key]: !previous[key] }
    setPreferences(next)

    startTransition(async () => {
      const result = await updateProductNotificationPreferences(next)
      if (!result.ok) {
        setPreferences(previous)
        setStatusMessage(result.error)
        showToast({ title: result.error, variant: 'error' })
        return
      }
      const message = t('Preferencias guardadas')
      setStatusMessage(message)
      showToast({ title: message, variant: 'success' })
    })
  }

  return (
    <SettingsSection
      title={t('Avisos de Vekira')}
      description={t('Novedades de entrenamiento y servicio profesional')}
    >
      <p className="sr-only" role="status" aria-live="polite">{statusMessage}</p>
      <div className="space-y-3">
        {OPTIONS.map(option => {
          const Icon = option.icon
          const enabled = preferences[option.key]
          return (
            <SettingsSwitchRow
              key={option.key}
              title={t(option.label)}
              description={t(option.description)}
              icon={<Icon className="h-4 w-4" />}
              control={(
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`${t(enabled ? 'Desactivar' : 'Activar')} ${t(option.label)}`}
                  onClick={() => toggle(option.key)}
                  disabled={pending}
                  className="flex h-11 w-12 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'relative block h-7 w-12 rounded-full transition-colors',
                      enabled ? 'bg-violet-500' : 'bg-muted/50',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform',
                        enabled ? 'translate-x-5' : 'translate-x-0',
                      )}
                    />
                  </span>
                </button>
              )}
            />
          )
        })}
      </div>
    </SettingsSection>
  )
}

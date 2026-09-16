'use client'

import { useEffect, useRef, useState } from 'react'
import { BellRing, Smartphone } from 'lucide-react'
import { updateProductNotificationPreferences } from '@/app/actions/notifications'
import { useToast } from '@/components/feedback/ToastProvider'
import { useI18n } from '@/components/i18n/I18nProvider'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { SettingsSwitchRow } from '@/components/settings/SettingsSwitchRow'
import {
  createSingleFlight,
  persistOptimisticPreference,
} from '@/components/settings/notificationPreferenceFeedback'
import { cn } from '@/lib/utils'
import { productPushAvailable } from '@/lib/native/pushCapability'
import { SettingsStatus } from '@/components/settings/SettingsStatus'
import { PushNotifications } from '@capacitor/push-notifications'
import { isNativePlatform } from '@/lib/native/platform'

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
  pushAvailable = productPushAvailable(),
}: {
  initialPreferences: ProductNotificationPreferencesInput
  pushAvailable?: boolean
}) {
  const [preferences, setPreferences] = useState(initialPreferences)
  const [saving, setSaving] = useState(false)
  const persistence = useRef(createSingleFlight()).current
  const active = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const [statusMessage, setStatusMessage] = useState('')
  const { showToast } = useToast()
  const { language, t } = useI18n()

  function toggle(key: PreferenceKey) {
    if (persistence.isPending || (key === 'pushEnabled' && !pushAvailable)) return
    const previous = { ...preferences }
    const next = { ...previous, [key]: !previous[key] }
    setPreferences(next)
    setSaving(true)
    void persistence.run(() => persistOptimisticPreference({
        previous,
        next,
        save: async preferences => {
          if (key === 'pushEnabled' && preferences.pushEnabled && isNativePlatform()) {
            const status = await PushNotifications.checkPermissions()
            const permission = status.receive === 'granted' ? status : await PushNotifications.requestPermissions()
            if (permission.receive !== 'granted') return { ok: false, error: t('Permiso necesario') }
          }
          if (!active.current) return { ok: false, error: 'La cuenta cambió. Vuelve a abrir esta pantalla.' }
          return updateProductNotificationPreferences(preferences)
        },
        fallbackError: t('No se pudieron guardar las preferencias.'),
        onRollback: (restored, error) => {
          if (!active.current) return
          const message = t(error)
          setPreferences(restored)
          setStatusMessage(message)
          showToast({ title: message, variant: 'error' })
        },
        onSuccess: () => {
          if (!active.current) return
          const message = t('Preferencias guardadas')
          setStatusMessage(message)
          showToast({ title: message, variant: 'success' })
        },
      })).finally(() => setSaving(false))
  }

  return (
    <SettingsSection
      title={t('Avisos de Vekira')}
      description={t('Novedades de entrenamiento y servicio profesional')}
    >
      <p className="sr-only" role="status" aria-live="polite">{statusMessage}</p>
      {!pushAvailable && <SettingsStatus tone="info">{language === 'en'
        ? 'This Android version does not have push notifications configured. You can still read notices inside Vekira and use local workout reminders.'
        : 'Esta versión de Android no tiene configuradas las notificaciones push. Puedes seguir leyendo los avisos dentro de Vekira y usar los recordatorios locales de entrenamiento.'}</SettingsStatus>}
      <div className="space-y-3">
        {OPTIONS.map(option => {
          const Icon = option.icon
          const unavailable = option.key === 'pushEnabled' && !pushAvailable
          const enabled = !unavailable && preferences[option.key]
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
                  disabled={saving || unavailable}
                  className="flex h-11 w-12 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
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

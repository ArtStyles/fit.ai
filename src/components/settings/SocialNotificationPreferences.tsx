'use client'

import { useRef, useState } from 'react'
import { Heart, MessageCircle, UserCheck, UserPlus } from 'lucide-react'
import {
  updateSocialNotificationPreferences,
  type SocialNotificationPreferencesInput,
} from '@/app/actions/pushNotifications'
import { useToast } from '@/components/feedback/ToastProvider'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/I18nProvider'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { SettingsSwitchRow } from '@/components/settings/SettingsSwitchRow'
import {
  createSingleFlight,
  persistOptimisticPreference,
} from '@/components/settings/notificationPreferenceFeedback'

type PreferenceKey = keyof SocialNotificationPreferencesInput

const OPTIONS: Array<{
  key: PreferenceKey
  label: string
  description: string
  icon: typeof Heart
}> = [
  { key: 'likes_enabled', label: 'Likes', description: 'Cuando alguien marca una publicación tuya.', icon: Heart },
  { key: 'comments_enabled', label: 'Comentarios', description: 'Cuando alguien comenta una publicación tuya.', icon: MessageCircle },
  { key: 'follows_enabled', label: 'Seguidores', description: 'Cuando alguien empieza a seguirte.', icon: UserCheck },
  { key: 'follow_requests_enabled', label: 'Solicitudes', description: 'Cuando una cuenta privada recibe una solicitud.', icon: UserPlus },
]

export function SocialNotificationPreferences({
  initialPreferences,
}: {
  initialPreferences: SocialNotificationPreferencesInput
}) {
  const [preferences, setPreferences] = useState(initialPreferences)
  const [saving, setSaving] = useState(false)
  const persistence = useRef(createSingleFlight()).current
  const [statusMessage, setStatusMessage] = useState('')
  const { showToast } = useToast()
  const { t } = useI18n()

  function toggle(key: PreferenceKey) {
    if (persistence.isPending) return
    const previous = { ...preferences }
    const next = { ...previous, [key]: !previous[key] }
    setPreferences(next)
    setSaving(true)
    void persistence.run(() => persistOptimisticPreference({
        previous,
        next,
        save: updateSocialNotificationPreferences,
        fallbackError: t('No se pudieron guardar las preferencias.'),
        onRollback: (restored, error) => {
          const message = t(error)
          setPreferences(restored)
          setStatusMessage(message)
          showToast({ title: message, variant: 'error' })
        },
        onSuccess: () => {
          const message = t('Preferencias guardadas')
          setStatusMessage(message)
          showToast({ title: message, variant: 'success' })
        },
      })).finally(() => setSaving(false))
  }

  return (
    <SettingsSection title={t('Actividad social')} description={t('Push en la app instalada')}>
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
                disabled={saving}
                className={cn(
                  'flex h-11 w-12 min-h-11 min-w-11 shrink-0 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                  saving && 'opacity-60',
                )}
              >
                <span
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

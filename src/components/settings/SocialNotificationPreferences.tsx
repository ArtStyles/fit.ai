'use client'

import { useState, useTransition } from 'react'
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
      const result = await updateSocialNotificationPreferences(next)
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
                disabled={pending}
                className={cn(
                  'relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                  enabled ? 'bg-violet-500' : 'bg-muted/50',
                  pending && 'opacity-60',
                )}
              >
                <span
                  className={cn(
                    'absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform',
                    enabled ? 'translate-x-5' : 'translate-x-0',
                  )}
                />
                </button>
              )}
            />
          )
        })}
      </div>
    </SettingsSection>
  )
}

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
  const { showToast } = useToast()
  const { t } = useI18n()

  function toggle(key: PreferenceKey) {
    const next = { ...preferences, [key]: !preferences[key] }
    setPreferences(next)
    startTransition(async () => {
      const result = await updateSocialNotificationPreferences(next)
      if (!result.ok) {
        setPreferences(preferences)
        showToast({ title: result.error, variant: 'error' })
      }
    })
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-muted/10 p-5">
      <div>
        <p className="text-sm font-semibold text-foreground">{t('Actividad social')}</p>
        <p className="text-xs text-muted-foreground">{t('Push en la app instalada')}</p>
      </div>

      <div className="mt-4 divide-y divide-border/50">
        {OPTIONS.map(option => {
          const Icon = option.icon
          const enabled = preferences[option.key]
          return (
            <div key={option.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background/70 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{t(option.label)}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{t(option.description)}</p>
                </div>
              </div>
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
            </div>
          )
        })}
      </div>
    </section>
  )
}

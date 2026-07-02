// src/components/settings/PrivacyToggle.tsx
'use client'

import { useState, useTransition } from 'react'
import { Lock } from 'lucide-react'
import { setPrivacy } from '@/app/actions/settings'
import { useToast } from '@/components/feedback/ToastProvider'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/I18nProvider'

export function PrivacyToggle({ initialPrivate }: { initialPrivate: boolean }) {
  const [isPrivate, setIsPrivate] = useState(initialPrivate)
  const [pending, startTransition] = useTransition()
  const { showToast } = useToast()
  const { t } = useI18n()

  function toggle() {
    const next = !isPrivate
    setIsPrivate(next)
    startTransition(async () => {
      const res = await setPrivacy(next)
      if (!res.ok) { setIsPrivate(!next); showToast({ title: res.error, variant: 'error' }) }
    })
  }

  return (
    <section className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/10 p-5">
      <div className="flex items-center gap-3">
        <Lock className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{t('Cuenta privada')}</p>
          <p className="text-xs text-muted-foreground">{t('Solo tus seguidores aceptados ven tus publicaciones.')}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isPrivate}
        aria-label={t('Cuenta privada')}
        onClick={toggle}
        disabled={pending}
        className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60',
          isPrivate ? 'bg-violet-500' : 'bg-muted')}
      >
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
          isPrivate ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </button>
    </section>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Share2, Loader2 } from 'lucide-react'
import { createPostFromSession } from '@/app/actions/posts'
import { useToast } from '@/components/feedback/ToastProvider'
import { useI18n } from '@/components/i18n/I18nProvider'

export function ShareSessionButton({ progressLogId }: { progressLogId: string }) {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const router = useRouter()
  const { showToast } = useToast()
  const { t } = useI18n()

  function share() {
    startTransition(async () => {
      const res = await createPostFromSession(progressLogId)
      if (res.ok) { setDone(true); showToast({ title: t('Sesión compartida en Comunidad.'), variant: 'success' }); router.push(`/post/${res.id}`) }
      else showToast({ title: res.error, variant: 'error' })
    })
  }

  return (
    <button onClick={share} disabled={pending || done}
      className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium disabled:opacity-60">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
      {done ? t('Compartida') : t('Compartir sesión')}
    </button>
  )
}

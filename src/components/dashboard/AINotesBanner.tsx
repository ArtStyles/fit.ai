'use client'

import { useState } from 'react'
import { ArrowRight, Pencil, RefreshCw, Sparkles, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/components/i18n/I18nProvider'

export type BannerContext = 'first_plan' | 'weekly_regeneration' | 'manual_update'

interface Props {
  aiNotes: string
  planName: string
  bannerContext: BannerContext
}

const BANNER_COPY: Record<BannerContext, { title: string; icon: React.ComponentType<{ className?: string }> }> = {
  first_plan: { title: 'Tu plan está listo', icon: Sparkles },
  weekly_regeneration: { title: 'Tu plan se actualizó', icon: RefreshCw },
  manual_update: { title: 'Plan actualizado', icon: Pencil },
}

export function AINotesBanner({ aiNotes, planName, bannerContext = 'first_plan' }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const copy = BANNER_COPY[bannerContext]
  if (dismissed) return null

  return (
    <>
      <div className="relative flex gap-3 rounded-2xl border border-violet-500/30 bg-violet-500/[0.07] p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/15">
          <copy.icon className="h-5 w-5 text-violet-300" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-base font-semibold text-foreground">{t(copy.title)}</p>
          <p className="line-clamp-2 text-base leading-relaxed text-muted-foreground">{aiNotes}</p>
          <button type="button" onClick={() => setOpen(true)} className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-violet-300 transition-colors hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 motion-reduce:transition-none">
            {t('Ver detalles')}<ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <button type="button" onClick={() => setDismissed(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-violet-500/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 motion-reduce:transition-none" aria-label={t('Cerrar')}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><copy.icon aria-hidden="true" className="h-4 w-4" />{t('Nota de tu plan')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">{planName}</p>
            <p className="text-base leading-relaxed text-foreground">{aiNotes}</p>
          </div>
          <Button variant="outline" className="mt-2 min-h-11 w-full text-base" onClick={() => setOpen(false)}>{t('Cerrar')}</Button>
        </DialogContent>
      </Dialog>
    </>
  )
}

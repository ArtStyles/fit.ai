'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

export type BannerContext = 'first_plan' | 'weekly_regeneration' | 'manual_update'

interface Props {
  aiNotes:       string
  planName:      string
  bannerContext: BannerContext
}

const BANNER_COPY: Record<BannerContext, { title: string; icon: string }> = {
  first_plan:          { title: 'Tu plan está listo',   icon: '🎯' },
  weekly_regeneration: { title: 'Tu plan se actualizó', icon: '🤖' },
  manual_update:       { title: 'Plan actualizado',     icon: '✏️' },
}

export function AINotesBanner({ aiNotes, planName, bannerContext = 'first_plan' }: Props) {
  const [open,      setOpen]      = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const copy = BANNER_COPY[bannerContext]

  if (dismissed) return null

  return (
    <>
      <div className="relative rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3.5 flex gap-3">
        <span className="mt-0.5 shrink-0 text-lg leading-none" aria-hidden="true">{copy.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-amber-300 mb-0.5">{copy.title}</p>
          <p className="text-sm text-muted-foreground line-clamp-2">{aiNotes}</p>
          <button
            onClick={() => setOpen(true)}
            className="mt-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors"
          >
            Ver detalles →
          </button>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span aria-hidden="true">{copy.icon}</span>
              Nota de tu entrenador IA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground font-medium">{planName}</p>
            <p className="text-sm text-foreground leading-relaxed">{aiNotes}</p>
          </div>
          <Button variant="outline" className="w-full mt-2" onClick={() => setOpen(false)}>
            Cerrar
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}

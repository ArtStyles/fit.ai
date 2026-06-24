// src/components/social/ReportDialog.tsx
'use client'

import { useState, useTransition } from 'react'
import { reportContent } from '@/app/actions/moderation'
import { useToast } from '@/components/feedback/ToastProvider'

export function ReportDialog({ postId, commentId, onClose }: {
  postId?: string; commentId?: string; onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()
  const { showToast } = useToast()

  function submit() {
    startTransition(async () => {
      const res = await reportContent({ postId, commentId, reason })
      if (res.ok) { showToast({ title: 'Reporte enviado. Gracias.', variant: 'success' }); onClose() }
      else showToast({ title: res.error, variant: 'error' })
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-4" onClick={e => e.stopPropagation()}>
        <h2 className="mb-2 text-base font-semibold">Reportar contenido</h2>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Motivo del reporte"
          className="mb-3 h-24 w-full rounded-lg border border-border bg-card/40 p-2 text-sm"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-11 rounded-lg px-4 text-sm text-muted-foreground">Cancelar</button>
          <button onClick={submit} disabled={pending || !reason.trim()}
            className="h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
            Enviar
          </button>
        </div>
      </div>
    </div>
  )
}

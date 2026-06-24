// src/components/social/PostMenu.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Flag, Ban, Trash2 } from 'lucide-react'
import { blockUser } from '@/app/actions/moderation'
import { deletePost } from '@/app/actions/posts'
import { ReportDialog } from './ReportDialog'
import { useToast } from '@/components/feedback/ToastProvider'

export function PostMenu({ postId, authorId, isMine }: {
  postId: string; authorId: string; isMine: boolean
}) {
  const [open, setOpen] = useState(false)
  const [report, setReport] = useState(false)
  const [, startTransition] = useTransition()
  const router = useRouter()
  const { showToast } = useToast()

  function onBlock() {
    setOpen(false)
    startTransition(async () => {
      const res = await blockUser(authorId)
      showToast({ title: res.ok ? 'Usuario bloqueado.' : res.error, variant: res.ok ? 'success' : 'error' })
      if (res.ok) router.refresh()
    })
  }
  function onDelete() {
    setOpen(false)
    startTransition(async () => {
      const res = await deletePost(postId)
      showToast({ title: res.ok ? 'Publicación eliminada.' : res.error, variant: res.ok ? 'success' : 'error' })
      if (res.ok) router.refresh()
    })
  }

  return (
    <div className="relative">
      <button type="button" aria-label="Más opciones" onClick={() => setOpen(o => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-white/5">
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-44 overflow-hidden rounded-xl border border-border bg-background py-1 text-sm shadow-lg">
          {isMine ? (
            <button onClick={onDelete} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-red-400 hover:bg-white/5">
              <Trash2 className="h-4 w-4" /> Eliminar
            </button>
          ) : (
            <>
              <button onClick={() => { setOpen(false); setReport(true) }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/5">
                <Flag className="h-4 w-4" /> Reportar
              </button>
              <button onClick={onBlock} className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/5">
                <Ban className="h-4 w-4" /> Bloquear usuario
              </button>
            </>
          )}
        </div>
      )}
      {report && <ReportDialog postId={postId} onClose={() => setReport(false)} />}
    </div>
  )
}

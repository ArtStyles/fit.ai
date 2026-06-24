// src/components/social/PostMenu.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Flag, Ban, Trash2 } from 'lucide-react'
import { blockUser } from '@/app/actions/moderation'
import { deletePost } from '@/app/actions/posts'
import { ReportDialog } from './ReportDialog'
import { useToast } from '@/components/feedback/ToastProvider'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

export function PostMenu({ postId, authorId, isMine }: {
  postId: string; authorId: string; isMine: boolean
}) {
  const [report, setReport] = useState(false)
  const [, startTransition] = useTransition()
  const router = useRouter()
  const { showToast } = useToast()

  function onBlock() {
    startTransition(async () => {
      const res = await blockUser(authorId)
      showToast({ title: res.ok ? 'Usuario bloqueado.' : res.error, variant: res.ok ? 'success' : 'error' })
      if (res.ok) router.refresh()
    })
  }
  function onDelete() {
    startTransition(async () => {
      const res = await deletePost(postId)
      showToast({ title: res.ok ? 'Publicación eliminada.' : res.error, variant: res.ok ? 'success' : 'error' })
      if (res.ok) router.refresh()
    })
  }

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Más opciones"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-white/5"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {isMine ? (
            <DropdownMenuItem
              onSelect={onDelete}
              className="gap-2 text-red-400 focus:text-red-400"
            >
              <Trash2 className="h-4 w-4" /> Eliminar
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem onSelect={() => setReport(true)} className="gap-2">
                <Flag className="h-4 w-4" /> Reportar
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onBlock} className="gap-2">
                <Ban className="h-4 w-4" /> Bloquear usuario
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {report && <ReportDialog postId={postId} onClose={() => setReport(false)} />}
    </div>
  )
}

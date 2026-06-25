'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Flag } from 'lucide-react'
import type { PostCommentView } from '@/lib/social/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { deleteComment } from '@/app/actions/engagement'
import { useToast } from '@/components/feedback/ToastProvider'
import { ReportDialog } from './ReportDialog'

export function CommentList({ comments, postId }: { comments: PostCommentView[]; postId: string }) {
  const [pending, startTransition] = useTransition()
  const [reportId, setReportId] = useState<string | null>(null)
  const router = useRouter()
  const { showToast } = useToast()

  if (!comments.length) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">Sé el primero en comentar.</p>
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteComment(id, postId)
      if (res.ok) router.refresh()
      else showToast({ title: res.error, variant: 'error' })
    })
  }

  return (
    <>
      <ul className="divide-y divide-border/30">
        {comments.map(c => {
          const name = c.author.full_name || c.author.username || 'Usuario'
          return (
            <li key={c.id} className="flex gap-3 px-4 py-3">
              <Avatar className="h-8 w-8">
                {c.author.avatar_url && <AvatarImage src={c.author.avatar_url} alt={name} />}
                <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm"><span className="font-semibold">{name}</span></p>
                <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{c.body}</p>
              </div>
              {c.is_mine ? (
                <button
                  onClick={() => remove(c.id)}
                  aria-label="Eliminar comentario"
                  disabled={pending}
                  className="text-muted-foreground hover:text-red-400 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={() => setReportId(c.id)}
                  aria-label="Reportar comentario"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Flag className="h-4 w-4" />
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {reportId && <ReportDialog commentId={reportId} onClose={() => setReportId(null)} />}
    </>
  )
}

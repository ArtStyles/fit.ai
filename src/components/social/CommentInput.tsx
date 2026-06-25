'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { addComment } from '@/app/actions/engagement'
import { useToast } from '@/components/feedback/ToastProvider'

export function CommentInput({ postId }: { postId: string }) {
  const [text, setText] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const { showToast } = useToast()

  function submit() {
    const body = text.trim()
    if (!body) return
    startTransition(async () => {
      const res = await addComment(postId, body)
      if (res.ok) { setText(''); router.refresh() }
      else showToast({ title: res.error, variant: 'error' })
    })
  }

  return (
    <div className="sticky bottom-16 flex items-center gap-2 border-t border-border/40 bg-background/95 px-4 py-3 backdrop-blur-md">
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
        placeholder="Escribe un comentario…"
        maxLength={1000}
        className="h-11 flex-1 rounded-full border border-border bg-card/40 px-4 text-sm"
      />
      <button onClick={submit} disabled={pending || !text.trim()} aria-label="Enviar comentario"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-60">
        <Send className="h-5 w-5" />
      </button>
    </div>
  )
}

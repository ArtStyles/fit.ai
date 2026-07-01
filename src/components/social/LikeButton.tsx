// src/components/social/LikeButton.tsx
'use client'

import { useEffect, useState, useTransition } from 'react'
import { Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toggleLike } from '@/app/actions/engagement'

export function LikeButton({ postId, initialLiked, initialCount }: {
  postId: string; initialLiked: boolean; initialCount: number
}) {
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [, startTransition] = useTransition()

  // Una revalidacion de la ruta actualiza las props, pero React conserva el
  // estado de este boton porque el post mantiene la misma key.
  useEffect(() => {
    setLiked(initialLiked)
    setCount(initialCount)
  }, [postId, initialLiked, initialCount])

  function onToggle() {
    const next = !liked
    setLiked(next)
    setCount(c => c + (next ? 1 : -1))
    startTransition(async () => {
      const res = await toggleLike(postId)
      if (!res.ok) {
        setLiked(!next)
        setCount(c => c + (next ? -1 : 1))
      } else if (res.liked !== next) {
        // El servidor terminó en un estado distinto al optimista (p.ej. desync entre
        // pestañas): reconcilia el like y corrige el contador quitando el delta optimista
        // y aplicando el real.
        setLiked(res.liked)
        setCount(c => c + (res.liked ? 1 : -1) - (next ? 1 : -1))
      }
    })
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={liked}
      className="inline-flex h-11 items-center gap-1.5 text-sm text-muted-foreground"
    >
      <Heart className={cn('h-5 w-5 transition-colors', liked && 'fill-red-500 text-red-500')} />
      {count > 0 && <span>{count}</span>}
    </button>
  )
}

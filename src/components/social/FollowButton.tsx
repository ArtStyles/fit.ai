// src/components/social/FollowButton.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, UserCheck, Clock, Loader2 } from 'lucide-react'
import { followUser, unfollowUser } from '@/app/actions/follows'
import { useToast } from '@/components/feedback/ToastProvider'
import { cn } from '@/lib/utils'
import type { FollowState } from '@/lib/social/follow'

export function FollowButton({ targetId, isPrivate, initialState }: {
  targetId: string; isPrivate: boolean; initialState: FollowState
}) {
  const [state, setState] = useState<FollowState>(initialState)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const { showToast } = useToast()

  function onClick() {
    const prev = state
    const isFollowAction = prev === 'follow' || prev === 'request'
    // optimista
    setState(prev === 'follow' ? 'following'
      : prev === 'request' ? 'requested'
      : prev === 'requested' ? 'request'
      : isPrivate ? 'request' : 'follow')

    startTransition(async () => {
      const res = isFollowAction ? await followUser(targetId) : await unfollowUser(targetId)
      if (!res.ok) { setState(prev); showToast({ title: res.error, variant: 'error' }); return }
      if (isFollowAction && res.ok && 'status' in res) setState(res.status === 'accepted' ? 'following' : 'requested')
      router.refresh()
    })
  }

  const label = state === 'following' ? 'Siguiendo'
    : state === 'requested' ? 'Solicitado'
    : state === 'request' ? 'Solicitar' : 'Seguir'
  const Icon = state === 'following' ? UserCheck : state === 'requested' ? Clock : UserPlus
  const filled = state === 'follow' || state === 'request'

  return (
    <button
      onClick={onClick}
      disabled={pending}
      aria-pressed={state === 'following' || state === 'requested'}
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-medium disabled:opacity-60',
        filled ? 'bg-primary text-primary-foreground' : 'border border-border text-foreground',
      )}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  )
}

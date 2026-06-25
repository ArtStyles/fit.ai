// src/components/social/FollowButton.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, UserCheck, Loader2 } from 'lucide-react'
import { followUser, unfollowUser } from '@/app/actions/follows'
import { useToast } from '@/components/feedback/ToastProvider'
import { cn } from '@/lib/utils'

export function FollowButton({ targetId, initialFollowing }: { targetId: string; initialFollowing: boolean }) {
  const [following, setFollowing] = useState(initialFollowing)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const { showToast } = useToast()

  function toggle() {
    const next = !following
    setFollowing(next)
    startTransition(async () => {
      const res = next ? await followUser(targetId) : await unfollowUser(targetId)
      if (!res.ok) {
        setFollowing(!next)
        showToast({ title: res.error, variant: 'error' })
      } else {
        setFollowing(res.following)
        router.refresh()
      }
    })
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      aria-pressed={following}
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-medium disabled:opacity-60',
        following ? 'border border-border text-foreground' : 'bg-primary text-primary-foreground',
      )}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : following ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
      {following ? 'Siguiendo' : 'Seguir'}
    </button>
  )
}

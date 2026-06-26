// src/components/social/RequestRow.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { RequestUser } from '@/lib/social/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { acceptFollowRequest, rejectFollowRequest } from '@/app/actions/follows'
import { useToast } from '@/components/feedback/ToastProvider'

export function RequestRow({ user }: { user: RequestUser }) {
  const [done, setDone] = useState<null | 'accepted' | 'rejected'>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const { showToast } = useToast()
  const name = user.full_name || user.username || 'Usuario'

  function act(kind: 'accepted' | 'rejected') {
    startTransition(async () => {
      const res = kind === 'accepted' ? await acceptFollowRequest(user.id) : await rejectFollowRequest(user.id)
      if (res.ok) { setDone(kind); router.refresh() }
      else showToast({ title: res.error, variant: 'error' })
    })
  }

  if (done) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground">
        {done === 'accepted' ? 'Solicitud aceptada' : 'Solicitud rechazada'}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Link href={user.username ? `/u/${user.username}` : '#'} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar className="h-11 w-11">
          {user.avatar_url && <AvatarImage src={user.avatar_url} alt={name} />}
          <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          {user.username && <p className="truncate text-xs text-muted-foreground">@{user.username}</p>}
        </div>
      </Link>
      <div className="flex gap-2">
        <button onClick={() => act('accepted')} disabled={pending}
          className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60">Aceptar</button>
        <button onClick={() => act('rejected')} disabled={pending}
          className="h-9 rounded-lg border border-border px-3 text-sm font-medium disabled:opacity-60">Rechazar</button>
      </div>
    </div>
  )
}

// src/components/social/RoutineCard.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, Copy, Loader2 } from 'lucide-react'
import type { RoutineSnapshot } from '@/lib/social/snapshots'
import { clonePlanFromPost } from '@/app/actions/posts'
import { useToast } from '@/components/feedback/ToastProvider'

export function RoutineCard({ snap, postId }: { snap: RoutineSnapshot; postId: string }) {
  const [pending, startTransition] = useTransition()
  const [cloned, setCloned] = useState(false)
  const router = useRouter()
  const { showToast } = useToast()

  function onClone() {
    startTransition(async () => {
      const res = await clonePlanFromPost(postId)
      if (res.ok) {
        setCloned(true)
        showToast({ title: 'Rutina clonada a tu cuenta.', variant: 'success' })
        router.push('/plan')
      } else {
        showToast({ title: res.error, variant: 'error' })
      }
    })
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <ClipboardList className="h-4 w-4 text-primary" />
        {snap.name}
      </div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {snap.days_per_week != null && <span>{snap.days_per_week} días/sem</span>}
        {snap.difficulty && <span>{snap.difficulty}</span>}
        <span>{snap.workouts.length} sesiones</span>
      </div>
      <button
        type="button"
        onClick={onClone}
        disabled={pending || cloned}
        className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
        {cloned ? 'Clonada' : 'Clonar rutina'}
      </button>
    </div>
  )
}

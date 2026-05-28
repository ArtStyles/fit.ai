'use client'

import { useEffect, useState } from 'react'
import { Check, CloudOff, Loader2 } from 'lucide-react'
import { useSyncStatus } from '@/hooks/useSyncStatus'
import { cn } from '@/lib/utils'

interface Props {
  className?: string
}

export function SyncStatusIndicator({ className }: Props) {
  const { syncStatus } = useSyncStatus()
  const [showSynced, setShowSynced] = useState(false)

  useEffect(() => {
    if (syncStatus !== 'synced') return

    setShowSynced(true)
    const id = window.setTimeout(() => setShowSynced(false), 2000)
    return () => window.clearTimeout(id)
  }, [syncStatus])

  if (syncStatus === 'idle') return null

  if (syncStatus === 'synced' && showSynced) {
    return (
      <div className={cn('flex items-center gap-1 text-green-400', className)} aria-live="polite">
        <Check className="h-3 w-3" />
        <span className="sr-only">Sincronizado</span>
      </div>
    )
  }

  if (syncStatus === 'syncing') {
    return (
      <div className={cn('flex items-center gap-1 text-muted-foreground', className)} aria-live="polite">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="sr-only">Sincronizando</span>
      </div>
    )
  }

  if (syncStatus === 'offline') {
    return (
      <div className={cn('flex items-center gap-1.5 text-amber-400', className)} aria-live="polite">
        <CloudOff className="h-3 w-3 shrink-0" />
        <span className="text-[11px] font-medium leading-none">
          Offline · se guardará al reconectar
        </span>
      </div>
    )
  }

  return null
}

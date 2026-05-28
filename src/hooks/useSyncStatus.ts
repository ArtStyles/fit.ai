'use client'

import { useEffect, useState } from 'react'
import { useSessionStore } from '@/store/sessionStore'

export type VisibleSyncStatus = 'idle' | 'syncing' | 'synced' | 'offline'

export function useSyncStatus(): {
  isOnline: boolean
  syncStatus: VisibleSyncStatus
} {
  const storeStatus = useSessionStore(state => state.syncStatus)
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(window.navigator.onLine)

    updateOnlineState()
    window.addEventListener('online', updateOnlineState)
    window.addEventListener('offline', updateOnlineState)

    return () => {
      window.removeEventListener('online', updateOnlineState)
      window.removeEventListener('offline', updateOnlineState)
    }
  }, [])

  if (!isOnline || storeStatus === 'error') {
    return { isOnline, syncStatus: 'offline' }
  }

  if (storeStatus === 'saving') {
    return { isOnline, syncStatus: 'syncing' }
  }

  if (storeStatus === 'saved') {
    return { isOnline, syncStatus: 'synced' }
  }

  return { isOnline, syncStatus: 'idle' }
}

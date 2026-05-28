'use client'

import { useEffect, useRef } from 'react'
import { useSessionStore } from '@/store/sessionStore'

/**
 * Conecta el intervalo del sistema al store de sesión.
 * Se monta una sola vez en SessionClient; no necesita props.
 */
export function useRestTimer() {
  const restTimer    = useSessionStore(s => s.restTimer)
  const tick         = useSessionStore(s => s.tickRestTimer)
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (restTimer?.isRunning) {
      intervalRef.current = setInterval(() => {
        tick()
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [restTimer?.isRunning, tick])

  return restTimer
}

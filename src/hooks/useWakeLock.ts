'use client'

import { useEffect, useRef } from 'react'

/**
 * Solicita un Wake Lock para que la pantalla no se apague durante el entrenamiento.
 * Se activa cuando `active` es true, se libera cuando es false o el componente desmonta.
 * Silencia errores: el Wake Lock API no está disponible en todos los navegadores.
 */
export function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!active) {
      lockRef.current?.release().catch(() => {})
      lockRef.current = null
      return
    }

    if (!('wakeLock' in navigator)) return

    let cancelled = false

    navigator.wakeLock.request('screen').then(lock => {
      if (cancelled) {
        lock.release().catch(() => {})
      } else {
        lockRef.current = lock
      }
    }).catch(() => {
      // Silenciado: puede fallar si el tab no tiene foco o el dispositivo no lo soporta
    })

    return () => {
      cancelled = true
      lockRef.current?.release().catch(() => {})
      lockRef.current = null
    }
  }, [active])
}

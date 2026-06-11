'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { syncTimezone } from '@/app/actions/profile'

/**
 * Detecta la zona horaria IANA del dispositivo y la sincroniza con el
 * perfil cuando difiere de la guardada. Invisible; corre una vez por carga.
 */
export function TimezoneSync({ current }: { current: string | null }) {
  const router = useRouter()

  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!detected || detected === current) return

    void syncTimezone(detected).then(result => {
      // El gating de "hoy" depende de la zona: refrescamos los server
      // components para que el dashboard use la zona correcta ya.
      if (result.success) router.refresh()
    })
  }, [current, router])

  return null
}

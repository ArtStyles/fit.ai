'use client'

import { useEffect } from 'react'
import { isNativePlatform } from '@/lib/native/platform'

/**
 * Inicialización del contenedor nativo. Montado una vez en el layout raíz.
 *
 * Oculta el splash screen en cuanto la web queda lista (este efecto solo corre
 * tras hidratar en el cliente). Un respaldo por timeout evita que el splash se
 * quede colgado si algo falla en la carga. No hace nada en web/PWA.
 */
export function NativeAppInit() {
  useEffect(() => {
    if (!isNativePlatform()) return

    let disposed = false
    let hidden = false
    const hide = async () => {
      if (disposed || hidden) return
      try {
        const { SplashScreen } = await import('@capacitor/splash-screen')
        await SplashScreen.hide()
        hidden = true
      } catch {
        /* el timeout de respaldo reintentará si el plugin todavía no está listo */
      }
    }

    void hide()
    const fallback = window.setTimeout(() => void hide(), 4000)
    return () => {
      disposed = true
      window.clearTimeout(fallback)
    }
  }, [])

  return null
}

/**
 * Feedback háptico unificado.
 *
 * En el contenedor nativo usa el plugin @capacitor/haptics (motor de vibración
 * de calidad, con estilos de impacto reales en iOS/Android). En navegador/PWA
 * cae a la Web Vibration API (`navigator.vibrate`), idéntico al comportamiento
 * que ya tenía la app. Todas las funciones son no-op silenciosas si ninguna de
 * las dos vías está disponible.
 *
 * Llamar solo desde código cliente (event handlers / effects); nunca en render.
 */

import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

type ImpactWeight = 'light' | 'medium' | 'heavy'

const WEB_IMPACT_MS: Record<ImpactWeight, number> = {
  light: 20,
  medium: 40,
  heavy: 70,
}

function canWebVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

/** Impacto puntual — p.ej. al completar una serie. */
export async function hapticImpact(weight: ImpactWeight = 'medium'): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const style =
        weight === 'light' ? ImpactStyle.Light :
        weight === 'heavy' ? ImpactStyle.Heavy :
        ImpactStyle.Medium
      await Haptics.impact({ style })
      return
    } catch {
      /* cae al fallback web */
    }
  }
  if (canWebVibrate()) navigator.vibrate(WEB_IMPACT_MS[weight])
}

/** Patrón de éxito — p.ej. al guardar una sesión completada. */
export async function hapticSuccess(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Haptics.notification({ type: NotificationType.Success })
      return
    } catch {
      /* cae al fallback web */
    }
  }
  if (canWebVibrate()) navigator.vibrate([60, 40, 120])
}

/**
 * Patrón de vibración arbitrario, con la misma semántica que `navigator.vibrate`
 * (un número = ms; un array = [on, off, on, …] en ms).
 *
 * En nativo no existen patrones cross-platform, así que se aproxima con una
 * vibración única cuya duración es la suma de los tramos "on".
 */
export async function hapticPattern(pattern: number | number[]): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const duration = Array.isArray(pattern)
        ? pattern.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0)
        : pattern
      await Haptics.vibrate({ duration: Math.max(1, duration) })
      return
    } catch {
      /* cae al fallback web */
    }
  }
  if (canWebVibrate()) navigator.vibrate(pattern)
}

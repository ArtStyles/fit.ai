/**
 * Detección de plataforma de ejecución.
 *
 * La app web (servida desde Vercel) corre en tres contextos:
 *   - Contenedor nativo Capacitor (Android/iOS) → plugins nativos disponibles
 *   - Navegador / PWA instalada → solo APIs web
 *   - SSR de Next (sin `window`) → siempre 'web'
 *
 * `Capacitor.isNativePlatform()` es seguro en SSR: devuelve false sin tocar
 * `window`, por lo que estos helpers pueden importarse desde cualquier módulo.
 */

import { Capacitor } from '@capacitor/core'

/** True solo dentro del contenedor nativo (Android/iOS). False en web/PWA/SSR. */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

/** Plataforma actual: 'ios' | 'android' | 'web'. */
export function getPlatform(): 'ios' | 'android' | 'web' {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web'
}

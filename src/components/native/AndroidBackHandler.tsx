'use client'

import { useAndroidBack } from '@/lib/native/useAndroidBack'

/**
 * Conecta el gesto/botón atrás de Android a la navegación de la app.
 * Montado una vez en el shell autenticado. No renderiza nada.
 */
export function AndroidBackHandler() {
  useAndroidBack()
  return null
}

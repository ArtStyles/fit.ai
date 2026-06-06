'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getPlatform, isNativePlatform } from '@/lib/native/platform'
import { runBackHandlers } from '@/lib/native/backHandlers'
import { useNavStore } from '@/store/navStore'
import { useToast } from '@/components/feedback/ToastProvider'

/** Pestañas raíz: el back no navega "más atrás" desde aquí. */
const TAB_ROOTS = new Set(['/dashboard', '/plan', '/chat', '/history'])
const HOME = '/dashboard'

/** Ventana para el patrón "presiona atrás otra vez para salir" (ms). */
const EXIT_HINT_WINDOW_MS = 2000

/** ¿Hay un diálogo/alertdialog de Radix abierto? */
function hasOpenOverlay(): boolean {
  return Boolean(
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
    ),
  )
}

/** Radix cierra su capa superior (modal, dropdown, popover…) al recibir Escape. */
function dismissTopOverlay(): void {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  )
}

/**
 * Conecta el gesto/botón "atrás" de Android a la navegación de la app.
 *
 * En el contenedor nativo Android el deslizar-desde-el-borde dispara el evento
 * `backButton` de @capacitor/app. Lo manejamos con esta prioridad:
 *   1. Interceptores registrados (p. ej. el guard de "¿salir del entrenamiento?").
 *   2. Capa flotante abierta → cerrarla.
 *   3. Pestaña raíz → ir a Inicio; en Inicio, doble-atrás para salir de la app.
 *   4. Pantalla interna → volver a la anterior.
 *
 * No hace nada en web/PWA ni en iOS (allí el back no existe como tal).
 */
export function useAndroidBack(): void {
  const router = useRouter()
  const pathname = usePathname()

  // El listener se registra una vez; lee el pathname actual vía ref.
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  const lastExitHintRef = useRef(0)

  const { showToast } = useToast()
  const showToastRef = useRef(showToast)
  showToastRef.current = showToast

  useEffect(() => {
    if (!isNativePlatform() || getPlatform() !== 'android') return

    let removeListener: (() => void) | undefined
    let disposed = false

    void (async () => {
      const { App } = await import('@capacitor/app')

      const onBack = (event: { canGoBack?: boolean }) => {
        // 1. Interceptores registrados (guard de sesión, modales propios…)
        if (runBackHandlers()) return

        // 2. Capa flotante de Radix abierta → cerrarla
        if (hasOpenOverlay()) {
          dismissTopOverlay()
          return
        }

        const path = pathnameRef.current

        // 3. Pestañas raíz
        if (TAB_ROOTS.has(path)) {
          if (path !== HOME) {
            useNavStore.getState().setDirection('back')
            router.push(HOME)
            return
          }
          // En Inicio: doble-atrás para salir
          const now = Date.now()
          if (now - lastExitHintRef.current < EXIT_HINT_WINDOW_MS) {
            void App.exitApp()
          } else {
            lastExitHintRef.current = now
            showToastRef.current({ title: 'Presiona atrás otra vez para salir' })
          }
          return
        }

        // 4. Pantalla interna → volver a la anterior
        useNavStore.getState().setDirection('back')
        if (event.canGoBack === false) {
          router.push(HOME)
        } else {
          router.back()
        }
      }

      const handle = await App.addListener('backButton', onBack)
      if (disposed) void handle.remove()
      else removeListener = () => void handle.remove()
    })()

    return () => {
      disposed = true
      removeListener?.()
    }
  }, [router])
}

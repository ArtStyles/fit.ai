'use client'

import { useEffect, useRef } from 'react'

/**
 * Registro de interceptores del gesto/botón "atrás".
 *
 * Permite que pantallas o modales se enganchen al back sin acoplarse al listener
 * nativo. Cada handler devuelve `true` si "consumió" el back (p. ej. cerró un
 * diálogo) o `false` para dejar pasar al comportamiento por defecto.
 *
 * Los handlers se ejecutan en orden LIFO: el último montado tiene prioridad, que
 * es lo natural cuando hay capas superpuestas (un modal encima de una pantalla).
 */

export type BackHandler = () => boolean

const handlers: BackHandler[] = []

/** Registra un handler y devuelve la función para quitarlo. */
export function pushBackHandler(handler: BackHandler): () => void {
  handlers.push(handler)
  return () => {
    const index = handlers.indexOf(handler)
    if (index !== -1) handlers.splice(index, 1)
  }
}

/**
 * Ejecuta los handlers registrados (LIFO) hasta que uno consuma el back.
 * Devuelve `true` si alguno lo consumió.
 */
export function runBackHandlers(): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i]()) return true
  }
  return false
}

/**
 * Hook para registrar un interceptor de back mientras el componente está montado.
 * El handler siempre ve el estado más reciente vía ref, así que puede cerrar sobre
 * props/estado sin re-registrarse en cada render.
 */
export function useBackHandler(handler: BackHandler, enabled = true): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!enabled) return
    return pushBackHandler(() => handlerRef.current())
  }, [enabled])
}

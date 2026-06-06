import { create } from 'zustand'

/**
 * Dirección de la última navegación, para que las transiciones de página puedan
 * animar en consecuencia: 'forward' = la pantalla entra desde la derecha,
 * 'back' = entra desde la izquierda (sensación de retroceder).
 *
 * El handler del gesto/botón atrás pone 'back' justo antes de navegar; cualquier
 * navegación hacia adelante deja el valor por defecto 'forward'. PageTransition
 * lee la dirección al renderizar y la resetea a 'forward' tras consumirla.
 */

export type NavDirection = 'forward' | 'back'

interface NavState {
  direction: NavDirection
  setDirection: (direction: NavDirection) => void
}

export const useNavStore = create<NavState>((set) => ({
  direction: 'forward',
  setDirection: (direction) => set({ direction }),
}))

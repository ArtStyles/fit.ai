'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, type ReactNode } from 'react'
import { useNavStore, type NavDirection } from '@/store/navStore'

// Las pantallas entran desde la derecha al avanzar y desde la izquierda al
// retroceder, para que el gesto "atrás" se sienta como tal.
const variants = {
  initial: (dir: NavDirection) => ({
    opacity: 0,
    x: dir === 'back' ? -28 : 28,
    filter: 'blur(4px)',
  }),
  animate: { opacity: 1, x: 0, filter: 'blur(0px)' },
  exit: (dir: NavDirection) => ({
    opacity: 0,
    x: dir === 'back' ? 28 : -28,
    filter: 'blur(3px)',
  }),
}

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const shouldReduceMotion = useReducedMotion()

  // Capturar la dirección una sola vez por cambio de ruta, para que se mantenga
  // estable mientras la animación está en curso (el store puede resetearse antes).
  const prevPathRef = useRef<string | null>(null)
  const dirRef = useRef<NavDirection>('forward')
  if (prevPathRef.current !== pathname) {
    prevPathRef.current = pathname
    dirRef.current = useNavStore.getState().direction
  }
  const direction = dirRef.current

  // Dejar el store en 'forward' para la siguiente navegación hacia adelante.
  useEffect(() => {
    if (useNavStore.getState().direction !== 'forward') {
      useNavStore.getState().setDirection('forward')
    }
  }, [pathname])

  if (shouldReduceMotion || pathname.startsWith('/session/')) {
    return <>{children}</>
  }

  return (
    <AnimatePresence mode="wait" initial={false} custom={direction}>
      <motion.div
        key={pathname}
        custom={direction}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="h-full min-h-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

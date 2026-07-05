'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'

interface AppScrollViewportProps {
  children: ReactNode
}

/**
 * The document itself must not be the app's scroll surface. Android's native
 * stretch overscroll is applied to the whole WebView when the root scrolls,
 * which also deforms fixed chrome. Keeping scroll here limits that effect to
 * page content while the top and bottom bars remain outside this element.
 */
export function AppScrollViewport({ children }: AppScrollViewportProps) {
  const pathname = usePathname()
  const viewportRef = useRef<HTMLElement>(null)

  useEffect(() => {
    viewportRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])

  return (
    <main
      id="app-main-content"
      tabIndex={-1}
      ref={viewportRef}
      className="fitai-safe-content-bottom min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-none"
      data-app-scroll-viewport
    >
      {children}
    </main>
  )
}

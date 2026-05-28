'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Dumbbell, Loader2 } from 'lucide-react'

function isTrackedNavigation(event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false

  const target = event.target
  if (!(target instanceof Element)) return false

  const anchor = target.closest('a[href]')
  if (!(anchor instanceof HTMLAnchorElement)) return false
  if (anchor.target && anchor.target !== '_self') return false
  if (anchor.hasAttribute('download')) return false

  const nextUrl = new URL(anchor.href, window.location.href)
  if (nextUrl.origin !== window.location.origin) return false

  const currentUrl = new URL(window.location.href)
  return nextUrl.pathname !== currentUrl.pathname || nextUrl.search !== currentUrl.search
}

export function RouteTransitionIndicator() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, setPending] = useState(false)
  const delayRef = useRef<number | null>(null)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    function clearTimers() {
      if (delayRef.current) window.clearTimeout(delayRef.current)
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
      delayRef.current = null
      timeoutRef.current = null
    }

    function start() {
      clearTimers()
      delayRef.current = window.setTimeout(() => setPending(true), 100)
      timeoutRef.current = window.setTimeout(() => setPending(false), 10000)
    }

    function handleClick(event: MouseEvent) {
      if (isTrackedNavigation(event)) start()
    }

    window.addEventListener('fitai:navigation-start', start)
    document.addEventListener('click', handleClick, true)

    return () => {
      clearTimers()
      window.removeEventListener('fitai:navigation-start', start)
      document.removeEventListener('click', handleClick, true)
    }
  }, [])

  useEffect(() => {
    if (delayRef.current) window.clearTimeout(delayRef.current)
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    delayRef.current = null
    timeoutRef.current = null
    setPending(false)
  }, [pathname, searchParams])

  if (!pending) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70]">
      <div className="h-0.5 w-full overflow-hidden bg-violet-500/20">
        <div className="fitai-route-progress h-full bg-violet-400 shadow-[0_0_16px_rgba(167,139,250,0.85)]" />
      </div>
      <div className="mx-auto mt-3 flex max-w-lg justify-end px-4">
        <div className="animate-in fade-in slide-in-from-top-1 inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-background/85 px-3 py-1.5 text-xs font-medium text-violet-200 shadow-lg shadow-black/30 backdrop-blur-md duration-200">
          <Loader2 className="h-3 w-3 animate-spin" />
          Cargando vista
          <Dumbbell className="h-3 w-3 text-violet-300/80" />
        </div>
      </div>
    </div>
  )
}

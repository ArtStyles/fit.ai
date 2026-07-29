'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type RefObject,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { hapticImpact } from '@/lib/native/haptics'
import {
  beginPull,
  cancelPull,
  pullProgress,
  releasePull,
  resetPull,
  shouldStartPull,
  updatePull,
  type PullGestureState,
} from './pull-to-refresh.logic'

const MIN_REFRESH_MS = 600
const REFRESH_FAIL_SAFE_MS = 10_000
const SETTLE_MS = 400
const THRESHOLD_PULSE_MS = 800
const DISABLED_TARGETS =
  'input, textarea, select, [contenteditable]:not([contenteditable="false" i]), [data-pull-refresh-disabled]'

function isDisabledTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(DISABLED_TARGETS))
}

function isVerticallyScrollable(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false
  const overflowY = window.getComputedStyle(element).overflowY
  return /^(auto|scroll|overlay)$/.test(overflowY)
    && element.scrollHeight > element.clientHeight
}

function scrollableAncestorsThroughViewport(
  target: EventTarget | null,
  viewport: HTMLDivElement,
): HTMLElement[] {
  const ancestors: HTMLElement[] = []
  let current = target instanceof Element ? target : null

  while (current && current !== viewport) {
    if (isVerticallyScrollable(current)) ancestors.push(current)
    current = current.parentElement
  }

  ancestors.push(viewport)
  return ancestors
}

function areScrollableAncestorsAtTop(ancestors: readonly HTMLElement[]): boolean {
  return ancestors.every(element => element.scrollTop <= 0)
}

export function usePullToRefresh(viewportRef: RefObject<HTMLDivElement>) {
  const router = useRouter()
  const pathname = usePathname()
  const [transitionPending, startTransition] = useTransition()
  const [gesture, setGesture] = useState<PullGestureState>(() => resetPull())
  const [enabled, setEnabled] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [completionPulse, setCompletionPulse] = useState(false)
  const [thresholdPulse, setThresholdPulse] = useState(false)

  const gestureRef = useRef(gesture)
  const refreshStartedAtRef = useRef(0)
  const sawPendingRef = useRef(false)
  const completionTimerRef = useRef<number | null>(null)
  const failSafeTimerRef = useRef<number | null>(null)
  const settleTimerRef = useRef<number | null>(null)
  const thresholdPulseTimerRef = useRef<number | null>(null)
  const activeTouchIdentifierRef = useRef<number | null>(null)
  const activeScrollableAncestorsRef = useRef<HTMLElement[]>([])
  const removeTouchMoveListenerRef = useRef<(() => void) | null>(null)
  const removeGlobalTouchStartListenerRef = useRef<(() => void) | null>(null)

  const commit = useCallback((next: PullGestureState) => {
    gestureRef.current = next
    setGesture(next)
  }, [])

  const clearTimers = useCallback(() => {
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current)
      completionTimerRef.current = null
    }
    if (failSafeTimerRef.current !== null) {
      window.clearTimeout(failSafeTimerRef.current)
      failSafeTimerRef.current = null
    }
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current)
      settleTimerRef.current = null
    }
    if (thresholdPulseTimerRef.current !== null) {
      window.clearTimeout(thresholdPulseTimerRef.current)
      thresholdPulseTimerRef.current = null
    }
  }, [])

  const detachTouchMove = useCallback(() => {
    removeTouchMoveListenerRef.current?.()
    removeTouchMoveListenerRef.current = null
  }, [])

  const detachGlobalTouchStart = useCallback(() => {
    removeGlobalTouchStartListenerRef.current?.()
    removeGlobalTouchStartListenerRef.current = null
  }, [])

  const startThresholdPulse = useCallback(() => {
    setThresholdPulse(true)
    if (thresholdPulseTimerRef.current !== null) {
      window.clearTimeout(thresholdPulseTimerRef.current)
    }
    thresholdPulseTimerRef.current = window.setTimeout(() => {
      setThresholdPulse(false)
      thresholdPulseTimerRef.current = null
    }, THRESHOLD_PULSE_MS)
  }, [])

  const reset = useCallback(() => {
    clearTimers()
    detachTouchMove()
    detachGlobalTouchStart()
    activeTouchIdentifierRef.current = null
    activeScrollableAncestorsRef.current = []
    sawPendingRef.current = false
    setCompletionPulse(false)
    setThresholdPulse(false)
    commit(resetPull())
  }, [clearTimers, commit, detachGlobalTouchStart, detachTouchMove])

  const settle = useCallback((completed = false) => {
    detachTouchMove()
    detachGlobalTouchStart()
    activeTouchIdentifierRef.current = null
    activeScrollableAncestorsRef.current = []
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current)
      completionTimerRef.current = null
    }
    if (failSafeTimerRef.current !== null) {
      window.clearTimeout(failSafeTimerRef.current)
      failSafeTimerRef.current = null
    }

    setCompletionPulse(completed)
    commit(cancelPull(gestureRef.current))
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current)
    }
    settleTimerRef.current = window.setTimeout(() => {
      commit(resetPull())
      settleTimerRef.current = null
    }, SETTLE_MS)
  }, [commit, detachGlobalTouchStart, detachTouchMove])

  const triggerRefresh = useCallback(() => {
    refreshStartedAtRef.current = performance.now()
    sawPendingRef.current = false
    failSafeTimerRef.current = window.setTimeout(
      () => settle(false),
      REFRESH_FAIL_SAFE_MS,
    )
    startTransition(() => {
      router.refresh()
    })
  }, [router, settle])

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 1023px) and (pointer: coarse)')
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      setEnabled(mobileQuery.matches)
      setReducedMotion(motionQuery.matches)
    }

    sync()
    mobileQuery.addEventListener('change', sync)
    motionQuery.addEventListener('change', sync)
    return () => {
      mobileQuery.removeEventListener('change', sync)
      motionQuery.removeEventListener('change', sync)
    }
  }, [])

  useEffect(() => {
    if (transitionPending) {
      sawPendingRef.current = true
      return
    }
    if (gesture.phase !== 'refreshing' || !sawPendingRef.current) return

    const elapsed = performance.now() - refreshStartedAtRef.current
    completionTimerRef.current = window.setTimeout(
      () => settle(true),
      Math.max(0, MIN_REFRESH_MS - elapsed),
    )
    return () => {
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current)
        completionTimerRef.current = null
      }
    }
  }, [gesture.phase, settle, transitionPending])

  useEffect(() => {
    reset()
  }, [pathname, reset])

  useEffect(() => {
    if (!enabled) reset()
  }, [enabled, reset])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const scheduleIdle = () => {
      detachTouchMove()
      detachGlobalTouchStart()
      activeTouchIdentifierRef.current = null
      activeScrollableAncestorsRef.current = []
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current)
      }
      settleTimerRef.current = window.setTimeout(() => {
        commit(resetPull())
        settleTimerRef.current = null
      }, SETTLE_MS)
    }

    const cancelActiveGesture = () => {
      const current = gestureRef.current
      if (current.phase !== 'pulling' && current.phase !== 'armed') return
      commit(cancelPull(current))
      scheduleIdle()
    }

    const handleGlobalTouchStart = (event: TouchEvent) => {
      const current = gestureRef.current
      if (current.phase !== 'pulling' && current.phase !== 'armed') return
      const activeIdentifier = activeTouchIdentifierRef.current
      const activeTouchRemains = Array.from(event.touches).some(
        touch => touch.identifier === activeIdentifier,
      )
      if (event.touches.length !== 1 || !activeTouchRemains) {
        cancelActiveGesture()
      }
    }

    const attachGlobalTouchStart = () => {
      if (removeGlobalTouchStartListenerRef.current) return
      window.addEventListener('touchstart', handleGlobalTouchStart, { passive: true })
      removeGlobalTouchStartListenerRef.current = () => {
        window.removeEventListener('touchstart', handleGlobalTouchStart)
      }
    }

    const handleTouchMove = (event: TouchEvent) => {
      const current = gestureRef.current
      if (current.phase !== 'pulling' && current.phase !== 'armed') return
      const activeIdentifier = activeTouchIdentifierRef.current
      const touch = Array.from(event.touches).find(
        candidate => candidate.identifier === activeIdentifier,
      )
      if (event.touches.length !== 1 || !touch) {
        cancelActiveGesture()
        return
      }
      if (!areScrollableAncestorsAtTop(activeScrollableAncestorsRef.current)) {
        cancelActiveGesture()
        return
      }

      const next = updatePull(current, { x: touch.clientX, y: touch.clientY })

      if (next.phase === 'settling') {
        commit(next)
        scheduleIdle()
        return
      }
      if (next.rawDistance > 0) event.preventDefault()
      if (!current.thresholdAnnounced && next.thresholdAnnounced) {
        startThresholdPulse()
        void hapticImpact('medium')
      }
      commit(next)
    }

    const attachTouchMove = () => {
      if (removeTouchMoveListenerRef.current) return
      viewport.addEventListener('touchmove', handleTouchMove, { passive: false })
      removeTouchMoveListenerRef.current = () => {
        viewport.removeEventListener('touchmove', handleTouchMove)
      }
    }

    const handleTouchStart = (event: TouchEvent) => {
      const current = gestureRef.current
      if (current.phase === 'pulling' || current.phase === 'armed') {
        const activeIdentifier = activeTouchIdentifierRef.current
        const activeTouchRemains = Array.from(event.touches).some(
          touch => touch.identifier === activeIdentifier,
        )
        if (event.touches.length !== 1 || !activeTouchRemains) {
          cancelActiveGesture()
        }
        return
      }
      if (current.phase === 'refreshing' || current.phase === 'settling') return
      const scrollableAncestors = scrollableAncestorsThroughViewport(
        event.target,
        viewport,
      )
      if (!shouldStartPull({
        enabled,
        scrollTop: areScrollableAncestorsAtTop(scrollableAncestors) ? 0 : 1,
        touchCount: event.touches.length,
        disabledTarget: isDisabledTarget(event.target),
      })) return

      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current)
        settleTimerRef.current = null
      }
      if (thresholdPulseTimerRef.current !== null) {
        window.clearTimeout(thresholdPulseTimerRef.current)
        thresholdPulseTimerRef.current = null
      }
      setCompletionPulse(false)
      setThresholdPulse(false)
      const touch = event.touches[0]
      activeTouchIdentifierRef.current = touch.identifier
      activeScrollableAncestorsRef.current = scrollableAncestors
      attachTouchMove()
      attachGlobalTouchStart()
      commit(beginPull({ x: touch.clientX, y: touch.clientY }))
    }

    const handleTouchEnd = (event: TouchEvent) => {
      const current = gestureRef.current
      if (current.phase !== 'pulling' && current.phase !== 'armed') return
      const activeIdentifier = activeTouchIdentifierRef.current
      const activeTouchEnded = Array.from(event.changedTouches).some(
        touch => touch.identifier === activeIdentifier,
      )
      if (event.touches.length > 0 || !activeTouchEnded) {
        cancelActiveGesture()
        return
      }

      detachTouchMove()
      detachGlobalTouchStart()
      activeTouchIdentifierRef.current = null
      activeScrollableAncestorsRef.current = []
      const released = releasePull(current)
      commit(released.state)
      if (released.shouldRefresh) triggerRefresh()
      else scheduleIdle()
    }

    const handleTouchCancel = () => {
      cancelActiveGesture()
    }

    viewport.addEventListener('touchstart', handleTouchStart, { passive: true })
    viewport.addEventListener('touchend', handleTouchEnd, { passive: true })
    viewport.addEventListener('touchcancel', handleTouchCancel, { passive: true })
    return () => {
      detachTouchMove()
      detachGlobalTouchStart()
      activeTouchIdentifierRef.current = null
      activeScrollableAncestorsRef.current = []
      viewport.removeEventListener('touchstart', handleTouchStart)
      viewport.removeEventListener('touchend', handleTouchEnd)
      viewport.removeEventListener('touchcancel', handleTouchCancel)
    }
  }, [
    commit,
    detachGlobalTouchStart,
    detachTouchMove,
    enabled,
    startThresholdPulse,
    triggerRefresh,
    viewportRef,
  ])

  useEffect(() => clearTimers, [clearTimers])

  return {
    phase: gesture.phase,
    progress: pullProgress(gesture),
    visualDistance: gesture.visualDistance,
    reducedMotion,
    completionPulse,
    thresholdPulse,
  }
}

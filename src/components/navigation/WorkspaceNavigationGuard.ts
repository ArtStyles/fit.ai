'use client'

import { useEffect, useRef } from 'react'
import type { Workspace } from '@/lib/coaching/workspace'

export const WORKSPACE_NAVIGATION_INTENT = 'vekira:workspace-navigation-intent'
export const WORKSPACE_NAVIGATION_COMMIT = 'vekira:workspace-navigation-commit'

export type WorkspaceNavigationIntent = {
  workspace: Workspace
  destination: '/dashboard' | '/coach'
}

export function requestWorkspaceNavigation(intent: WorkspaceNavigationIntent): boolean {
  if (typeof window === 'undefined') return true
  return window.dispatchEvent(new CustomEvent(WORKSPACE_NAVIGATION_INTENT, {
    cancelable: true,
    detail: intent,
  }))
}

export function commitWorkspaceNavigation(intent: WorkspaceNavigationIntent): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(WORKSPACE_NAVIGATION_COMMIT, {
    detail: intent,
  }))
}

const HISTORY_GUARD_KEY = '__vekiraTrainerRoutineGuard'

export function useWorkspaceNavigationGuard({
  blocked,
  message,
}: {
  blocked: boolean
  message: string
}) {
  const sequence = useRef(0)

  useEffect(() => {
    if (!blocked) return

    sequence.current += 1
    const guardId = `${Date.now()}:${sequence.current}`
    let bypass = false
    let restoringGuardEntry = false
    const currentState = window.history.state
    window.history.replaceState({
      ...(currentState && typeof currentState === 'object' ? currentState : {}),
      [HISTORY_GUARD_KEY]: guardId,
    }, '', window.location.href)

    const clearGuardMarker = () => {
      const state = window.history.state
      if (
        !state
        || typeof state !== 'object'
        || state[HISTORY_GUARD_KEY] !== guardId
      ) return
      const nextState = { ...state }
      delete nextState[HISTORY_GUARD_KEY]
      window.history.replaceState(nextState, '', window.location.href)
    }
    const confirmDiscard = () => window.confirm(message)
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const guardLink = (event: MouseEvent) => {
      if (
        bypass
        || event.defaultPrevented
        || event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
      ) return
      const target = event.target
      const anchor = target instanceof Element
        ? target.closest<HTMLAnchorElement>('a[href]')
        : null
      if (!anchor || anchor.download || (anchor.target && anchor.target !== '_self')) return
      const destination = new URL(anchor.href, window.location.href)
      const current = new URL(window.location.href)
      if (
        destination.origin !== current.origin
        || (
          destination.pathname === current.pathname
          && destination.search === current.search
        )
      ) return
      if (confirmDiscard()) {
        clearGuardMarker()
        bypass = true
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const guardBack = () => {
      if (bypass) return
      if (restoringGuardEntry) {
        restoringGuardEntry = false
        return
      }
      if (confirmDiscard()) {
        bypass = true
        return
      }
      restoringGuardEntry = true
      window.history.go(1)
    }
    const guardWorkspaceIntent = (event: Event) => {
      if (bypass) return
      if (!confirmDiscard()) event.preventDefault()
    }
    const acceptWorkspaceCommit = () => {
      bypass = true
      clearGuardMarker()
    }

    window.addEventListener('beforeunload', preventUnload)
    document.addEventListener('click', guardLink, true)
    window.addEventListener('popstate', guardBack)
    window.addEventListener(WORKSPACE_NAVIGATION_INTENT, guardWorkspaceIntent)
    window.addEventListener(WORKSPACE_NAVIGATION_COMMIT, acceptWorkspaceCommit)
    return () => {
      window.removeEventListener('beforeunload', preventUnload)
      document.removeEventListener('click', guardLink, true)
      window.removeEventListener('popstate', guardBack)
      window.removeEventListener(WORKSPACE_NAVIGATION_INTENT, guardWorkspaceIntent)
      window.removeEventListener(WORKSPACE_NAVIGATION_COMMIT, acceptWorkspaceCommit)
      if (!bypass) clearGuardMarker()
    }
  }, [blocked, message])
}

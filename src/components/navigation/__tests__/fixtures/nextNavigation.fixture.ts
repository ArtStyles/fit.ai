import { useSyncExternalStore } from 'react'

let pathname = new URLSearchParams(window.location.search).get('pathname') || '/dashboard'
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(listener => listener())

function writeLogicalPath(next: string, mode: 'push' | 'replace') {
  pathname = next
  const query = new URLSearchParams(window.location.search)
  query.set('pathname', next)
  const url = window.location.pathname + '?' + query.toString()
  if (mode === 'push') window.history.pushState({}, '', url)
  else window.history.replaceState({}, '', url)
  notify()
}

window.addEventListener('popstate', () => {
  pathname = new URLSearchParams(window.location.search).get('pathname') || '/dashboard'
  notify()
})

;(window as Window & {
  __SET_LOGICAL_PATHNAME__?: (path: string, mode: 'push' | 'replace') => void
}).__SET_LOGICAL_PATHNAME__ = writeLogicalPath

;(window as Window & {
  __NEXT_LINK_NAVIGATE__?: (href: string) => void
}).__NEXT_LINK_NAVIGATE__ = href => writeLogicalPath(href, 'push')

export function usePathname() {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => pathname,
    () => pathname,
  )
}

export function useRouter() {
  return {
    replace: (href: string) => {
      const state = window as Window & { __WORKSPACE_REPLACES__?: string[] }
      state.__WORKSPACE_REPLACES__ ??= []
      state.__WORKSPACE_REPLACES__.push(href)
      writeLogicalPath(href, 'replace')
    },
    refresh: () => {
      const state = window as Window & { __WORKSPACE_REFRESHES__?: number }
      state.__WORKSPACE_REFRESHES__ = (state.__WORKSPACE_REFRESHES__ ?? 0) + 1
    },
  }
}

export function useRouter() {
  return {
    refresh: () => {
      const browserWindow = window as Window & {
        __PROGRAM_REFRESHES__?: number
        __COACH_REFRESHES__?: number
        __PROGRAM_APPLY_SERVER_STATE__?: () => void
        __COACH_APPLY_SERVER_STATE__?: () => void
        __PROPOSAL_APPLY_SERVER_STATE__?: () => void
      }
      browserWindow.__PROGRAM_REFRESHES__ = (browserWindow.__PROGRAM_REFRESHES__ ?? 0) + 1
      browserWindow.__COACH_REFRESHES__ = (browserWindow.__COACH_REFRESHES__ ?? 0) + 1
      if (new URLSearchParams(window.location.search).get('refresh') !== 'stale') {
        browserWindow.__PROGRAM_APPLY_SERVER_STATE__?.()
        browserWindow.__COACH_APPLY_SERVER_STATE__?.()
        browserWindow.__PROPOSAL_APPLY_SERVER_STATE__?.()
      }
    },
    push: (href: string) => {
      const browserWindow = window as Window & { __PROGRAM_PUSHES__?: string[] }
      browserWindow.__PROGRAM_PUSHES__ ??= []
      browserWindow.__PROGRAM_PUSHES__.push(href)
    },
    replace: (href: string) => {
      const state = window as Window & { __WORKSPACE_REPLACES__?: string[] }
      state.__WORKSPACE_REPLACES__ ??= []
      state.__WORKSPACE_REPLACES__.push(href)
    },
  }
}

export function usePathname() {
  const fixtureSurface = new URLSearchParams(window.location.search).get('surface')
  if (fixtureSurface === 'personal-shell') return '/dashboard'
  if (fixtureSurface === 'directory') return '/trainers'
  if (fixtureSurface === 'public-profile') return '/trainers/ada-entrenadora'
  if (fixtureSurface === 'active-dock') return '/dashboard'
  return '/coach'
}

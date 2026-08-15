export function useRouter() {
  return {
    refresh: () => {
      const browserWindow = window as Window & { __PROGRAM_REFRESHES__?: number; __COACH_REFRESHES__?: number }
      browserWindow.__PROGRAM_REFRESHES__ = (browserWindow.__PROGRAM_REFRESHES__ ?? 0) + 1
      browserWindow.__COACH_REFRESHES__ = (browserWindow.__COACH_REFRESHES__ ?? 0) + 1
    },
    push: () => {},
  }
}

export function usePathname() {
  return '/dashboard'
}

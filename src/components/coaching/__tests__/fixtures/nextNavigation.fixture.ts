export function useRouter() {
  return {
    refresh() {
      const target = window as Window & { __COACH_REFRESHES__?: number }
      target.__COACH_REFRESHES__ = (target.__COACH_REFRESHES__ ?? 0) + 1
    },
  }
}

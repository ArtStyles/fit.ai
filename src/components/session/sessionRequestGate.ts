export interface SessionRequestGate {
  begin: () => number | null
  commit: (token: number, effect: () => void) => boolean
  finish: (token: number) => boolean
  invalidate: () => void
}

export function createSessionRequestGate(): SessionRequestGate {
  let generation = 0
  let activeToken: number | null = null

  return {
    begin() {
      if (activeToken !== null) return null
      activeToken = ++generation
      return activeToken
    },
    commit(token, effect) {
      if (token !== activeToken) return false
      effect()
      return true
    },
    finish(token) {
      if (token !== activeToken) return false
      activeToken = null
      return true
    },
    invalidate() {
      generation += 1
      activeToken = null
    },
  }
}

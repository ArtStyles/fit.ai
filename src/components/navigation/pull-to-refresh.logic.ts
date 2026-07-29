export const PULL_ACTIVATE_DISTANCE = 72
export const PULL_MAX_DISTANCE = 112

const PRE_THRESHOLD_RESISTANCE = 0.58
const POST_THRESHOLD_RESISTANCE = 0.2

export type PullToRefreshPhase =
  | 'idle'
  | 'pulling'
  | 'armed'
  | 'refreshing'
  | 'settling'

export type PullPoint = {
  x: number
  y: number
}

export type PullGestureState = {
  phase: PullToRefreshPhase
  startX: number | null
  startY: number | null
  rawDistance: number
  visualDistance: number
  thresholdAnnounced: boolean
}

export type PullStartContext = {
  enabled: boolean
  scrollTop: number
  touchCount: number
  disabledTarget: boolean
}

export function shouldStartPull(context: PullStartContext): boolean {
  return context.enabled
    && context.scrollTop <= 0
    && context.touchCount === 1
    && !context.disabledTarget
}

export function resetPull(): PullGestureState {
  return {
    phase: 'idle',
    startX: null,
    startY: null,
    rawDistance: 0,
    visualDistance: 0,
    thresholdAnnounced: false,
  }
}

export function beginPull(point: PullPoint): PullGestureState {
  return {
    ...resetPull(),
    phase: 'pulling',
    startX: point.x,
    startY: point.y,
  }
}

function resistedDistance(rawDistance: number): number {
  const thresholdDistance = PULL_ACTIVATE_DISTANCE * PRE_THRESHOLD_RESISTANCE
  const resisted = rawDistance <= PULL_ACTIVATE_DISTANCE
    ? rawDistance * PRE_THRESHOLD_RESISTANCE
    : thresholdDistance
      + (rawDistance - PULL_ACTIVATE_DISTANCE) * POST_THRESHOLD_RESISTANCE

  return Math.min(PULL_MAX_DISTANCE, resisted)
}

export function cancelPull(state: PullGestureState): PullGestureState {
  return {
    ...state,
    phase: 'settling',
    startX: null,
    startY: null,
    rawDistance: 0,
    visualDistance: 0,
  }
}

export function updatePull(
  state: PullGestureState,
  point: PullPoint,
): PullGestureState {
  if (state.startX === null || state.startY === null) return state

  const deltaX = point.x - state.startX
  const deltaY = point.y - state.startY

  if (Math.abs(deltaX) > Math.abs(deltaY)) return cancelPull(state)

  const rawDistance = Math.max(0, deltaY)
  const armed = rawDistance >= PULL_ACTIVATE_DISTANCE

  return {
    ...state,
    phase: armed ? 'armed' : 'pulling',
    rawDistance,
    visualDistance: resistedDistance(rawDistance),
    thresholdAnnounced: state.thresholdAnnounced || armed,
  }
}

export function releasePull(state: PullGestureState): {
  state: PullGestureState
  shouldRefresh: boolean
} {
  if (state.phase === 'armed') {
    return {
      shouldRefresh: true,
      state: {
        ...state,
        phase: 'refreshing',
        startX: null,
        startY: null,
      },
    }
  }

  return {
    shouldRefresh: false,
    state: cancelPull(state),
  }
}

export function pullProgress(state: PullGestureState): number {
  return Math.min(1, state.rawDistance / PULL_ACTIVATE_DISTANCE)
}

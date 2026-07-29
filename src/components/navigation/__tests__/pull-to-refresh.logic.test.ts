import { describe, expect, it } from 'vitest'
import {
  beginPull,
  cancelPull,
  pullProgress,
  releasePull,
  resetPull,
  shouldStartPull,
  updatePull,
} from '../pull-to-refresh.logic'

describe('pull-to-refresh gesture', () => {
  it('arms exactly at 72 raw vertical pixels with resisted visual travel', () => {
    const started = beginPull({ x: 120, y: 100 })
    const below = updatePull(started, { x: 120, y: 171 })
    const armed = updatePull(below, { x: 120, y: 172 })

    expect(below.phase).toBe('pulling')
    expect(below.rawDistance).toBe(71)
    expect(armed.phase).toBe('armed')
    expect(armed.rawDistance).toBe(72)
    expect(armed.visualDistance).toBeCloseTo(41.76, 2)
    expect(pullProgress(armed)).toBe(1)
  })

  it('adds stronger resistance beyond the threshold and caps visual travel', () => {
    const started = beginPull({ x: 100, y: 100 })
    const beyond = updatePull(started, { x: 100, y: 192 })
    const extreme = updatePull(beyond, { x: 100, y: 2_000 })

    expect(beyond.visualDistance).toBeCloseTo(45.76, 2)
    expect(extreme.visualDistance).toBe(112)
  })

  it('cancels a gesture when horizontal travel dominates', () => {
    const started = beginPull({ x: 100, y: 100 })
    const cancelled = updatePull(started, { x: 151, y: 120 })

    expect(cancelled.phase).toBe('settling')
    expect(cancelled.rawDistance).toBe(0)
    expect(cancelled.visualDistance).toBe(0)
  })

  it('does not refresh when released before the threshold', () => {
    const pulling = updatePull(
      beginPull({ x: 100, y: 100 }),
      { x: 100, y: 160 },
    )
    const released = releasePull(pulling)

    expect(released.shouldRefresh).toBe(false)
    expect(released.state.phase).toBe('settling')
  })

  it('refreshes once released from the armed state', () => {
    const armed = updatePull(
      beginPull({ x: 100, y: 100 }),
      { x: 100, y: 180 },
    )
    const released = releasePull(armed)

    expect(released.shouldRefresh).toBe(true)
    expect(released.state.phase).toBe('refreshing')
  })

  it('latches the first threshold crossing for one haptic per gesture', () => {
    const started = beginPull({ x: 100, y: 100 })
    const firstCrossing = updatePull(started, { x: 100, y: 180 })
    const backedOff = updatePull(firstCrossing, { x: 100, y: 150 })
    const crossedAgain = updatePull(backedOff, { x: 100, y: 185 })

    expect(firstCrossing.thresholdAnnounced).toBe(true)
    expect(backedOff.phase).toBe('pulling')
    expect(backedOff.thresholdAnnounced).toBe(true)
    expect(crossedAgain.thresholdAnnounced).toBe(true)
  })

  it('cancels and resets to a reusable idle state', () => {
    const pulling = updatePull(
      beginPull({ x: 100, y: 100 }),
      { x: 100, y: 150 },
    )

    expect(cancelPull(pulling).phase).toBe('settling')
    expect(resetPull()).toEqual({
      phase: 'idle',
      startX: null,
      startY: null,
      rawDistance: 0,
      visualDistance: 0,
      thresholdAnnounced: false,
    })
  })

  it('only starts for one touch at the top on an enabled mobile surface', () => {
    const valid = {
      enabled: true,
      scrollTop: 0,
      touchCount: 1,
      disabledTarget: false,
    }

    expect(shouldStartPull(valid)).toBe(true)
    expect(shouldStartPull({ ...valid, enabled: false })).toBe(false)
    expect(shouldStartPull({ ...valid, scrollTop: 1 })).toBe(false)
    expect(shouldStartPull({ ...valid, touchCount: 2 })).toBe(false)
    expect(shouldStartPull({ ...valid, disabledTarget: true })).toBe(false)
  })
})

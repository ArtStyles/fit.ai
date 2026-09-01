import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildMusicBarPhases, buildMusicWebGeometry } from '../musicVisuals'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('music visual geometry', () => {
  it('builds a stable organic web whose 24 spokes reach the halo bounds and whose 8 rings are curved', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('music geometry must not use the global random source')
    })

    const first = buildMusicWebGeometry(8_137)
    const second = buildMusicWebGeometry(8_137)

    expect(first).toEqual(second)
    expect(first.spokes).toHaveLength(24)
    expect(first.spokes.every(({ x2, y2 }) => (
      x2 === 0 || x2 === 760 || y2 === 0 || y2 === 143
    ))).toBe(true)
    expect(first.rings).toHaveLength(8)
    expect(first.rings.every(({ d }) => d.endsWith(' Z') && (d.match(/ Q /g) ?? []).length === 24)).toBe(true)
    expect(first.rings.filter(({ accent }) => accent)).toHaveLength(2)
  })

  it('creates four deterministic bar phases in the half-open unit interval without global randomness', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('bar phases must not use the global random source')
    })

    const phases = buildMusicBarPhases(8_137)

    expect(phases).toHaveLength(4)
    expect(phases.every(value => value >= 0 && value < 1)).toBe(true)
    expect(buildMusicBarPhases(8_137)).toEqual(phases)
    expect(buildMusicBarPhases(8_138)).not.toEqual(phases)
  })
})

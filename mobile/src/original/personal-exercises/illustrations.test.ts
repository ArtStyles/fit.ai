import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PERSONAL_EXERCISE_ILLUSTRATIONS, getPersonalIllustration } from '@/lib/exercises/personal-illustrations'
import { MUSCLE_GROUPS } from '@/lib/muscles/activity'

describe('bundled personal muscle illustrations', () => {
  it('offers only drawn muscle regions and rejects arbitrary image URLs', () => {
    expect(PERSONAL_EXERCISE_ILLUSTRATIONS).toHaveLength(16)
    expect(new Set(PERSONAL_EXERCISE_ILLUSTRATIONS.map(item => item.id)).size).toBe(16)
    for (const item of PERSONAL_EXERCISE_ILLUSTRATIONS) expect(MUSCLE_GROUPS.some(group => group.id === item.id)).toBe(true)
    expect(getPersonalIllustration('https://example.com/untrusted.svg')).toBeNull()
    expect(getPersonalIllustration('../../secret')).toBeNull()
    expect(getPersonalIllustration('rotator_cuff')).toBeNull()
    expect(getPersonalIllustration(null)).toBeNull()
  })
  it('ships inert local front/back SVG illustrations and retained attribution', () => {
    for (const item of PERSONAL_EXERCISE_ILLUSTRATIONS) {
      const svg = readFileSync(new URL(`../../../../public${item.src}`, import.meta.url), 'utf8')
      expect(svg).toContain(`data-muscle="${item.id}"`)
      expect(svg).toContain('data-view="front"')
      expect(svg).toContain('data-view="back"')
      expect(svg).toContain('data-highlight="true"')
      expect(svg).toContain('MuscleMap')
      expect(svg).not.toMatch(/<script|<foreignObject|onload=|href=/i)
    }
  })
})

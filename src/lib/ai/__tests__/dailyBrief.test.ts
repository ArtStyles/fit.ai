import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  generateDailyBrief,
  type BriefContext,
} from '../mock-briefGenerator'
import type { AppLanguage } from '@/lib/i18n'

type BriefOptions = { locale?: AppLanguage; variantSeed?: number }
const generateLocalizedBrief = generateDailyBrief as unknown as (
  context: BriefContext,
  options?: BriefOptions,
) => string

const base: BriefContext = {
  firstName: 'Alex',
  streak: 0,
  todayWorkout: { name: 'Atlas', exercise_count: 5 },
  isCompletedToday: false,
  progressionCount: 0,
  topRecord: null,
  weekSessions: 1,
  scheduledSessions: 3,
}

const branches: [string, Partial<BriefContext>][] = [
  ['completed', { isCompletedToday: true, streak: 3 }],
  ['rest', { todayWorkout: null, streak: 2 }],
  ['first-week', { weekSessions: 0, topRecord: null }],
  ['progression-with-streak', { progressionCount: 2, streak: 3 }],
  ['progression', { progressionCount: 1 }],
  ['record-with-streak', { topRecord: { exerciseName: 'Sentadilla', maxWeightKg: 80 }, streak: 3 }],
  ['record', { topRecord: { exerciseName: 'Sentadilla', maxWeightKg: 80 } }],
  ['streak', { streak: 2 }],
  ['fallback', {}],
]

const spanishLeak = /\b(sesi[oó]n|hoy|racha|d[ií]as|descanso|m[uú]sculo|ejercicios|peso|progreso|cuerpo|llevas|toca|semana)\b/i
const englishLeak = /\b(today|session|streak|days|rest|muscle|exercises|weight|progress|body|week)\b/i

describe('deterministic daily brief localization', () => {
  for (const [branch, overrides] of branches) {
    it(`renders every ${branch} variant in Spanish and English`, () => {
      const context = { ...base, ...overrides }
      const spanish = [0, 1, 2].map(variantSeed =>
        generateLocalizedBrief(context, { locale: 'es', variantSeed }),
      )
      const english = [0, 1, 2].map(variantSeed =>
        generateLocalizedBrief(context, { locale: 'en', variantSeed }),
      )

      expect(new Set(spanish).size).toBe(3)
      expect(new Set(english).size).toBe(3)
      for (const message of spanish) {
        expect(message).not.toMatch(englishLeak)
      }
      for (const message of english) {
        expect(message).not.toMatch(spanishLeak)
      }
    })
  }

  it('keeps Spanish as the explicit compatibility default', () => {
    expect(generateLocalizedBrief(base, { variantSeed: 0 })).toMatch(spanishLeak)
  })

  it('receives the resolved dashboard language and stable local-day seed', () => {
    const page = readFileSync(
      new URL('../../../app/(app)/dashboard/page.tsx', import.meta.url),
      'utf8',
    )
    expect(page).toContain('locale: language')
    expect(page).toContain('variantSeed: Number(todayStr.slice(-2))')
  })
})

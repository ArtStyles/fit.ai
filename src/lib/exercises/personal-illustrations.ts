import { MUSCLE_GROUPS } from '@/lib/muscles/activity'
import regions from './personal-illustration-regions.json'

/** Region cards show muscle location; they are not exercise technique media. */
export const PERSONAL_EXERCISE_ILLUSTRATIONS = MUSCLE_GROUPS
  .filter(group => Object.hasOwn(regions, group.id))
  .map(({ id, es, en }) => ({ id, es, en, src: `/exercises/personal/${id}.svg` }))

export function getPersonalIllustration(id: unknown) {
  return PERSONAL_EXERCISE_ILLUSTRATIONS.find(item => item.id === id) ?? null
}

export function isPersonalIllustrationSrc(src: unknown): boolean {
  return typeof src === 'string' && PERSONAL_EXERCISE_ILLUSTRATIONS.some(item => item.src === src)
}

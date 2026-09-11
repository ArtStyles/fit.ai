import { MAX_SESSION_DURATION_SECONDS, MAX_SESSION_REPS, MAX_SESSION_WEIGHT_KG } from '@/lib/session/limits'
import type { GoalKind, GoalSet, GoalTarget } from './types'

export const normalizeGoalSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

export function parseGoalTarget(enabled: boolean, kind: GoalKind, weight: string, reps: string, seconds: string, language: 'es' | 'en'): GoalTarget | null {
  if (!enabled) return null
  const numeric = (raw: string, min: number, max: number, integer: boolean, label: string) => {
    const text = raw.trim().replace(',', '.')
    const value = Number(text)
    if (!text || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
      throw new Error(language === 'en' ? `${label}: enter ${integer ? 'a whole number' : 'a number'} between ${min} and ${max}.` : `${label}: introduce ${integer ? 'un entero' : 'un número'} entre ${min} y ${max}.`)
    }
    return value
  }
  return kind === 'duration'
    ? { kind, seconds: numeric(seconds, 1, MAX_SESSION_DURATION_SECONDS, true, language === 'en' ? 'Seconds' : 'Segundos') }
    : { kind, weightKg: numeric(weight, 0, MAX_SESSION_WEIGHT_KG, false, language === 'en' ? 'Weight' : 'Peso'), reps: numeric(reps, 1, MAX_SESSION_REPS, true, language === 'en' ? 'Reps' : 'Repeticiones') }
}

export function formatGoalSet(set: GoalSet, kind: GoalKind, language: 'es' | 'en') {
  const number = (value: number) => new Intl.NumberFormat(language === 'en' ? 'en-US' : 'es-ES', { maximumFractionDigits: 2 }).format(value)
  return kind === 'duration' ? `${number(set.seconds ?? 0)} s` : `${number(set.weightKg)} kg × ${set.reps}`
}

export function formatGoalTarget(target: GoalTarget | null, language: 'es' | 'en') {
  if (!target) return language === 'en' ? 'Following without a target' : 'Seguimiento sin meta'
  return target.kind === 'duration' ? `${target.seconds} s ${language === 'en' ? 'per set' : 'por serie'}` : `${target.weightKg} kg × ${target.reps}`
}

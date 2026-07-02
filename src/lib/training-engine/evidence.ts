import type { FitnessLevel, TrainingGoal } from './types'

export const ENGINE_VERSION = '1.0.0'
export const EVIDENCE_VERSION = '2026.1'

export const EVIDENCE_SOURCES = {
  acsm2026: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/',
  who2020: 'https://www.who.int/publications/i/item/9789240014886',
  strengthNetworkMetaAnalysis: 'https://pubmed.ncbi.nlm.nih.gov/37414459/',
  aerobicWeightLoss: 'https://pubmed.ncbi.nlm.nih.gov/39724371/',
  concurrentTraining: 'https://pubmed.ncbi.nlm.nih.gov/40405489/',
} as const

export interface ResistancePrescription {
  compoundSets: number
  isolationSets: number
  compoundReps: number
  isolationReps: number
  targetRpe: number
  compoundRestSeconds: number
  isolationRestSeconds: number
}

const LEVEL_SET_DELTA: Record<FitnessLevel, number> = {
  beginner: -1,
  intermediate: 0,
  advanced: 0,
}

const BASE_PRESCRIPTIONS: Record<TrainingGoal, ResistancePrescription> = {
  gain_strength: {
    compoundSets: 3,
    isolationSets: 2,
    compoundReps: 5,
    isolationReps: 8,
    targetRpe: 8,
    compoundRestSeconds: 180,
    isolationRestSeconds: 90,
  },
  build_muscle: {
    compoundSets: 3,
    isolationSets: 3,
    compoundReps: 8,
    isolationReps: 12,
    targetRpe: 8,
    compoundRestSeconds: 120,
    isolationRestSeconds: 75,
  },
  lose_weight: {
    compoundSets: 2,
    isolationSets: 2,
    compoundReps: 8,
    isolationReps: 12,
    targetRpe: 7,
    compoundRestSeconds: 90,
    isolationRestSeconds: 60,
  },
  improve_endurance: {
    compoundSets: 2,
    isolationSets: 2,
    compoundReps: 10,
    isolationReps: 12,
    targetRpe: 7,
    compoundRestSeconds: 90,
    isolationRestSeconds: 60,
  },
  stay_active: {
    compoundSets: 2,
    isolationSets: 2,
    compoundReps: 10,
    isolationReps: 12,
    targetRpe: 7,
    compoundRestSeconds: 90,
    isolationRestSeconds: 60,
  },
}

export function getResistancePrescription(
  goal: TrainingGoal,
  level: FitnessLevel,
): ResistancePrescription {
  const base = BASE_PRESCRIPTIONS[goal]
  const delta = LEVEL_SET_DELTA[level]
  return {
    ...base,
    compoundSets: Math.max(2, base.compoundSets + delta),
    isolationSets: Math.max(2, base.isolationSets + delta),
    targetRpe: level === 'beginner' ? Math.min(7, base.targetRpe) : base.targetRpe,
  }
}

export const RULE_IDS = {
  progressiveResistance: 'ACSM-2026-PROGRESSIVE-RT',
  strengthLoad: 'ACSM-2026-STRENGTH-HIGH-LOAD',
  multiSet: 'ACSM-2026-MULTISET',
  exerciseOrder: 'ACSM-2026-LARGE-MUSCLE-FIRST',
  hypertrophyVolume: 'ACSM-2026-HYPERTROPHY-VOLUME',
  avoidFailure: 'ACSM-2026-NO-FAILURE-REQUIRED',
  weeklyActivity: 'WHO-2020-WEEKLY-ACTIVITY',
  concurrentWeightLoss: 'CT-2025-FAT-MASS-LEAN-MASS',
  adaptiveRegeneration: 'FITAI-ADAPTIVE-REGEN-1',
} as const


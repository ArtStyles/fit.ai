export { generateEvidencePlan, regenerateEvidencePlan } from './generator'
export { validateGeneratedPlan, estimateDayMinutes } from './validator'
export { previewPlanAdjustment, diffPlans } from './adjustments'
export { carryForwardProgression, findStalledExerciseIds } from './continuity'
export { getReadinessReviewStatus, validateReadiness, prohibitedMovementTags } from './safety'
export type { ReadinessReviewAssessment } from './safety'
export { calculatePlanQualityMetrics } from './metrics'
export {
  ENGINE_VERSION,
  EVIDENCE_VERSION,
  EVIDENCE_SOURCES,
  RULE_IDS,
  getResistanceExerciseTarget,
  getWeeklySetTarget,
} from './evidence'
export type * from './types'
export type { ExerciseProgressHistoryEntry } from './continuity'

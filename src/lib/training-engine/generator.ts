import {
  ENGINE_VERSION,
  EVIDENCE_VERSION,
  RULE_IDS,
  getResistancePrescription,
} from './evidence'
import { prohibitedMovementTags, validateReadiness } from './safety'
import { estimateDayMinutes, validateGeneratedPlan } from './validator'
import { carryForwardProgression } from './continuity'
import type {
  CardioModality,
  EngineExercise,
  EngineMetadata,
  EngineResult,
  EvidencePlan,
  MovementPattern,
  PlanDay,
  PlanExercise,
  RegenerationHistory,
  TrainingGoal,
  TrainingPlanInput,
} from './types'

type SessionKind = 'strength' | 'cardio' | 'mixed'

interface SessionTemplate {
  kind: SessionKind
  patterns: MovementPattern[]
  nameEs: string
  nameEn: string
  focusEs: string
  focusEn: string
}

interface DoseModifier {
  volumeMultiplier: number
  rpeDelta: number
  deload: boolean
  warnings: string[]
}

const FULL_BODY_PATTERNS: MovementPattern[] = [
  'squat',
  'hinge',
  'horizontal_push',
  'horizontal_pull',
  'vertical_push',
  'vertical_pull',
  'core',
]

const UPPER_PATTERNS: MovementPattern[] = [
  'horizontal_push',
  'horizontal_pull',
  'vertical_push',
  'vertical_pull',
  'isolation',
]

const LOWER_PATTERNS: MovementPattern[] = ['squat', 'hinge', 'core', 'isolation']

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function strengthTemplates(days: number): SessionTemplate[] {
  const fullBody = (suffix: string): SessionTemplate => ({
    kind: 'strength',
    patterns: FULL_BODY_PATTERNS,
    nameEs: `Cuerpo completo ${suffix}`,
    nameEn: `Full body ${suffix}`,
    focusEs: 'Fuerza de cuerpo completo',
    focusEn: 'Full-body strength',
  })

  if (days <= 3) return Array.from({ length: days }, (_, index) => fullBody(String.fromCharCode(65 + index)))

  if (days === 4) {
    return [
      { kind: 'strength', patterns: UPPER_PATTERNS, nameEs: 'Tren superior A', nameEn: 'Upper body A', focusEs: 'Empuje y tirón', focusEn: 'Push and pull' },
      { kind: 'strength', patterns: LOWER_PATTERNS, nameEs: 'Tren inferior A', nameEn: 'Lower body A', focusEs: 'Piernas y core', focusEn: 'Legs and core' },
      { kind: 'strength', patterns: UPPER_PATTERNS, nameEs: 'Tren superior B', nameEn: 'Upper body B', focusEs: 'Espalda, pecho y hombros', focusEn: 'Back, chest and shoulders' },
      { kind: 'strength', patterns: LOWER_PATTERNS, nameEs: 'Tren inferior B', nameEn: 'Lower body B', focusEs: 'Piernas, cadera y core', focusEn: 'Legs, hips and core' },
    ]
  }

  const ppl: SessionTemplate[] = [
    { kind: 'strength', patterns: ['horizontal_push', 'vertical_push', 'isolation'], nameEs: 'Empuje A', nameEn: 'Push A', focusEs: 'Pecho, hombros y tríceps', focusEn: 'Chest, shoulders and triceps' },
    { kind: 'strength', patterns: ['horizontal_pull', 'vertical_pull', 'isolation'], nameEs: 'Tirón A', nameEn: 'Pull A', focusEs: 'Espalda y bíceps', focusEn: 'Back and biceps' },
    { kind: 'strength', patterns: LOWER_PATTERNS, nameEs: 'Piernas A', nameEn: 'Legs A', focusEs: 'Piernas y core', focusEn: 'Legs and core' },
    { kind: 'strength', patterns: ['horizontal_push', 'vertical_push', 'isolation'], nameEs: 'Empuje B', nameEn: 'Push B', focusEs: 'Pecho, hombros y tríceps', focusEn: 'Chest, shoulders and triceps' },
    { kind: 'strength', patterns: ['horizontal_pull', 'vertical_pull', 'isolation'], nameEs: 'Tirón B', nameEn: 'Pull B', focusEs: 'Espalda y bíceps', focusEn: 'Back and biceps' },
    { kind: 'strength', patterns: LOWER_PATTERNS, nameEs: 'Piernas B', nameEn: 'Legs B', focusEs: 'Piernas, cadera y core', focusEn: 'Legs, hips and core' },
  ]
  return ppl.slice(0, days)
}

function cardioTemplate(index: number, mixed = false): SessionTemplate {
  return {
    kind: mixed ? 'mixed' : 'cardio',
    patterns: mixed ? FULL_BODY_PATTERNS : ['locomotion'],
    nameEs: mixed ? `Fuerza + cardio ${index + 1}` : `Cardio ${index + 1}`,
    nameEn: mixed ? `Strength + cardio ${index + 1}` : `Cardio ${index + 1}`,
    focusEs: mixed ? 'Fuerza general y capacidad aeróbica' : 'Capacidad aeróbica',
    focusEn: mixed ? 'General strength and aerobic capacity' : 'Aerobic capacity',
  }
}

function sessionKinds(goal: TrainingGoal, days: number): SessionKind[] {
  if (goal === 'gain_strength' || goal === 'build_muscle') return Array(days).fill('strength')
  if (days === 2) return ['mixed', 'mixed']

  if (goal === 'improve_endurance') {
    const layouts: Record<number, SessionKind[]> = {
      3: ['cardio', 'strength', 'cardio'],
      4: ['cardio', 'strength', 'cardio', 'cardio'],
      5: ['cardio', 'strength', 'cardio', 'strength', 'cardio'],
      6: ['cardio', 'strength', 'cardio', 'cardio', 'strength', 'cardio'],
    }
    return layouts[days]
  }

  const layouts: Record<number, SessionKind[]> = {
    3: ['strength', 'cardio', 'strength'],
    4: ['strength', 'cardio', 'strength', 'cardio'],
    5: ['strength', 'cardio', 'strength', 'cardio', 'cardio'],
    6: ['strength', 'cardio', 'strength', 'cardio', 'strength', 'cardio'],
  }
  return layouts[days]
}

function buildTemplates(goal: TrainingGoal, days: number): SessionTemplate[] {
  const kinds = sessionKinds(goal, days)
  const resistance = strengthTemplates(kinds.filter(kind => kind === 'strength').length)
  let strengthIndex = 0
  return kinds.map((kind, index) => {
    if (kind === 'strength') return resistance[strengthIndex++]
    return cardioTemplate(index, kind === 'mixed')
  })
}

function previousExerciseIds(input: TrainingPlanInput): Set<string> {
  return new Set(
    input.previousPlan?.plan.days.flatMap(day => day.exercises.map(exercise => exercise.exercise_id)) ?? [],
  )
}

function scoreExercise(
  exercise: EngineExercise,
  pattern: MovementPattern,
  input: TrainingPlanInput,
  dayIndex: number,
  usageCount: Map<string, number>,
): number {
  let score = 0
  if (exercise.movementPatterns.includes(pattern)) score += 80
  if (exercise.isCompound && pattern !== 'isolation' && pattern !== 'core') score += 20
  if (previousExerciseIds(input).has(exercise.id)) score += 30
  if (exercise.difficulty === input.profile.fitnessLevel) score += 10
  if (exercise.difficulty === 'advanced' && input.profile.fitnessLevel === 'beginner') score -= 40
  score -= (usageCount.get(exercise.id) ?? 0) * 12
  score -= stableHash(`${input.seed}:${dayIndex}:${pattern}:${exercise.id}`) / 0xffffffff
  return score
}

function eligibleExercises(input: TrainingPlanInput, type: 'strength' | 'cardio'): EngineExercise[] {
  const prohibited = prohibitedMovementTags(input.profile)
  return input.exercises.filter(exercise => {
    if (type === 'strength' && exercise.exerciseType !== 'strength') return false
    if (type === 'cardio' && exercise.exerciseType !== 'cardio' && exercise.exerciseType !== 'hiit') return false
    if (type === 'strength' && exercise.movementPatterns.length === 0) return false
    if (type === 'cardio' && exercise.cardioModality === null) return false
    const tags = [...exercise.movementPatterns, ...exercise.jointStressTags].map(tag => tag.toLowerCase())
    if (tags.some(tag => prohibited.has(tag))) return false
    if (input.profile.readiness.status === 'modified' && exercise.impactLevel === 'high') return false
    return true
  })
}

function doseModifier(history: RegenerationHistory | null | undefined): DoseModifier {
  if (!history) return { volumeMultiplier: 1, rpeDelta: 0, deload: false, warnings: [] }

  const deload =
    history.stalledExerciseIds.length >= 3 ||
    (history.avgRpe !== null && history.avgRpe >= 8.5 && history.adherenceRatio < 0.75)

  if (deload) {
    return {
      volumeMultiplier: 0.7,
      rpeDelta: -2,
      deload: true,
      warnings: ['Se aplicó una descarga por fatiga o estancamiento observados.'],
    }
  }

  if (history.adherenceRatio < 0.6 || (history.avgRpe !== null && history.avgRpe >= 8.5)) {
    return {
      volumeMultiplier: 0.85,
      rpeDelta: -1,
      deload: false,
      warnings: ['Se redujo la dosis para mejorar recuperación y adherencia.'],
    }
  }

  return { volumeMultiplier: 1, rpeDelta: 0, deload: false, warnings: [] }
}

function prescribeStrengthExercise(
  exercise: EngineExercise,
  input: TrainingPlanInput,
  modifier: DoseModifier,
): PlanExercise {
  const prescription = getResistancePrescription(input.profile.primaryGoal, input.profile.fitnessLevel)
  const baseSets = exercise.isCompound ? prescription.compoundSets : prescription.isolationSets
  return {
    exercise_id: exercise.id,
    sets: Math.max(1, Math.round(baseSets * modifier.volumeMultiplier)),
    reps: exercise.isCompound ? prescription.compoundReps : prescription.isolationReps,
    duration_seconds: null,
    rest_seconds: exercise.isCompound ? prescription.compoundRestSeconds : prescription.isolationRestSeconds,
    target_rpe: Math.min(modifier.deload ? 6 : 9, Math.max(5, prescription.targetRpe + modifier.rpeDelta)),
    weight_kg: null,
    weight_suggestion_basis: 'user_baseline_pending',
    notes: null,
  }
}

function pickStrength(
  template: SessionTemplate,
  input: TrainingPlanInput,
  dayIndex: number,
  minuteBudget: number,
  usageCount: Map<string, number>,
  modifier: DoseModifier,
): PlanExercise[] {
  const pool = eligibleExercises(input, 'strength')
  const selected: PlanExercise[] = []
  const used = new Set<string>()

  for (const pattern of template.patterns) {
    const candidate = pool
      .filter(exercise => !used.has(exercise.id) && exercise.movementPatterns.includes(pattern))
      .sort((a, b) => scoreExercise(b, pattern, input, dayIndex, usageCount) - scoreExercise(a, pattern, input, dayIndex, usageCount))[0]
    if (!candidate) continue

    const prescription = prescribeStrengthExercise(candidate, input, modifier)
    const trialDay: PlanDay = { day_number: dayIndex + 1, display_name: '', focus: '', exercises: [...selected, prescription] }
    if (selected.length >= 2 && estimateDayMinutes(trialDay) > minuteBudget) continue

    selected.push(prescription)
    used.add(candidate.id)
    usageCount.set(candidate.id, (usageCount.get(candidate.id) ?? 0) + 1)
  }

  return selected
}

function pickCardio(
  input: TrainingPlanInput,
  dayIndex: number,
  minuteBudget: number,
  usageCount: Map<string, number>,
): PlanExercise | null {
  const preferences = input.profile.cardioPreferences.length > 0
    ? input.profile.cardioPreferences
    : ['walking' as CardioModality]
  const candidate = eligibleExercises(input, 'cardio')
    .filter(exercise => exercise.cardioModality && preferences.includes(exercise.cardioModality))
    .sort((a, b) => {
      const scoreA = (preferences.indexOf(a.cardioModality!) * -20) - (usageCount.get(a.id) ?? 0) * 10 - stableHash(`${input.seed}:${dayIndex}:${a.id}`) / 0xffffffff
      const scoreB = (preferences.indexOf(b.cardioModality!) * -20) - (usageCount.get(b.id) ?? 0) * 10 - stableHash(`${input.seed}:${dayIndex}:${b.id}`) / 0xffffffff
      return scoreB - scoreA
    })[0]

  if (!candidate) return null
  usageCount.set(candidate.id, (usageCount.get(candidate.id) ?? 0) + 1)
  return {
    exercise_id: candidate.id,
    sets: 1,
    reps: null,
    duration_seconds: Math.max(5, minuteBudget) * 60,
    rest_seconds: 0,
    target_rpe: input.profile.fitnessLevel === 'beginner' ? 4 : 5,
    weight_kg: null,
    weight_suggestion_basis: 'user_baseline_pending',
    notes: input.profile.language === 'en'
      ? 'Maintain a pace that still allows short sentences.'
      : 'Mantén un ritmo que todavía permita decir frases cortas.',
  }
}

function localizedName(template: SessionTemplate, language: 'es' | 'en'): string {
  return language === 'en' ? template.nameEn : template.nameEs
}

function localizedFocus(template: SessionTemplate, language: 'es' | 'en'): string {
  return language === 'en' ? template.focusEn : template.focusEs
}

function goalName(goal: TrainingGoal, language: 'es' | 'en'): string {
  const labels: Record<TrainingGoal, [string, string]> = {
    gain_strength: ['Fuerza', 'Strength'],
    build_muscle: ['Hipertrofia', 'Muscle building'],
    lose_weight: ['Composición corporal', 'Body composition'],
    improve_endurance: ['Resistencia', 'Endurance'],
    stay_active: ['Actividad general', 'General fitness'],
  }
  return language === 'en' ? labels[goal][1] : labels[goal][0]
}

function metadata(appliedRuleIds: string[], warnings: string[]): EngineMetadata {
  return {
    engineVersion: ENGINE_VERSION,
    evidenceVersion: EVIDENCE_VERSION,
    appliedRuleIds: Array.from(new Set(appliedRuleIds)),
    warnings,
    generatedAt: new Date().toISOString(),
  }
}

export function generateEvidencePlan(input: TrainingPlanInput): EngineResult {
  const readinessIssues = validateReadiness(input.profile)
  if (readinessIssues.some(issue => issue.severity === 'error')) {
    return {
      success: false,
      metadata: metadata([], []),
      issues: readinessIssues,
      requiresReadinessReview: true,
    }
  }

  if (input.history?.painReported) {
    const issues = [{
      severity: 'error' as const,
      code: 'PAIN_REQUIRES_REVIEW',
      message: 'Se registró dolor durante la semana. Actualiza el cribado antes de regenerar.',
    }]
    return { success: false, metadata: metadata([], []), issues, requiresReadinessReview: true }
  }

  const templates = buildTemplates(input.profile.primaryGoal, input.profile.daysPerWeek)
  const usageCount = new Map<string, number>()
  const modifier = doseModifier(input.history)
  const warnings = [...modifier.warnings]
  let cardioMinutes = 0

  const days = templates.map((template, dayIndex): PlanDay => {
    const isMixed = template.kind === 'mixed'
    const strengthBudget = template.kind === 'strength'
      ? input.profile.sessionDurationMinutes
      : isMixed ? Math.floor(input.profile.sessionDurationMinutes * 0.55) : 0
    const exercises = strengthBudget > 0
      ? pickStrength(template, input, dayIndex, strengthBudget, usageCount, modifier)
      : []

    if (template.kind === 'cardio' || isMixed) {
      const usedStrengthMinutes = estimateDayMinutes({ day_number: dayIndex + 1, display_name: '', focus: '', exercises })
      const cardioBudget = Math.max(5, input.profile.sessionDurationMinutes - usedStrengthMinutes)
      const cardio = pickCardio(input, dayIndex, cardioBudget, usageCount)
      if (cardio) {
        exercises.push(cardio)
        cardioMinutes += (cardio.duration_seconds ?? 0) / 60
      } else {
        warnings.push(input.profile.language === 'en'
          ? `Day ${dayIndex + 1}: no compatible preferred cardio modality was found.`
          : `Día ${dayIndex + 1}: no se encontró una modalidad cardiovascular preferida compatible.`)
      }
    }

    return {
      day_number: dayIndex + 1,
      display_name: localizedName(template, input.profile.language),
      focus: localizedFocus(template, input.profile.language),
      exercises,
    }
  })

  if (
    ['lose_weight', 'improve_endurance', 'stay_active'].includes(input.profile.primaryGoal) &&
    cardioMinutes < 150
  ) {
    warnings.push(input.profile.language === 'en'
      ? `The scheduled plan includes ${Math.round(cardioMinutes)} aerobic minutes; general guidance recommends progressing toward at least 150 weekly minutes.`
      : `El plan programado incluye ${Math.round(cardioMinutes)} minutos aeróbicos; la recomendación general es progresar hacia al menos 150 minutos semanales.`)
  }

  const week = input.weekNumber ?? 1
  const generatedPlan: EvidencePlan = {
    display_name: input.profile.language === 'en'
      ? `${goalName(input.profile.primaryGoal, 'en')} · Week ${week}`
      : `${goalName(input.profile.primaryGoal, 'es')} · Semana ${week}`,
    ai_notes: [
      input.profile.language === 'en'
        ? `Evidence-based plan adapted to ${input.profile.daysPerWeek} training days.`
        : `Plan basado en evidencia adaptado a ${input.profile.daysPerWeek} días de entrenamiento.`,
      ...warnings,
    ].join(' '),
    days,
  }

  const plan = input.previousPlan
    ? carryForwardProgression(generatedPlan, input.previousPlan.plan)
    : generatedPlan

  const issues = validateGeneratedPlan(plan, input)
  const appliedRules = [
    RULE_IDS.progressiveResistance,
    RULE_IDS.multiSet,
    RULE_IDS.exerciseOrder,
    RULE_IDS.avoidFailure,
    ...(input.profile.primaryGoal === 'gain_strength' ? [RULE_IDS.strengthLoad] : []),
    ...(input.profile.primaryGoal === 'build_muscle' ? [RULE_IDS.hypertrophyVolume] : []),
    ...(['lose_weight', 'improve_endurance', 'stay_active'].includes(input.profile.primaryGoal) ? [RULE_IDS.weeklyActivity] : []),
    ...(input.profile.primaryGoal === 'lose_weight' ? [RULE_IDS.concurrentWeightLoss] : []),
    ...(input.history ? [RULE_IDS.adaptiveRegeneration] : []),
    ...(input.previousPlan ? [RULE_IDS.progressionContinuity] : []),
  ]

  return {
    success: !issues.some(issue => issue.severity === 'error'),
    plan,
    metadata: metadata(appliedRules, warnings),
    issues,
  }
}

export function regenerateEvidencePlan(input: TrainingPlanInput): EngineResult {
  return generateEvidencePlan(input)
}

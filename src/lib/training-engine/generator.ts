import {
  ENGINE_VERSION,
  EVIDENCE_VERSION,
  RULE_IDS,
  getResistanceExerciseTarget,
  getResistancePrescription,
} from './evidence'
import { prohibitedMovementTags, validateReadiness } from './safety'
import { estimateDayMinutes, validateGeneratedPlan } from './validator'
import { carryForwardProgression } from './continuity'
import { calculatePlanQualityMetrics } from './metrics'
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
  slots: ExerciseSlot[]
  nameEs: string
  nameEn: string
  focusEs: string
  focusEn: string
}

interface ExerciseSlot {
  pattern: MovementPattern
  preferredMuscles?: string[]
  preferCompound?: boolean
}

interface DoseModifier {
  volumeMultiplier: number
  rpeDelta: number
  deload: boolean
  warnings: string[]
}

const FULL_BODY_SLOTS: ExerciseSlot[] = [
  { pattern: 'squat', preferredMuscles: ['quadriceps', 'glutes'], preferCompound: true },
  { pattern: 'hinge', preferredMuscles: ['hamstrings', 'glutes'], preferCompound: true },
  { pattern: 'horizontal_push', preferredMuscles: ['chest'], preferCompound: true },
  { pattern: 'horizontal_pull', preferredMuscles: ['middle back', 'lats'], preferCompound: true },
  { pattern: 'vertical_push', preferredMuscles: ['shoulders'], preferCompound: true },
  { pattern: 'vertical_pull', preferredMuscles: ['lats'], preferCompound: true },
  { pattern: 'core', preferredMuscles: ['abdominals'] },
  { pattern: 'isolation', preferredMuscles: ['biceps', 'triceps'] },
  { pattern: 'isolation', preferredMuscles: ['calves'] },
]

const UPPER_SLOTS: ExerciseSlot[] = [
  { pattern: 'horizontal_push', preferredMuscles: ['chest'], preferCompound: true },
  { pattern: 'horizontal_pull', preferredMuscles: ['middle back', 'lats'], preferCompound: true },
  { pattern: 'vertical_push', preferredMuscles: ['shoulders'], preferCompound: true },
  { pattern: 'vertical_pull', preferredMuscles: ['lats'], preferCompound: true },
  { pattern: 'horizontal_push', preferredMuscles: ['chest'], preferCompound: false },
  { pattern: 'isolation', preferredMuscles: ['biceps'] },
  { pattern: 'isolation', preferredMuscles: ['triceps'] },
  { pattern: 'vertical_push', preferredMuscles: ['shoulders'], preferCompound: false },
]

const LOWER_SLOTS: ExerciseSlot[] = [
  { pattern: 'squat', preferredMuscles: ['quadriceps'], preferCompound: true },
  { pattern: 'hinge', preferredMuscles: ['hamstrings', 'glutes'], preferCompound: true },
  { pattern: 'squat', preferredMuscles: ['glutes'], preferCompound: true },
  { pattern: 'squat', preferredMuscles: ['quadriceps'], preferCompound: false },
  { pattern: 'core', preferredMuscles: ['abdominals'] },
  { pattern: 'hinge', preferredMuscles: ['hamstrings'], preferCompound: false },
  { pattern: 'hinge', preferredMuscles: ['glutes'], preferCompound: false },
  { pattern: 'isolation', preferredMuscles: ['calves'] },
]

const PUSH_SLOTS: ExerciseSlot[] = [
  { pattern: 'horizontal_push', preferredMuscles: ['chest'], preferCompound: true },
  { pattern: 'vertical_push', preferredMuscles: ['shoulders'], preferCompound: true },
  { pattern: 'horizontal_push', preferredMuscles: ['triceps'], preferCompound: true },
  { pattern: 'horizontal_push', preferredMuscles: ['chest'], preferCompound: false },
  { pattern: 'vertical_push', preferredMuscles: ['shoulders'], preferCompound: false },
  { pattern: 'isolation', preferredMuscles: ['triceps'] },
]

const PULL_SLOTS: ExerciseSlot[] = [
  { pattern: 'horizontal_pull', preferredMuscles: ['middle back', 'traps'], preferCompound: true },
  { pattern: 'vertical_pull', preferredMuscles: ['lats'], preferCompound: true },
  { pattern: 'horizontal_pull', preferredMuscles: ['lats'], preferCompound: true },
  { pattern: 'isolation', preferredMuscles: ['biceps'] },
  { pattern: 'isolation', preferredMuscles: ['forearms'] },
  { pattern: 'horizontal_pull', preferredMuscles: ['shoulders'], preferCompound: false },
]

const CARDIO_ACCESSORY_SLOTS: ExerciseSlot[] = [
  { pattern: 'core', preferredMuscles: ['abdominals'] },
  { pattern: 'isolation', preferredMuscles: ['glutes', 'calves'] },
]

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
    slots: FULL_BODY_SLOTS,
    nameEs: `Cuerpo completo ${suffix}`,
    nameEn: `Full body ${suffix}`,
    focusEs: 'Fuerza de cuerpo completo',
    focusEn: 'Full-body strength',
  })

  if (days <= 3) return Array.from({ length: days }, (_, index) => fullBody(String.fromCharCode(65 + index)))

  if (days === 4) {
    return [
      { kind: 'strength', slots: UPPER_SLOTS, nameEs: 'Tren superior A', nameEn: 'Upper body A', focusEs: 'Empuje y tirón', focusEn: 'Push and pull' },
      { kind: 'strength', slots: LOWER_SLOTS, nameEs: 'Tren inferior A', nameEn: 'Lower body A', focusEs: 'Piernas y core', focusEn: 'Legs and core' },
      { kind: 'strength', slots: UPPER_SLOTS, nameEs: 'Tren superior B', nameEn: 'Upper body B', focusEs: 'Espalda, pecho y hombros', focusEn: 'Back, chest and shoulders' },
      { kind: 'strength', slots: LOWER_SLOTS, nameEs: 'Tren inferior B', nameEn: 'Lower body B', focusEs: 'Piernas, cadera y core', focusEn: 'Legs, hips and core' },
    ]
  }

  if (days === 5) {
    return [
      { kind: 'strength', slots: UPPER_SLOTS, nameEs: 'Tren superior A', nameEn: 'Upper body A', focusEs: 'Pecho, espalda y hombros', focusEn: 'Chest, back and shoulders' },
      { kind: 'strength', slots: LOWER_SLOTS, nameEs: 'Tren inferior A', nameEn: 'Lower body A', focusEs: 'Cuádriceps, femorales y glúteos', focusEn: 'Quads, hamstrings and glutes' },
      { kind: 'strength', slots: PUSH_SLOTS, nameEs: 'Empuje', nameEn: 'Push', focusEs: 'Pecho, hombros y tríceps', focusEn: 'Chest, shoulders and triceps' },
      { kind: 'strength', slots: PULL_SLOTS, nameEs: 'Tirón', nameEn: 'Pull', focusEs: 'Espalda y bíceps', focusEn: 'Back and biceps' },
      { kind: 'strength', slots: LOWER_SLOTS, nameEs: 'Tren inferior B', nameEn: 'Lower body B', focusEs: 'Piernas, cadera y core', focusEn: 'Legs, hips and core' },
    ]
  }

  const ppl: SessionTemplate[] = [
    { kind: 'strength', slots: PUSH_SLOTS, nameEs: 'Empuje A', nameEn: 'Push A', focusEs: 'Pecho, hombros y tríceps', focusEn: 'Chest, shoulders and triceps' },
    { kind: 'strength', slots: PULL_SLOTS, nameEs: 'Tirón A', nameEn: 'Pull A', focusEs: 'Espalda y bíceps', focusEn: 'Back and biceps' },
    { kind: 'strength', slots: LOWER_SLOTS, nameEs: 'Piernas A', nameEn: 'Legs A', focusEs: 'Piernas y core', focusEn: 'Legs and core' },
    { kind: 'strength', slots: PUSH_SLOTS, nameEs: 'Empuje B', nameEn: 'Push B', focusEs: 'Pecho, hombros y tríceps', focusEn: 'Chest, shoulders and triceps' },
    { kind: 'strength', slots: PULL_SLOTS, nameEs: 'Tirón B', nameEn: 'Pull B', focusEs: 'Espalda y bíceps', focusEn: 'Back and biceps' },
    { kind: 'strength', slots: LOWER_SLOTS, nameEs: 'Piernas B', nameEn: 'Legs B', focusEs: 'Piernas, cadera y core', focusEn: 'Legs, hips and core' },
  ]
  return ppl.slice(0, days)
}

function cardioTemplate(index: number, mixed = false): SessionTemplate {
  return {
    kind: mixed ? 'mixed' : 'cardio',
    slots: mixed ? FULL_BODY_SLOTS : CARDIO_ACCESSORY_SLOTS,
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
      3: ['mixed', 'cardio', 'mixed'],
      4: ['cardio', 'strength', 'cardio', 'strength'],
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
  slot: ExerciseSlot,
  input: TrainingPlanInput,
  dayIndex: number,
  usageCount: Map<string, number>,
  previousIds: Set<string>,
): number {
  let score = 0
  if (exercise.movementPatterns.includes(slot.pattern)) score += 80
  const muscles = exercise.muscleGroups.map(muscle => muscle.toLowerCase())
  const primaryMuscle = muscles[0]
  if (slot.preferredMuscles?.includes(primaryMuscle)) score += 32
  else if (slot.preferredMuscles?.some(muscle => muscles.includes(muscle))) score += 8
  if (slot.preferCompound === true && exercise.isCompound) score += 18
  if (slot.preferCompound === false && !exercise.isCompound) score += 18
  if (slot.preferCompound === true && !exercise.isCompound) score -= 10
  if (slot.preferCompound === false && exercise.isCompound) score -= 10
  if (previousIds.has(exercise.id)) score += 20
  if (exercise.difficulty === input.profile.fitnessLevel) score += 10
  if (exercise.difficulty === 'advanced' && input.profile.fitnessLevel === 'beginner') score -= 40
  score -= (usageCount.get(exercise.id) ?? 0) * 26
  score -= stableHash(`${input.seed}:${dayIndex}:${slot.pattern}:${exercise.id}`) / 0xffffffff
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
  targetCount: number,
): PlanExercise[] {
  const pool = eligibleExercises(input, 'strength')
  const selected: PlanExercise[] = []
  const used = new Set<string>()
  const previousIds = previousExerciseIds(input)

  for (const slot of template.slots) {
    if (selected.length >= targetCount) break
    const available = pool
      .filter(exercise => !used.has(exercise.id) && exercise.movementPatterns.includes(slot.pattern))
    const preferred = slot.preferredMuscles
      ? available.filter(exercise => slot.preferredMuscles!.includes(exercise.muscleGroups[0]?.toLowerCase()))
      : []
    const candidate = (preferred.length > 0 ? preferred : available)
      .sort((a, b) =>
        scoreExercise(b, slot, input, dayIndex, usageCount, previousIds) -
        scoreExercise(a, slot, input, dayIndex, usageCount, previousIds),
      )[0]
    if (!candidate) continue

    const prescription = prescribeStrengthExercise(candidate, input, modifier)
    const trialDay: PlanDay = { day_number: dayIndex + 1, display_name: '', focus: '', exercises: [...selected, prescription] }
    if (selected.length >= 2 && estimateDayMinutes(trialDay) > minuteBudget + 5) continue

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

function metadata(
  appliedRuleIds: string[],
  warnings: string[],
  quality?: EngineMetadata['quality'],
): EngineMetadata {
  return {
    engineVersion: ENGINE_VERSION,
    evidenceVersion: EVIDENCE_VERSION,
    appliedRuleIds: Array.from(new Set(appliedRuleIds)),
    warnings,
    generatedAt: new Date().toISOString(),
    quality,
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
      : isMixed
        ? Math.floor(input.profile.sessionDurationMinutes * 0.55)
        : Math.min(15, Math.max(8, Math.floor(input.profile.sessionDurationMinutes * 0.2)))
    const strengthTarget = template.kind === 'strength'
      ? getResistanceExerciseTarget(strengthBudget, input.profile.primaryGoal)
      : isMixed
        ? Math.min(4, getResistanceExerciseTarget(strengthBudget, input.profile.primaryGoal))
        : input.profile.sessionDurationMinutes >= 60 ? 2 : 1
    const exercises = strengthBudget > 0
      ? pickStrength(template, input, dayIndex, strengthBudget, usageCount, modifier, strengthTarget)
      : []

    if (template.kind === 'cardio' || isMixed) {
      const usedStrengthMinutes = estimateDayMinutes({ day_number: dayIndex + 1, display_name: '', focus: '', exercises })
      const cardioBudget = Math.max(5, input.profile.sessionDurationMinutes - usedStrengthMinutes)
      const cardio = pickCardio(input, dayIndex, cardioBudget, usageCount)
      if (cardio) {
        if (template.kind === 'cardio') exercises.unshift(cardio)
        else exercises.push(cardio)
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
  const quality = calculatePlanQualityMetrics(plan, input)
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
    RULE_IDS.sessionDensity,
    RULE_IDS.muscleFrequency,
    RULE_IDS.weeklyMuscleVolume,
    ...(['lose_weight', 'improve_endurance', 'stay_active'].includes(input.profile.primaryGoal) ? [RULE_IDS.structuredCardio] : []),
  ]

  return {
    success: !issues.some(issue => issue.severity === 'error'),
    plan,
    metadata: metadata(appliedRules, warnings, quality),
    issues,
  }
}

export function regenerateEvidencePlan(input: TrainingPlanInput): EngineResult {
  return generateEvidencePlan(input)
}

import { getResistanceExerciseTarget, getWeeklySetTarget } from './evidence'
import type {
  EngineExercise,
  EvidencePlan,
  MovementPattern,
  PlanQualityMetrics,
  TrainingPlanInput,
} from './types'

const REQUIRED_PATTERNS: MovementPattern[] = [
  'squat',
  'hinge',
  'horizontal_push',
  'horizontal_pull',
  'vertical_push',
  'vertical_pull',
  'core',
]

const MAJOR_MUSCLE_REGIONS = [
  'chest',
  'back',
  'shoulders',
  'quadriceps',
  'hamstrings',
  'glutes',
  'core',
] as const

function muscleRegion(muscle: string): string | null {
  const value = muscle.trim().toLowerCase()
  if (value === 'chest') return 'chest'
  if (['lats', 'middle back', 'traps', 'lower back'].includes(value)) return 'back'
  if (value === 'shoulders') return 'shoulders'
  if (value === 'quadriceps') return 'quadriceps'
  if (value === 'hamstrings') return 'hamstrings'
  if (['glutes', 'adductors', 'abductors'].includes(value)) return 'glutes'
  if (value === 'abdominals') return 'core'
  if (['biceps', 'triceps', 'forearms'].includes(value)) return 'arms'
  if (value === 'calves') return 'calves'
  return null
}

function exerciseRegions(exercise: EngineExercise): string[] {
  const catalogRegions = Array.from(new Set(exercise.muscleGroups.flatMap(muscle => {
    const region = muscleRegion(muscle)
    return region ? [region] : []
  })))
  if (catalogRegions.length > 0) return catalogRegions

  const regions = new Set<string>()
  const patterns = new Set(exercise.movementPatterns)
  if (patterns.has('squat')) regions.add('quadriceps')
  if (patterns.has('hinge')) {
    regions.add('hamstrings')
    regions.add('glutes')
  }
  if (patterns.has('horizontal_push')) regions.add('chest')
  if (patterns.has('horizontal_pull') || patterns.has('vertical_pull')) regions.add('back')
  if (patterns.has('vertical_push')) regions.add('shoulders')
  if (patterns.has('core')) regions.add('core')

  return Array.from(regions)
}

function primaryExerciseRegion(exercise: EngineExercise): string | null {
  return muscleRegion(exercise.muscleGroups[0] ?? '') ?? exerciseRegions(exercise)[0] ?? null
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function round(value: number, digits = 0): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function calculatePlanQualityMetrics(
  plan: EvidencePlan,
  input: TrainingPlanInput,
): PlanQualityMetrics {
  const exerciseById = new Map(input.exercises.map(exercise => [exercise.id, exercise]))
  const sessionExerciseCounts = plan.days.map(day => day.exercises.length)
  const muscleGroupSets: Record<string, number> = {}
  const muscleDays = new Map<string, Set<number>>()
  const patternDays = new Map<MovementPattern, Set<number>>()
  let weeklyResistanceSets = 0
  let weeklyCardioMinutes = 0

  const densityRatios = plan.days.map((day, dayIndex) => {
    let strengthCount = 0
    let cardioCount = 0
    let cardioMinutes = 0

    for (const prescription of day.exercises) {
      const exercise = exerciseById.get(prescription.exercise_id)
      if (!exercise) continue

      if (exercise.exerciseType === 'cardio' || exercise.exerciseType === 'hiit') {
        cardioCount += 1
        cardioMinutes += (prescription.duration_seconds ?? 0) * prescription.sets / 60
        weeklyCardioMinutes += (prescription.duration_seconds ?? 0) * prescription.sets / 60
        continue
      }

      strengthCount += 1
      weeklyResistanceSets += prescription.sets
      const primaryRegion = primaryExerciseRegion(exercise)
      for (const region of exerciseRegions(exercise)) {
        // Secondary muscles receive partial credit instead of being counted as full direct sets.
        const setCredit = region === primaryRegion ? prescription.sets : prescription.sets * 0.5
        muscleGroupSets[region] = (muscleGroupSets[region] ?? 0) + setCredit
        const days = muscleDays.get(region) ?? new Set<number>()
        days.add(dayIndex)
        muscleDays.set(region, days)
      }
      for (const pattern of exercise.movementPatterns) {
        const days = patternDays.get(pattern) ?? new Set<number>()
        days.add(dayIndex)
        patternDays.set(pattern, days)
      }
    }

    if (cardioCount > 0 && cardioMinutes >= input.profile.sessionDurationMinutes * 0.6) {
      const target = input.profile.sessionDurationMinutes >= 45 ? 2 : 1
      return Math.min(1, day.exercises.length / target)
    }

    const resistanceMinutes = cardioCount > 0
      ? Math.max(20, Math.floor(input.profile.sessionDurationMinutes * 0.55))
      : input.profile.sessionDurationMinutes
    const resistanceTarget = getResistanceExerciseTarget(resistanceMinutes, input.profile.primaryGoal)
    const target = resistanceTarget + (cardioCount > 0 ? 1 : 0)
    return Math.min(1, (strengthCount + cardioCount) / target)
  })

  const prohibited = new Set(
    input.profile.readiness.limitations.flatMap(limitation => limitation.movementsToAvoid)
      .map(value => value.toLowerCase()),
  )
  const safeAvailableExercises = input.exercises.filter(exercise =>
    ![...exercise.movementPatterns, ...exercise.jointStressTags]
      .some(tag => prohibited.has(tag.toLowerCase())),
  )
  const requiredPatterns = REQUIRED_PATTERNS.filter(pattern =>
    !prohibited.has(pattern) && safeAvailableExercises.some(exercise => exercise.movementPatterns.includes(pattern)),
  )
  const movementCoverageScore = requiredPatterns.length > 0
    ? average(requiredPatterns.map(pattern => Math.min(1, (patternDays.get(pattern)?.size ?? 0) / 1)))
    : 1

  const availableRegions = MAJOR_MUSCLE_REGIONS.filter(region =>
    safeAvailableExercises.some(exercise => exerciseRegions(exercise).includes(region)),
  )
  const frequencyTarget = Math.min(2, input.profile.daysPerWeek)
  const lowFrequencyMuscleGroups = availableRegions.filter(
    region => (muscleDays.get(region)?.size ?? 0) < frequencyTarget,
  )
  const muscleFrequencyScore = availableRegions.length > 0
    ? average(availableRegions.map(region => Math.min(1, (muscleDays.get(region)?.size ?? 0) / frequencyTarget)))
    : 1

  const weeklySetTarget = getWeeklySetTarget(input.profile.primaryGoal)
  const underTargetMuscleGroups = availableRegions.filter(
    region => (muscleGroupSets[region] ?? 0) < weeklySetTarget * 0.75,
  )
  const excessiveVolumeMuscleGroups = availableRegions.filter(
    region => (muscleGroupSets[region] ?? 0) > weeklySetTarget * 3,
  )
  const weeklyVolumeScore = availableRegions.length > 0
    ? average(availableRegions.map(region => {
        const sets = muscleGroupSets[region] ?? 0
        if (sets <= weeklySetTarget) return sets / weeklySetTarget
        if (sets <= weeklySetTarget * 3) return 1
        return Math.max(0.5, 1 - (sets - weeklySetTarget * 3) / (weeklySetTarget * 2))
      }))
    : 1
  const sessionDensityScore = average(densityRatios)
  const overallScore = round((
    sessionDensityScore * 0.25 +
    movementCoverageScore * 0.2 +
    muscleFrequencyScore * 0.25 +
    weeklyVolumeScore * 0.3
  ) * 100)

  const flags: string[] = []
  if (sessionDensityScore < 0.8) flags.push('LOW_SESSION_DENSITY')
  if (movementCoverageScore < 0.9) flags.push('LOW_MOVEMENT_COVERAGE')
  if (lowFrequencyMuscleGroups.length > 0) flags.push('LOW_MUSCLE_FREQUENCY')
  if (underTargetMuscleGroups.length > 0) flags.push('LOW_WEEKLY_VOLUME')
  if (excessiveVolumeMuscleGroups.length > 0) flags.push('EXCESSIVE_WEEKLY_VOLUME')

  return {
    overallScore,
    sessionDensityScore: round(sessionDensityScore * 100),
    movementCoverageScore: round(movementCoverageScore * 100),
    muscleFrequencyScore: round(muscleFrequencyScore * 100),
    weeklyVolumeScore: round(weeklyVolumeScore * 100),
    totalExercises: sessionExerciseCounts.reduce((sum, count) => sum + count, 0),
    averageExercisesPerSession: round(average(sessionExerciseCounts), 1),
    weeklyResistanceSets,
    weeklyCardioMinutes: round(weeklyCardioMinutes),
    sessionExerciseCounts,
    muscleGroupSets,
    muscleGroupFrequency: Object.fromEntries(
      Array.from(muscleDays.entries()).map(([region, days]) => [region, days.size]),
    ),
    movementPatternFrequency: Object.fromEntries(
      Array.from(patternDays.entries()).map(([pattern, days]) => [pattern, days.size]),
    ),
    lowFrequencyMuscleGroups,
    underTargetMuscleGroups,
    excessiveVolumeMuscleGroups,
    flags,
  }
}

import type { ExerciseSession } from '../../src/store/sessionStore'
import { buildDashboardViewModel, type DashboardWorkout } from '../../src/components/dashboard/dashboardViewModel'
import type { ProgressExercisePoint, ProgressMeasurement, ProgressRecord, ProgressSession } from '../../src/components/progress/progressViewModel'
import { shiftDateStr, type DayAggregate } from '../../src/lib/calendar/aggregate'

export type DemoLocale = 'es' | 'en'
export const DEMO_TODAY = '2026-09-07'
export const DEMO_NOW = '2026-09-07T13:18:42.000Z'
export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001'
export const DEMO_SESSION_ID = '00000000-0000-4000-8000-000000000002'

/** Entirely fictional, in-memory history. No account or database is involved. */
export function makeDemoData(locale: DemoLocale) {
  const text = (es: string, en: string) => locale === 'es' ? es : en
  const workouts: DashboardWorkout[] = [
    { id: 'demo-upper', name: text('Fuerza · tren superior', 'Strength · upper body'), focus: text('Pecho, espalda y hombros', 'Chest, back and shoulders'), day_of_week: 1, order_in_plan: 1, estimated_duration_minutes: 42, exercise_count: 5, progression_suggestion_count: 1 },
    { id: 'demo-lower', name: text('Fuerza · pierna y core', 'Strength · legs and core'), focus: text('Piernas y abdomen', 'Legs and core'), day_of_week: 3, order_in_plan: 2, estimated_duration_minutes: 45, exercise_count: 5, progression_suggestion_count: 0 },
    { id: 'demo-full', name: text('Fuerza · cuerpo completo', 'Strength · full body'), focus: text('Fuerza y estabilidad', 'Strength and stability'), day_of_week: 5, order_in_plan: 3, estimated_duration_minutes: 40, exercise_count: 5, progression_suggestion_count: 0 },
  ]
  const movementNames = [
    text('Press de banca', 'Bench press'),
    text('Remo sentado', 'Seated row'),
    text('Press militar', 'Overhead press'),
    text('Elevaciones laterales', 'Lateral raises'),
    text('Curl de bíceps', 'Biceps curl'),
  ]
  const benchLoads = [30, 32.5, 32.5, 35, 35, 35, 37.5, 40]
  const squatLoads = [35, 37.5, 40, 42.5, 42.5, 45, 47.5, 50]
  // Four preceding weeks support the real comparison calculation. A lone old
  // session would misleadingly inflate the percentage for the selected range.
  const weeklyVolumes = [
    [2406, 2970, 2370], [2466, 3090, 2450], [2526, 3210, 2530], [2586, 3330, 2610],
    [2826, 3435, 2810], [2826, 3585, 2890], [2946, 3735, 2970], [3006, 3885, 3060],
  ]
  const sessions: ProgressSession[] = []
  const days: DayAggregate[] = []
  const exercisePoints: ProgressExercisePoint[] = []
  for (let week = 0; week < 8; week += 1) {
    for (let workout = 0; workout < 3; workout += 1) {
      const date = shiftDateStr(DEMO_TODAY, -56 + week * 7 + workout * 2)
      const id = `demo-history-${week + 1}-${workout + 1}`
      const volumeKg = weeklyVolumes[week][workout]
      const durationMinutes = [42, 45, 40][workout]
      sessions.push({ id, date, completedAt: `${date}T13:45:00.000Z`, durationMinutes, volumeKg })
      days.push({ date, sessions: 1, volumeKg, durationMin: durationMinutes, logIds: [id] })
      if (workout < 2) {
        const maxWeightKg = workout === 0 ? benchLoads[week] : squatLoads[week]
        exercisePoints.push({
          exerciseId: workout === 0 ? 'demo-bench' : 'demo-squat',
          exerciseName: workout === 0 ? movementNames[0] : text('Sentadilla con barra', 'Barbell squat'),
          date, maxWeightKg, repsAtMaxWeight: 8, volumeKg: maxWeightKg * 8 * 3,
        })
      }
    }
  }
  const records: ProgressRecord[] = [
    { exerciseId: 'demo-bench', exerciseName: movementNames[0], muscleGroups: [text('Pecho', 'Chest')], bestCompletedAt: '2026-08-31T13:45:00.000Z', bestDate: '2026-08-31', maxWeightKg: 40, repsAtMaxWeight: 8, maxReps: 8, totalVolumeKg: 6660, sessionCount: 8 },
    { exerciseId: 'demo-squat', exerciseName: text('Sentadilla con barra', 'Barbell squat'), muscleGroups: [text('Piernas', 'Legs')], bestCompletedAt: '2026-09-02T13:45:00.000Z', bestDate: '2026-09-02', maxWeightKg: 50, repsAtMaxWeight: 8, maxReps: 8, totalVolumeKg: 8160, sessionCount: 8 },
  ]
  const measurements: ProgressMeasurement[] = [72.4, 72.3, 72.2, 72.1].map((weightKg, week) => {
    const recordedDate = shiftDateStr(DEMO_TODAY, -28 + week * 7)
    return { id: `demo-measurement-${week}`, recordedDate, recordedAt: `${recordedDate}T11:00:00.000Z`, weightKg, bodyFatPercentage: null, waistCm: 82 - week * 0.2 }
  })
  const exercises: ExerciseSession[] = movementNames.map((name, index) => {
    const weightKg = [42.5, 35, 20, 6, 10][index]
    const reps = [8, 10, 8, 12, 10][index]
    return {
      workoutExerciseId: `demo-exercise-${index + 1}`, exerciseId: index === 0 ? 'demo-bench' : `demo-movement-${index + 1}`,
      originalExerciseId: null, originalName: null, name,
      imageUrl: index === 0 ? '/exercises/catalog/v1/press-banca-barra/poster.webp' : null,
      instructions: null, muscleGroups: index === 0 ? [text('Pecho', 'Chest')] : [], isCompound: index < 3,
      targetSets: 3, targetReps: reps, targetDuration: null, restSeconds: 90, targetRpe: 7,
      suggestedWeight: index === 0 ? weightKg : null,
      weightSuggestionBasis: index === 0 ? 'based_on_previous_logs' : null,
      notes: null, source: 'planned', skipReason: null,
      sets: Array.from({ length: 3 }, (_, set) => ({ weightKg: String(weightKg), reps: String(reps), rpe: 7, completed: index === 0 && set < 2 })),
      status: index === 0 ? 'active' : 'pending', expanded: index === 0,
      hasLastSessionData: index === 0,
      previousPerformance: index === 0 ? Array.from({ length: 3 }, () => ({ weightKg: 40, reps: 8 })) : null,
    }
  })
  const weekDays = Array.from({ length: 7 }, (_, index) => ({
    isoDay: index + 1, dateStr: shiftDateStr(DEMO_TODAY, index),
    scheduledWorkout: workouts.find(workout => workout.day_of_week === index + 1) ?? null,
    completedEvidence: null, isScheduledWorkoutCompleted: false, hasTrainingEvidence: false,
    canStartScheduledWorkout: index === 0, isToday: index === 0, isRecoverable: false,
  }))
  const latestSession = sessions.at(-1)!
  const dashboard = buildDashboardViewModel({
    needsPlan: false, checkInDue: false, aiNotes: null, promo: null,
    todayWorkout: workouts[0], isCompletedToday: false, hasSessionToday: false,
    nextWorkout: workouts[1], nextWorkoutIsoDay: 3, recoverableWorkout: null, recoverableIsoDay: null,
    weekDays, sessionsThisWeek: 0, scheduledThisWeek: 3, streak: 0, weekVolumeKg: 0,
    volumeSeries: weeklyVolumes.slice(-4).map(volumes => volumes.reduce((sum, volume) => sum + volume, 0)),
    hasCompletedSessions: true, dailyBriefMessage: null,
    latestSession: { id: latestSession.id, workoutName: workouts[2].name, completedAt: latestSession.completedAt, durationMinutes: latestSession.durationMinutes },
    topRecord: { logId: 'demo-history-8-2', exerciseId: 'demo-squat', exerciseName: records[1].exerciseName, maxWeightKg: 50, repsAtMaxWeight: 8 },
    activeAdjustmentCount: 1, timeZone: 'America/Havana', referenceInstant: DEMO_NOW,
  })
  return { workouts, exercises, dashboard, progress: { sessions, days, records, measurements, exercisePoints, todayStr: DEMO_TODAY, locale } }
}

import { describe, expect, it } from 'vitest'
import manifest from '../../../public/exercises/catalog/v1/manifest.json'
import { buildMuscleActivity, buildMuscleBreakdown, type MuscleGroupId } from './activity'
import { buildHistoricalMuscleActivity } from './history'

const reportedSlugs = ['arnold-press-mancuernas', 'press-banca-barra', 'press-frances-tumbado-barra-ez', 'press-inclinado-mancuernas', 'press-militar-pie-barra']
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const muscles = (exercise: typeof manifest.exercises[number]) => [...exercise.primaryMuscles, ...exercise.secondaryMuscles]
const reported = reportedSlugs.map(slug => manifest.exercises.find(exercise => exercise.slug === slug)!)
const counts = (rows: Parameters<typeof buildMuscleActivity>[0]) => Object.fromEntries(buildMuscleActivity(rows).groups.filter(group => group.sets).map(group => [group.id, group.sets]))

describe('catalogue muscle attribution', () => {
  it('reproduces the five reported presses with actual catalog labels, without duplicating deltoid heads', () => {
    expect(reported.every(Boolean)).toBe(true)
    expect(counts(reported.map(exercise => ({ muscleGroups: muscles(exercise), sets: 3 })))).toEqual({
      chest: 6, shoulders: 12, triceps: 15, traps: 3, anconeus: 3,
    })
  })

  it('recognizes every muscle of every bundled exercise so new catalog labels cannot silently disappear', () => {
    expect(manifest.exercises.length).toBeGreaterThan(0)
    for (const exercise of manifest.exercises) {
      for (const label of muscles(exercise)) {
        const activity = buildMuscleActivity([{ muscleGroups: [label], sets: 3 }])
        expect(activity.unmapped, `${exercise.slug}: ${label}`).toEqual([])
        expect(activity.groups.filter(group => group.sets), `${exercise.slug}: ${label}`).toHaveLength(1)
        expect(activity.groups.find(group => group.sets)?.sets).toBe(3)
      }
    }
  })

  it.each([
    ['espalda media', 'back'], ['dorsal ancho', 'back'], ['redondo mayor', 'back'],
    ['trapecio superior', 'traps'], ['trapecio medio', 'traps'], ['traps', 'traps'],
    ['erectores espinales', 'lower_back'], ['cuadrado lumbar', 'lower_back'], ['lower back', 'lower_back'],
    ['manguito rotador', 'rotator_cuff'], ['supraespinoso', 'rotator_cuff'], ['ancóneo', 'anconeus'],
    ['braquial', 'biceps'], ['braquiorradial', 'forearms'], ['glúteo medio', 'glutes'],
    ['gastrocnemio', 'calves'], ['transverso abdominal', 'core'], ['pared abdominal profunda', 'core'],
    ['neck', 'neck'], ['tibialis anterior', 'tibialis'], ['tibial anterior', 'tibialis'],
    ['PÉCTORAL_MAYOR', 'chest'], ['deltoides-anterior', 'shoulders'],
  ])('maps %s to its specific region %s', (label, expected) => {
    expect(counts([{ muscleGroups: [label], sets: 2 }])).toEqual({ [expected]: 2 })
  })

  it('retains broad and unrecognized labels without inventing individual anatomical attribution', () => {
    const activity = buildMuscleActivity([{ muscleGroups: ['espalda', 'piernas', 'músculo nuevo'], sets: 3 }])
    expect(activity.groups.filter(group => group.sets).map(group => group.id)).toEqual(['back'])
    expect(activity.unmapped).toEqual([{ label: 'piernas', sets: 3 }, { label: 'músculo nuevo', sets: 3 }])
  })

  it('repairs display of existing frozen sessions in both languages with identical map and drill-down counts', () => {
    const snapshot = {
      version: 1, workout: { id: uuid(90), name: 'Empuje', focus: null, dayOfWeek: 4 }, plan: null,
      exercises: reported.map((exercise, index) => ({
        exerciseId: uuid(index + 1), name: exercise.nameEn, nameEs: exercise.nameEs,
        muscleGroups: muscles(exercise), muscleGroupsEs: muscles(exercise), isCompound: true,
      })),
    }
    const logs = [{ id: uuid(91), completed_at: '2026-09-11T02:00:00Z', session_context_snapshot: snapshot }]
    const rows = reported.map((_, index) => ({ id: uuid(100 + index), progress_log_id: uuid(91), exercise_id: uuid(index + 1), sets_completed: 3, exercise: null }))
    const original = structuredClone({ rows, logs })
    for (const language of ['es', 'en'] as const) {
      const activity = buildHistoricalMuscleActivity(rows, logs, 'America/Havana', language)
      expect(counts(activity)).toEqual({ chest: 6, shoulders: 12, triceps: 15, traps: 3, anconeus: 3 })
      for (const [group, total, exercises] of [['chest', 6, 2], ['shoulders', 12, 4], ['triceps', 15, 5], ['traps', 3, 1]] as const) {
        const breakdown = buildMuscleBreakdown(activity, group as MuscleGroupId, { from: '2026-09-04', to: '2026-09-10' })
        expect(breakdown.sets).toBe(total)
        expect(breakdown.exercises).toHaveLength(exercises)
        expect(breakdown.exercises.every(exercise => exercise.sessions[0].sessionId === uuid(91))).toBe(true)
      }
      expect(buildMuscleBreakdown(activity, 'chest', { from: '2026-08-28', to: '2026-09-03' }).sets).toBe(0)
    }
    expect({ rows, logs }).toEqual(original)
  })
})

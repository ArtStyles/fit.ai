import { isCivilDate } from '@/lib/workouts/occurrences'

export const MUSCLE_GROUPS = [
  { id: 'chest', es: 'Pecho', en: 'Chest', aliases: [
    'chest', 'pecho', 'pectorales', 'pectoral', 'pectorals', 'pectoral mayor',
    'pectoral mayor porcion clavicular', 'pectoral mayor porcion esternal', 'pectoralis major',
  ] },
  { id: 'back', es: 'Espalda', en: 'Back', aliases: [
    'back', 'espalda', 'lats', 'dorsales', 'dorsal', 'dorsal ancho', 'middle back', 'upper back',
    'espalda media', 'espalda alta', 'latissimus dorsi', 'rhomboids', 'romboides', 'redondo mayor', 'teres major',
  ] },
  { id: 'traps', es: 'Trapecio', en: 'Trapezius', aliases: [
    'traps', 'trapezius', 'trapecio', 'trapecios', 'trapecio superior', 'trapecio medio', 'trapecio inferior',
    'upper trapezius', 'middle trapezius', 'lower trapezius',
  ] },
  { id: 'lower_back', es: 'Zona lumbar', en: 'Lower back', aliases: [
    'lower back', 'espalda baja', 'lumbar', 'lumbares', 'zona lumbar', 'erector spinae', 'erectores espinales',
    'cuadrado lumbar', 'quadratus lumborum',
  ] },
  { id: 'shoulders', es: 'Hombros', en: 'Shoulders', aliases: [
    'shoulders', 'shoulder', 'hombros', 'hombro', 'deltoids', 'deltoid', 'deltoides',
    'deltoides anterior', 'deltoides lateral', 'deltoides posterior', 'anterior deltoid', 'lateral deltoid', 'posterior deltoid',
  ] },
  { id: 'biceps', es: 'Bíceps', en: 'Biceps', aliases: ['biceps', 'biceps brachii', 'biceps braquial', 'braquial', 'brachialis'] },
  { id: 'triceps', es: 'Tríceps', en: 'Triceps', aliases: [
    'triceps', 'triceps brachii', 'triceps braquial', 'triceps braquial cabeza larga', 'triceps cabeza larga', 'triceps long head',
  ] },
  { id: 'forearms', es: 'Antebrazos', en: 'Forearms', aliases: ['forearms', 'forearm', 'antebrazos', 'antebrazo', 'braquiorradial', 'brachioradialis'] },
  { id: 'core', es: 'Abdomen', en: 'Core', aliases: [
    'core', 'abdominals', 'abdominales', 'abdominal', 'abdomen', 'abs', 'obliques', 'oblicuos', 'serratus', 'serrato',
    'serrato anterior', 'recto abdominal', 'pared abdominal profunda', 'transverso abdominal', 'rectus abdominis', 'transversus abdominis',
  ] },
  { id: 'glutes', es: 'Glúteos', en: 'Glutes', aliases: ['glutes', 'gluteal', 'gluteos', 'gluteo', 'gluteo mayor', 'gluteo medio', 'gluteus maximus', 'gluteus medius'] },
  { id: 'quads', es: 'Cuádriceps', en: 'Quadriceps', aliases: ['quadriceps', 'cuadriceps', 'quads'] },
  { id: 'hamstrings', es: 'Isquiotibiales', en: 'Hamstrings', aliases: ['hamstrings', 'hamstring', 'isquiotibiales', 'isquios', 'femorales', 'femoral'] },
  { id: 'calves', es: 'Gemelos', en: 'Calves', aliases: ['calves', 'calf', 'gemelos', 'pantorrillas', 'pantorrilla', 'gastrocnemius', 'gastrocnemio', 'soleus', 'soleo'] },
  { id: 'hips', es: 'Caderas', en: 'Hips', aliases: ['adductors', 'abductors', 'aductores', 'abductores', 'hip flexors', 'flexores de cadera', 'flexores de la cadera', 'hip', 'hips', 'caderas', 'cadera'] },
  { id: 'neck', es: 'Cuello', en: 'Neck', aliases: ['neck', 'cuello'] },
  { id: 'tibialis', es: 'Tibial anterior', en: 'Tibialis anterior', aliases: ['tibialis', 'tibialis anterior', 'tibial anterior'] },
  // These muscles have no individual paths in the illustration but retain their own counts and drill-down.
  { id: 'rotator_cuff', es: 'Manguito rotador', en: 'Rotator cuff', aliases: ['manguito rotador', 'rotator cuff', 'supraespinoso', 'supraspinatus'] },
  { id: 'anconeus', es: 'Ancóneo', en: 'Anconeus', aliases: ['anconeo', 'anconeus'] },
] as const

export type MuscleGroupId = (typeof MUSCLE_GROUPS)[number]['id']
export type MuscleActivityInput = {
  muscleGroups: string[]; sets: number; date?: string
  exerciseLogId?: string; exerciseId?: string | null; exerciseName?: string
  sessionId?: string; sessionName?: string; completedAt?: string
}
export type MuscleDateRange = { from: string; to: string }
export type MuscleActivityGroup = { id: MuscleGroupId; es: string; en: string; sets: number; level: number }
export type MuscleBreakdownSession = { sessionId: string; sessionName: string; date: string; sets: number }
export type MuscleBreakdownExercise = { key: string; exerciseId: string | null; exerciseName: string; sets: number; sessions: MuscleBreakdownSession[] }
export type MuscleBreakdown = { sets: number; exercises: MuscleBreakdownExercise[] }

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
const aliases = new Map<string, MuscleGroupId>(MUSCLE_GROUPS.flatMap(group => group.aliases.map(alias => [normalize(alias), group.id] as const)))

type NormalizedActivityRow = {
  row: MuscleActivityInput; index: number; sets: number
  recognized: Set<MuscleGroupId>; unknown: Map<string, string>
}

function activityRows(rows: MuscleActivityInput[], range?: MuscleDateRange): NormalizedActivityRow[] {
  const result: NormalizedActivityRow[] = []
  if (range && (!isCivilDate(range.from) || !isCivilDate(range.to) || range.from > range.to)) return result
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]
    if (row.date !== undefined && !isCivilDate(row.date)) continue
    if (range && (!row.date || row.date < range.from || row.date > range.to)) continue
    if (!Number.isFinite(row.sets) || row.sets <= 0) continue
    const sets = Math.trunc(row.sets)
    if (!sets) continue
    const recognized = new Set<MuscleGroupId>()
    const unknown = new Map<string, string>()
    for (const label of row.muscleGroups) {
      const key = normalize(label)
      if (!key) continue
      const id = aliases.get(key)
      if (id) recognized.add(id)
      else if (!unknown.has(key)) unknown.set(key, label.trim())
    }
    result.push({ row, index, sets, recognized, unknown })
  }
  return result
}

export function buildMuscleActivity(rows: MuscleActivityInput[], range?: MuscleDateRange) {
  const totals = new Map<MuscleGroupId, number>()
  const unmapped = new Map<string, { label: string; sets: number }>()
  let totalSets = 0
  let withoutMuscleSets = 0
  for (const { sets, recognized, unknown } of activityRows(rows, range)) {
    totalSets += sets
    for (const [key, label] of Array.from(unknown)) {
      const prior = unmapped.get(key)
      unmapped.set(key, { label: prior?.label ?? label, sets: (prior?.sets ?? 0) + sets })
    }
    if (!recognized.size && !unknown.size) withoutMuscleSets += sets
    recognized.forEach(id => totals.set(id, (totals.get(id) ?? 0) + sets))
  }
  const maximum = Math.max(0, ...Array.from(totals.values()))
  const groups: MuscleActivityGroup[] = MUSCLE_GROUPS.map(({ id, es, en }) => {
    const sets = totals.get(id) ?? 0
    return { id, es, en, sets, level: maximum && sets ? Math.max(1, Math.ceil(sets / maximum * 4)) : 0 }
  })
  return { groups, totalSets, withoutMuscleSets, unmapped: Array.from(unmapped.values()) }
}

function newestRow(left: MuscleActivityInput, right: MuscleActivityInput): MuscleActivityInput {
  const instant = (row: MuscleActivityInput) => {
    const time = Date.parse(row.completedAt ?? '')
    return Number.isFinite(time) ? time : row.date ? Date.parse(`${row.date}T12:00:00Z`) : 0
  }
  const tie = (row: MuscleActivityInput) => [row.exerciseName, row.sessionName, row.exerciseLogId, row.sessionId].join('\u0000')
  return (instant(left) - instant(right) || tie(left).localeCompare(tie(right))) >= 0 ? left : right
}

/** Each contributing series counts once for this muscle, including compound work.
 * Missing exercise identities remain separate; missing session metadata creates no history target. */
export function buildMuscleBreakdown(rows: MuscleActivityInput[], groupId: MuscleGroupId, range?: MuscleDateRange): MuscleBreakdown {
  const grouped = new Map<string, {
    exerciseId: string | null; sets: number; latest: MuscleActivityInput
    sessions: Map<string, { sets: number; latest: MuscleActivityInput }>
  }>()
  let totalSets = 0
  for (const { row, index, sets, recognized } of activityRows(rows, range)) {
    if (!recognized.has(groupId)) continue
    const exerciseId = row.exerciseId?.trim() || null
    const key = exerciseId ? `exercise:${exerciseId}` : row.exerciseLogId?.trim()
      ? `log:${row.exerciseLogId.trim()}` : `unknown:${row.sessionId ?? 'row'}:${index}`
    const entry = grouped.get(key) ?? { exerciseId, sets: 0, latest: row, sessions: new Map() }
    entry.sets += sets
    entry.latest = newestRow(entry.latest, row)
    const sessionId = row.sessionId?.trim()
    if (sessionId && row.date) {
      const session = entry.sessions.get(sessionId)
      entry.sessions.set(sessionId, { sets: (session?.sets ?? 0) + sets, latest: session ? newestRow(session.latest, row) : row })
    }
    grouped.set(key, entry)
    totalSets += sets
  }
  const exercises = Array.from(grouped, ([key, entry]): MuscleBreakdownExercise => ({
    key, exerciseId: entry.exerciseId, exerciseName: entry.latest.exerciseName?.trim() || 'Ejercicio', sets: entry.sets,
    sessions: Array.from(entry.sessions, ([sessionId, session]) => ({
      sessionId, sessionName: session.latest.sessionName?.trim() || 'Entrenamiento', date: session.latest.date!, sets: session.sets,
    })).sort((a, b) => b.date.localeCompare(a.date) || a.sessionId.localeCompare(b.sessionId)),
  })).sort((a, b) => b.sets - a.sets || a.exerciseName.localeCompare(b.exerciseName) || a.key.localeCompare(b.key))
  return { sets: totalSets, exercises }
}

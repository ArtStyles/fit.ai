export const MUSCLE_GROUPS = [
  { id: 'chest', es: 'Pecho', en: 'Chest', aliases: ['chest', 'pecho', 'pectorales', 'pectoral', 'pectorals'] },
  { id: 'back', es: 'Espalda', en: 'Back', aliases: ['back', 'espalda', 'lats', 'dorsales', 'dorsal', 'middle back', 'upper back', 'lower back', 'espalda baja', 'espalda alta', 'lumbar', 'lumbares', 'traps', 'trapezius', 'trapecio', 'trapecios', 'latissimus dorsi', 'erector spinae', 'rhomboids', 'romboides'] },
  { id: 'shoulders', es: 'Hombros', en: 'Shoulders', aliases: ['shoulders', 'shoulder', 'hombros', 'hombro', 'deltoids', 'deltoid', 'deltoides'] },
  { id: 'biceps', es: 'Bíceps', en: 'Biceps', aliases: ['biceps', 'biceps brachii', 'biceps braquial'] },
  { id: 'triceps', es: 'Tríceps', en: 'Triceps', aliases: ['triceps', 'triceps brachii', 'triceps braquial'] },
  { id: 'forearms', es: 'Antebrazos', en: 'Forearms', aliases: ['forearms', 'forearm', 'antebrazos', 'antebrazo'] },
  { id: 'core', es: 'Abdomen', en: 'Core', aliases: ['core', 'abdominals', 'abdominales', 'abdominal', 'abdomen', 'abs', 'obliques', 'oblicuos', 'serratus', 'serrato', 'serrato anterior'] },
  { id: 'glutes', es: 'Glúteos', en: 'Glutes', aliases: ['glutes', 'gluteal', 'gluteos', 'gluteo', 'gluteus maximus'] },
  { id: 'quads', es: 'Cuádriceps', en: 'Quadriceps', aliases: ['quadriceps', 'cuadriceps', 'quads'] },
  { id: 'hamstrings', es: 'Isquiotibiales', en: 'Hamstrings', aliases: ['hamstrings', 'hamstring', 'isquiotibiales', 'isquios', 'femorales', 'femoral'] },
  { id: 'calves', es: 'Gemelos', en: 'Calves', aliases: ['calves', 'calf', 'gemelos', 'pantorrillas', 'pantorrilla', 'gastrocnemius', 'soleus', 'soleo'] },
  { id: 'hips', es: 'Caderas', en: 'Hips', aliases: ['adductors', 'abductors', 'aductores', 'abductores', 'hip flexors', 'flexores de cadera', 'flexores de la cadera', 'hip', 'hips', 'caderas', 'cadera'] },
] as const

export type MuscleGroupId = (typeof MUSCLE_GROUPS)[number]['id']
export type MuscleActivityInput = { muscleGroups: string[]; sets: number; date?: string }
export type MuscleDateRange = { from: string; to: string }
export type MuscleActivityGroup = { id: MuscleGroupId; es: string; en: string; sets: number; level: number }

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
const aliases = new Map<string, MuscleGroupId>(MUSCLE_GROUPS.flatMap(group => group.aliases.map(alias => [normalize(alias), group.id] as const)))

export function buildMuscleActivity(rows: MuscleActivityInput[], range?: MuscleDateRange) {
  const totals = new Map<MuscleGroupId, number>()
  const unmapped = new Map<string, { label: string; sets: number }>()
  let totalSets = 0
  let withoutMuscleSets = 0
  for (const row of rows) {
    if (range && (!row.date || row.date < range.from || row.date > range.to)) continue
    if (!Number.isFinite(row.sets) || row.sets <= 0) continue
    const sets = Math.trunc(row.sets)
    if (!sets) continue
    totalSets += sets
    const recognized = new Set<MuscleGroupId>()
    const unknown = new Set<string>()
    for (const label of row.muscleGroups) {
      const key = normalize(label)
      if (!key) continue
      const id = aliases.get(key)
      if (id) recognized.add(id)
      else if (!unknown.has(key)) {
        unknown.add(key)
        const prior = unmapped.get(key)
        unmapped.set(key, { label: prior?.label ?? label.trim(), sets: (prior?.sets ?? 0) + sets })
      }
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

/**
 * Estimación conservadora de pesos para usuarios avanzados en su primer plan.
 *
 * Aplica SOLO a:
 *   - fitness_level === 'advanced'
 *   - Primer plan del usuario (sin logs previos)
 *   - Ejercicios compound con barra (bench, squat, deadlift, OHP, row)
 *
 * Multipliers: percentil 25-40 (conservador). Fuentes:
 *   - ExRx.net Strength Standards
 *   - Strength Level (aggregated, 2M+ lifts)
 *   - NSCA Guidelines (percentil 30-40 untrained/novice intermediate)
 *
 * Para isolaciones y cualquier otro ejercicio → weight_kg: null
 * Para pull-up → weight_kg: null + nota especial
 */

/** Multiplicadores por sexo (× peso corporal del usuario) */
interface WeightMultiplier {
  male: number
  female: number
}

/**
 * Mapa de nombre de ejercicio (lowercase, partial match) → multiplicador.
 * Se usa búsqueda por substring — el nombre exacto en DB puede variar.
 */
const WEIGHT_MULTIPLIERS: Array<{
  keywords: string[]
  multiplier: WeightMultiplier
  note?: string
}> = [
  {
    keywords: ['bench press', 'press banca', 'press de banca', 'chest press'],
    multiplier: { male: 0.75, female: 0.50 },
  },
  {
    keywords: ['squat', 'sentadilla', 'back squat', 'front squat'],
    multiplier: { male: 0.90, female: 0.65 },
  },
  {
    keywords: ['deadlift', 'peso muerto'],
    multiplier: { male: 1.00, female: 0.70 },
    // Ajustado por usuario: ♂ 1.10→1.00 | ♀ 0.80→0.70
    // Los tirones en peso muerto son más técnicos de lo que los multiplicadores
    // estándar sugieren; preferimos errar por lo conservador.
  },
  {
    keywords: ['overhead press', 'press militar', 'shoulder press', 'ohp'],
    multiplier: { male: 0.50, female: 0.32 },
  },
  {
    keywords: ['barbell row', 'bent over row', 'remo con barra', 'pendlay'],
    multiplier: { male: 0.65, female: 0.45 },
  },
  {
    keywords: ['pull-up', 'pullup', 'chin-up', 'chinup', 'dominada'],
    multiplier: { male: 0, female: 0 }, // señal especial → siempre null
    note:
      'Usa tu peso corporal como resistencia. ' +
      'Registra el número de repeticiones como baseline.',
  },
]

/** Redondeo al múltiplo de 2.5 kg más cercano (hacia abajo) */
function roundTo2p5(kg: number): number {
  return Math.floor(kg / 2.5) * 2.5
}

export interface WeightEstimation {
  weight_kg: number | null
  notes: string | null
}

/**
 * Estima el peso inicial para un ejercicio compound de un usuario avanzado.
 *
 * @param exerciseName  Nombre del ejercicio (tal como está en la DB)
 * @param gender        'male' | 'female' | 'other'
 * @param bodyWeightKg  Peso corporal del usuario en kg
 * @returns { weight_kg, notes } — weight_kg es null si no aplica
 */
export function estimateWeight(
  exerciseName: string,
  gender: string,
  bodyWeightKg: number,
): WeightEstimation {
  const nameLower = exerciseName.toLowerCase()

  for (const entry of WEIGHT_MULTIPLIERS) {
    const match = entry.keywords.some(kw => nameLower.includes(kw))
    if (!match) continue

    // Pull-up: siempre null con nota especial
    if (entry.multiplier.male === 0) {
      return {
        weight_kg: null,
        notes: entry.note ?? null,
      }
    }

    const multiplier =
      gender === 'female' ? entry.multiplier.female : entry.multiplier.male

    const rawKg = multiplier * bodyWeightKg
    const rounded = roundTo2p5(rawKg)

    // Mínimo 5 kg (plato olímpico más barra vacía sería 20 kg, pero para
    // estimaciones conservadoras en mancuernas/barra corta, 5 kg es razonable)
    const finalKg = Math.max(5, rounded)

    const disclaimer =
      'Estimación conservadora basada en tu perfil. ' +
      'Ajusta en tu primera sesión según tu sensación real.'

    return {
      weight_kg: finalKg,
      notes: entry.note
        ? `${entry.note} ${disclaimer}`
        : disclaimer,
    }
  }

  // No es un compound conocido → sin estimación
  return { weight_kg: null, notes: null }
}

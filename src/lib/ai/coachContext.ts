/**
 * coachContext.ts
 *
 * Construye el bloque de contexto que recibe el coach IA (chat y ajustes):
 * perfil del usuario, plan activo y sesiones recientes en un texto compacto
 * en español. Función pura — los datos los recopila el server action.
 */

const DAY_NAMES: Record<number, string> = {
  1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves',
  5: 'viernes', 6: 'sábado', 7: 'domingo',
}

export interface CoachContextInput {
  profile: {
    fitnessLevel: string | null
    primaryGoal: string | null
    daysPerWeek: number | null
    injuries: string | null
    weightKg: number | null
  }
  activePlan: {
    name: string
    weekNumber: number | null
    workouts: { name: string; dayOfWeek: number | null; exerciseCount: number }[]
  } | null
  recentSessions: {
    workoutName: string | null
    completedAt: string
    durationMinutes: number | null
  }[]
}

export function buildCoachContextText(input: CoachContextInput): string {
  const { profile, activePlan, recentSessions } = input
  const lines: string[] = []

  const profileParts = [
    profile.fitnessLevel && `nivel ${profile.fitnessLevel}`,
    profile.primaryGoal && `objetivo ${profile.primaryGoal}`,
    profile.daysPerWeek && `${profile.daysPerWeek} días/semana`,
    profile.weightKg && `${profile.weightKg} kg`,
  ].filter(Boolean)
  lines.push(`Perfil: ${profileParts.join(', ') || 'sin datos'}.`)

  if (profile.injuries?.trim()) {
    lines.push(`Lesiones/limitaciones: ${profile.injuries.trim()}.`)
  }

  if (activePlan) {
    const week = activePlan.weekNumber ? ` (semana ${activePlan.weekNumber})` : ''
    lines.push(`Plan activo: "${activePlan.name}"${week}.`)

    if (activePlan.workouts.length > 0) {
      const workouts = activePlan.workouts
        .map(workout => {
          const day = workout.dayOfWeek ? DAY_NAMES[workout.dayOfWeek] ?? `día ${workout.dayOfWeek}` : 'sin día'
          return `${workout.name} (${day}, ${workout.exerciseCount} ejercicios)`
        })
        .join('; ')
      lines.push(`Rutinas: ${workouts}.`)
    }
  } else {
    lines.push('Sin plan activo.')
  }

  if (recentSessions.length > 0) {
    const sessions = recentSessions
      .map(session => {
        const date = session.completedAt.slice(0, 10)
        const duration = session.durationMinutes ? `, ${session.durationMinutes} min` : ''
        return `${session.workoutName ?? 'Entrenamiento'} (${date}${duration})`
      })
      .join('; ')
    lines.push(`Últimas ${recentSessions.length} sesiones: ${sessions}.`)
  } else {
    lines.push('Sin sesiones registradas recientemente.')
  }

  return lines.join('\n')
}

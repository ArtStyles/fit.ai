export interface BriefContext {
  firstName:          string
  streak:             number
  todayWorkout:       { name: string; exercise_count: number } | null
  isCompletedToday:   boolean
  progressionCount:   number
  topRecord:          { exerciseName: string; maxWeightKg: number } | null
  weekSessions:       number
  scheduledSessions:  number
}

// Use day-of-month (1-31) to rotate among variants without being random
function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]
}

export function generateDailyBrief(ctx: BriefContext): string {
  const v = new Date().getDate()   // stays stable all day, changes tomorrow

  // ── Workout completado hoy ──────────────────────────────────────────────────
  if (ctx.isCompletedToday) {
    return pick([
      `Sesión completada${ctx.streak >= 2 ? ` — ${ctx.streak} días seguidos` : ''}. Los músculos ya están trabajando. Recupérate bien hoy.`,
      `Ya sumaste una sesión más${ctx.streak >= 2 ? ` (racha de ${ctx.streak})` : ''}. El trabajo de hoy se nota en unos días. Bien hecho.`,
      `Hoy ya está hecho${ctx.streak >= 2 ? ` — ${ctx.streak} días de racha` : ''}. Descansa, hidrádate y deja que el cuerpo procese.`,
    ], v)
  }

  // ── Día de descanso ─────────────────────────────────────────────────────────
  if (!ctx.todayWorkout) {
    return pick([
      `Día de descanso${ctx.streak >= 2 ? ` — llevas ${ctx.streak} días activos` : ''}. El músculo crece ahora. ${ctx.weekSessions}/${ctx.scheduledSessions} sesiones completadas esta semana.`,
      `Hoy toca descanso. ${ctx.weekSessions > 0 ? `Has entrenado ${ctx.weekSessions} vece${ctx.weekSessions !== 1 ? 's' : ''} esta semana — ` : ''}eso cuenta. Duerme bien y come bien.`,
      `Día libre. El descanso no es tiempo perdido${ctx.streak >= 2 ? ` — llevas ${ctx.streak} días de racha` : ''}. Tu cuerpo lo necesita tanto como el entrenamiento.`,
    ], v)
  }

  // ── Semana 1, sin historial ─────────────────────────────────────────────────
  if (!ctx.topRecord && ctx.weekSessions === 0) {
    return pick([
      `Hoy empieza ${ctx.todayWorkout.name}. Primera semana: no te preocupes por el peso, concéntrate en aprender los ${ctx.todayWorkout.exercise_count} ejercicios bien.`,
      `${ctx.todayWorkout.name} te espera. Con ${ctx.todayWorkout.exercise_count} ejercicios, tómatelo con calma y aprende cada movimiento. El peso llega solo.`,
      `Primera sesión de la semana: ${ctx.todayWorkout.name}. Llega con energía — la consistencia desde el primer día es lo que marca la diferencia.`,
    ], v)
  }

  // ── Hay progresiones pendientes ─────────────────────────────────────────────
  if (ctx.progressionCount > 0) {
    const prog = ctx.progressionCount === 1
      ? '1 progresión esperándote'
      : `${ctx.progressionCount} progresiones esperándote`

    if (ctx.streak >= 3) {
      return pick([
        `${ctx.streak} días de racha y hoy toca ${ctx.todayWorkout.name}. Tienes ${prog} — el sistema ya sabe que puedes más. Confía en los números.`,
        `Llevas ${ctx.streak} días seguidos. Hoy ${ctx.todayWorkout.name} viene con ${prog}. Es el momento de subir — tu historial lo respalda.`,
        `Racha de ${ctx.streak} días. ${ctx.todayWorkout.name} hoy, con ${prog}. Haz los aumentos — para eso entrenas con consistencia.`,
      ], v)
    }

    return pick([
      `Hoy toca ${ctx.todayWorkout.name} y tienes ${prog}. Tu progreso reciente dice que estás listo para subir peso.`,
      `${ctx.todayWorkout.name} hoy. ${prog} — aplícalas, para eso estás registrando todo.`,
      `Sesión de ${ctx.todayWorkout.name} con ${prog}. No dejes las mejoras sobre la mesa.`,
    ], v)
  }

  // ── Tiene récord reciente para referenciar ──────────────────────────────────
  if (ctx.topRecord) {
    const next = Math.round((ctx.topRecord.maxWeightKg + 2.5) * 2) / 2

    if (ctx.streak >= 3) {
      return pick([
        `${ctx.streak} días de racha. Hoy ${ctx.todayWorkout.name} — tu mejor marca en ${ctx.topRecord.exerciseName} es ${ctx.topRecord.maxWeightKg} kg. ${next} kg están a un buen día de distancia.`,
        `Llevas ${ctx.streak} días activos. ${ctx.todayWorkout.name} hoy: llegaste a ${ctx.topRecord.maxWeightKg} kg en ${ctx.topRecord.exerciseName}. Mantén esa línea.`,
        `Racha de ${ctx.streak}. Hoy ${ctx.todayWorkout.name} — ${ctx.topRecord.maxWeightKg} kg en ${ctx.topRecord.exerciseName} es tu referencia. Iguálalo o supéralo.`,
      ], v)
    }

    return pick([
      `Hoy toca ${ctx.todayWorkout.name}. Tu referencia en ${ctx.topRecord.exerciseName}: ${ctx.topRecord.maxWeightKg} kg. ¿Puedes llegar a ${next} kg hoy?`,
      `${ctx.todayWorkout.name} hoy. Llegaste a ${ctx.topRecord.maxWeightKg} kg en ${ctx.topRecord.exerciseName} — esa es la barra a superar.`,
      `Sesión de ${ctx.todayWorkout.name}. Tu última mejor marca en ${ctx.topRecord.exerciseName} fue ${ctx.topRecord.maxWeightKg} kg. Hoy construyes encima de eso.`,
    ], v)
  }

  // ── Racha activa, sin más datos ─────────────────────────────────────────────
  if (ctx.streak >= 2) {
    return pick([
      `Llevas ${ctx.streak} días seguidos. Hoy toca ${ctx.todayWorkout.name} — esa consistencia es exactamente lo que produce resultados reales.`,
      `${ctx.streak} días de racha y contando. ${ctx.todayWorkout.name} hoy — cada sesión que completas es un ladrillo más.`,
      `Racha de ${ctx.streak} días. ${ctx.todayWorkout.name} te espera — llega, trabaja y suma uno más.`,
    ], v)
  }

  // ── Fallback genérico ───────────────────────────────────────────────────────
  return pick([
    `Hoy toca ${ctx.todayWorkout.name}. Mueve el cuerpo, registra bien los pesos y deja que el proceso haga su trabajo.`,
    `${ctx.todayWorkout.name} hoy. Llega con intención, no con perfección — la consistencia gana a largo plazo.`,
    `Sesión de ${ctx.todayWorkout.name} programada. Muévete, registra, repite. Así se construye el progreso.`,
  ], v)
}

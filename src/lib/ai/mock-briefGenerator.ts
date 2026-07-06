import type { AppLanguage } from '@/lib/i18n'

export interface BriefContext {
  firstName: string
  streak: number
  todayWorkout: { name: string; exercise_count: number } | null
  isCompletedToday: boolean
  progressionCount: number
  topRecord: { exerciseName: string; maxWeightKg: number } | null
  weekSessions: number
  scheduledSessions: number
}

export interface BriefOptions {
  locale?: AppLanguage
  variantSeed?: number
}

function pick<T>(items: T[], seed: number): T {
  const index = Math.abs(Math.trunc(seed)) % items.length
  return items[index]
}

function localized(
  locale: AppLanguage,
  spanish: string[],
  english: string[],
  seed: number,
): string {
  return pick(locale === 'en' ? english : spanish, seed)
}

export function generateDailyBrief(
  ctx: BriefContext,
  { locale = 'es', variantSeed = 0 }: BriefOptions = {},
): string {
  if (ctx.isCompletedToday) {
    const esStreak = ctx.streak >= 2 ? ` — ${ctx.streak} días seguidos` : ''
    const enStreak = ctx.streak >= 2 ? ` — ${ctx.streak} days in a row` : ''
    return localized(locale, [
      `Sesión completada${esStreak}. Los músculos ya están trabajando. Recupérate bien hoy.`,
      `Ya sumaste una sesión más${ctx.streak >= 2 ? ` (racha de ${ctx.streak})` : ''}. El trabajo de hoy se nota en unos días. Bien hecho.`,
      `Hoy ya está hecho${ctx.streak >= 2 ? ` — ${ctx.streak} días de racha` : ''}. Descansa, hidrátate y deja que el cuerpo procese.`,
    ], [
      `Session complete${enStreak}. Your muscles are already working. Recover well today.`,
      `You added another session${ctx.streak >= 2 ? ` (${ctx.streak}-day streak)` : ''}. Today's work will show in a few days. Well done.`,
      `Today is done${ctx.streak >= 2 ? ` — ${ctx.streak}-day streak` : ''}. Rest, hydrate, and let your body adapt.`,
    ], variantSeed)
  }

  if (!ctx.todayWorkout) {
    return localized(locale, [
      `Día de descanso${ctx.streak >= 2 ? ` — llevas ${ctx.streak} días activos` : ''}. El músculo crece ahora. ${ctx.weekSessions}/${ctx.scheduledSessions} sesiones completadas esta semana.`,
      `Hoy toca descanso. ${ctx.weekSessions > 0 ? `Has entrenado ${ctx.weekSessions} ve${ctx.weekSessions === 1 ? 'z' : 'ces'} esta semana — ` : ''}eso cuenta. Duerme bien y come bien.`,
      `Día libre. El descanso no es tiempo perdido${ctx.streak >= 2 ? ` — llevas ${ctx.streak} días de racha` : ''}. Tu cuerpo lo necesita tanto como el entrenamiento.`,
    ], [
      `Rest day${ctx.streak >= 2 ? ` — ${ctx.streak} active days` : ''}. Your muscles grow now. ${ctx.weekSessions}/${ctx.scheduledSessions} sessions completed this week.`,
      `Today is a rest day. ${ctx.weekSessions > 0 ? `You trained ${ctx.weekSessions} time${ctx.weekSessions === 1 ? '' : 's'} this week — ` : ''}that counts. Sleep well and eat well.`,
      `Day off. Rest is not wasted time${ctx.streak >= 2 ? ` — you have a ${ctx.streak}-day streak` : ''}. Your body needs it as much as training.`,
    ], variantSeed)
  }

  if (!ctx.topRecord && ctx.weekSessions === 0) {
    return localized(locale, [
      `Hoy empieza ${ctx.todayWorkout.name}. Primera semana: no te preocupes por el peso, concéntrate en aprender bien los ${ctx.todayWorkout.exercise_count} ejercicios.`,
      `${ctx.todayWorkout.name} te espera. Con ${ctx.todayWorkout.exercise_count} ejercicios, tómatelo con calma y aprende cada movimiento. El peso llega solo.`,
      `Primera sesión de la semana: ${ctx.todayWorkout.name}. Llega con energía — la consistencia desde el primer día es lo que marca la diferencia.`,
    ], [
      `${ctx.todayWorkout.name} starts today. In your first week, focus on learning all ${ctx.todayWorkout.exercise_count} exercises instead of chasing weight.`,
      `${ctx.todayWorkout.name} is waiting. Take the ${ctx.todayWorkout.exercise_count} exercises steadily and learn each movement. The weight will follow.`,
      `First session of the week: ${ctx.todayWorkout.name}. Bring energy — consistency from day one makes the difference.`,
    ], variantSeed)
  }

  if (ctx.progressionCount > 0) {
    const esProgression = ctx.progressionCount === 1
      ? '1 progresión esperándote'
      : `${ctx.progressionCount} progresiones esperándote`
    const enProgression = ctx.progressionCount === 1
      ? '1 suggested progression waiting'
      : `${ctx.progressionCount} suggested progressions waiting`

    if (ctx.streak >= 3) {
      return localized(locale, [
        `${ctx.streak} días de racha y hoy toca ${ctx.todayWorkout.name}. Tienes ${esProgression} — el sistema ya sabe que puedes más. Confía en los números.`,
        `Llevas ${ctx.streak} días seguidos. Hoy ${ctx.todayWorkout.name} viene con ${esProgression}. Es el momento de subir — tu historial lo respalda.`,
        `Racha de ${ctx.streak} días. ${ctx.todayWorkout.name} hoy, con ${esProgression}. Haz los aumentos — para eso entrenas con consistencia.`,
      ], [
        `${ctx.streak}-day streak and ${ctx.todayWorkout.name} today. You have ${enProgression} — your data says you can do more. Trust the numbers.`,
        `You have trained ${ctx.streak} days in a row. ${ctx.todayWorkout.name} comes with ${enProgression}. It is time to move up — your history supports it.`,
        `${ctx.streak}-day streak. ${ctx.todayWorkout.name} today with ${enProgression}. Take the increases — consistency earned them.`,
      ], variantSeed)
    }

    return localized(locale, [
      `Hoy toca ${ctx.todayWorkout.name} y tienes ${esProgression}. Tu progreso reciente dice que estás listo para subir peso.`,
      `${ctx.todayWorkout.name} hoy. ${esProgression} — aplícalas, para eso estás registrando todo.`,
      `Sesión de ${ctx.todayWorkout.name} con ${esProgression}. No dejes las mejoras sobre la mesa.`,
    ], [
      `${ctx.todayWorkout.name} is today and you have ${enProgression}. Your recent progress says you are ready to add weight.`,
      `${ctx.todayWorkout.name} today. ${enProgression} — apply them; that is why you track your training.`,
      `${ctx.todayWorkout.name} session with ${enProgression}. Put the available improvements to work.`,
    ], variantSeed)
  }

  if (ctx.topRecord) {
    const next = Math.round((ctx.topRecord.maxWeightKg + 2.5) * 2) / 2
    if (ctx.streak >= 3) {
      return localized(locale, [
        `${ctx.streak} días de racha. Hoy ${ctx.todayWorkout.name} — tu mejor marca en ${ctx.topRecord.exerciseName} es ${ctx.topRecord.maxWeightKg} kg. ${next} kg están a un buen día de distancia.`,
        `Llevas ${ctx.streak} días activos. ${ctx.todayWorkout.name} hoy: llegaste a ${ctx.topRecord.maxWeightKg} kg en ${ctx.topRecord.exerciseName}. Mantén esa línea.`,
        `Racha de ${ctx.streak}. Hoy ${ctx.todayWorkout.name} — ${ctx.topRecord.maxWeightKg} kg en ${ctx.topRecord.exerciseName} es tu referencia. Iguálalo o supéralo.`,
      ], [
        `${ctx.streak}-day streak. ${ctx.todayWorkout.name} today — your best ${ctx.topRecord.exerciseName} is ${ctx.topRecord.maxWeightKg} kg. ${next} kg is one strong day away.`,
        `You have ${ctx.streak} active days. ${ctx.todayWorkout.name} today: you reached ${ctx.topRecord.maxWeightKg} kg on ${ctx.topRecord.exerciseName}. Hold that line.`,
        `${ctx.streak}-day streak. ${ctx.todayWorkout.name} today — ${ctx.topRecord.maxWeightKg} kg on ${ctx.topRecord.exerciseName} is your reference. Match or beat it.`,
      ], variantSeed)
    }

    return localized(locale, [
      `Hoy toca ${ctx.todayWorkout.name}. Tu referencia en ${ctx.topRecord.exerciseName}: ${ctx.topRecord.maxWeightKg} kg. ¿Puedes llegar a ${next} kg hoy?`,
      `${ctx.todayWorkout.name} hoy. Llegaste a ${ctx.topRecord.maxWeightKg} kg en ${ctx.topRecord.exerciseName} — esa es la barra a superar.`,
      `Sesión de ${ctx.todayWorkout.name}. Tu última mejor marca en ${ctx.topRecord.exerciseName} fue ${ctx.topRecord.maxWeightKg} kg. Hoy construyes encima de eso.`,
    ], [
      `${ctx.todayWorkout.name} is today. Your ${ctx.topRecord.exerciseName} reference is ${ctx.topRecord.maxWeightKg} kg. Can you reach ${next} kg today?`,
      `${ctx.todayWorkout.name} today. You reached ${ctx.topRecord.maxWeightKg} kg on ${ctx.topRecord.exerciseName} — that is the mark to beat.`,
      `${ctx.todayWorkout.name} session. Your latest best on ${ctx.topRecord.exerciseName} was ${ctx.topRecord.maxWeightKg} kg. Build on it today.`,
    ], variantSeed)
  }

  if (ctx.streak >= 2) {
    return localized(locale, [
      `Llevas ${ctx.streak} días seguidos. Hoy toca ${ctx.todayWorkout.name} — esa consistencia es exactamente lo que produce resultados reales.`,
      `${ctx.streak} días de racha y contando. ${ctx.todayWorkout.name} hoy — cada sesión que completas es un ladrillo más.`,
      `Racha de ${ctx.streak} días. ${ctx.todayWorkout.name} te espera — llega, trabaja y suma uno más.`,
    ], [
      `You have trained ${ctx.streak} days in a row. ${ctx.todayWorkout.name} is today — that consistency produces real results.`,
      `${ctx.streak}-day streak and counting. ${ctx.todayWorkout.name} today — every completed session adds another brick.`,
      `${ctx.streak}-day streak. ${ctx.todayWorkout.name} is waiting — show up, work, and add one more.`,
    ], variantSeed)
  }

  return localized(locale, [
    `Hoy toca ${ctx.todayWorkout.name}. Mueve el cuerpo, registra bien los pesos y deja que el proceso haga su trabajo.`,
    `${ctx.todayWorkout.name} hoy. Llega con intención, no con perfección — la consistencia gana a largo plazo.`,
    `Sesión de ${ctx.todayWorkout.name} programada. Muévete, registra, repite. Así se construye el progreso.`,
  ], [
    `${ctx.todayWorkout.name} is today. Move, track your weights carefully, and let the process work.`,
    `${ctx.todayWorkout.name} today. Bring intention, not perfection — consistency wins over time.`,
    `${ctx.todayWorkout.name} session scheduled. Move, track, repeat. That is how progress is built.`,
  ], variantSeed)
}

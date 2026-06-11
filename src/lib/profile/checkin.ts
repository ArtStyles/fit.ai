/**
 * checkin.ts
 *
 * Regla de negocio del check-in periódico: cada CHECK_IN_INTERVAL_DAYS
 * días invitamos al usuario a revisar peso, objetivo y lesiones para
 * que la regeneración semanal trabaje con datos frescos.
 *
 * last_check_in_at se actualiza al completar el onboarding y al guardar
 * cualquiera de las páginas de ajustes de perfil/entrenamiento.
 */

export const CHECK_IN_INTERVAL_DAYS = 28

export function isCheckInDue(
  lastCheckInAt: string | null,
  now: Date = new Date(),
): boolean {
  if (!lastCheckInAt) return true

  const last = Date.parse(lastCheckInAt)
  if (!Number.isFinite(last)) return true

  const elapsedDays = (now.getTime() - last) / (24 * 60 * 60 * 1000)
  return elapsedDays >= CHECK_IN_INTERVAL_DAYS
}

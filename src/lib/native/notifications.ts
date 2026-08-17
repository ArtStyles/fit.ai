/**
 * Recordatorios de entrenamiento mediante notificaciones locales.
 *
 * Usa @capacitor/local-notifications: el dispositivo dispara la notificación de
 * forma local y programada — sin servidor, sin Firebase, funciona offline. Solo
 * operan dentro del contenedor nativo; en web/PWA todas las funciones son no-op
 * (la UI debe consultar `remindersSupported()` para reflejarlo).
 */

import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { translate, type AppLanguage } from '@/lib/i18n'

/** Base de IDs reservada para los recordatorios (uno por día de semana, 1..7). */
const REMINDER_ID_BASE = 7100
const REMINDER_TITLE = '\u00a1Hora de entrenar! \ud83d\udcaa'
const REMINDER_BODY = 'Tu sesi\u00f3n de hoy te espera. Vamos a por ella.'

export interface ReminderTime {
  hour: number
  minute: number
}

/** Los recordatorios locales solo funcionan dentro de la app nativa. */
export function remindersSupported(): boolean {
  return Capacitor.isNativePlatform()
}

/** Comprueba/solicita el permiso de notificaciones. Devuelve true si concedido. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  const status = await LocalNotifications.checkPermissions()
  if (status.display === 'granted') return true
  if (status.display === 'denied') return false
  const requested = await LocalNotifications.requestPermissions()
  return requested.display === 'granted'
}

/**
 * Mapea el día de la semana de la app (1=Lun … 6=Sáb, 7=Dom) al estándar de
 * Capacitor LocalNotifications (1=Dom, 2=Lun … 7=Sáb).
 */
function appDayToWeekday(appDay: number): number {
  return appDay === 7 ? 1 : appDay + 1
}

/**
 * Reprograma los recordatorios: cancela los previos y crea uno recurrente
 * semanal por cada día indicado, a la hora dada. Devuelve false si no es nativo
 * o si el usuario no concedió permiso.
 */
export async function scheduleWorkoutReminders(
  days: number[],
  time: ReminderTime,
  language: AppLanguage,
): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  const granted = await ensureNotificationPermission()
  if (!granted) return false

  const pending = await LocalNotifications.getPending()
  const previousReminders = pending.notifications.filter(notification => (
    notification.id > REMINDER_ID_BASE
      && notification.id <= REMINDER_ID_BASE + 7
  ))

  await cancelWorkoutReminders()
  if (days.length === 0) return true

  try {
    await LocalNotifications.schedule({
      notifications: days.map(appDay => ({
        id: REMINDER_ID_BASE + appDay,
        title: translate(language, REMINDER_TITLE),
        body: translate(language, REMINDER_BODY),
        schedule: {
          on: {
            weekday: appDayToWeekday(appDay),
            hour: time.hour,
            minute: time.minute,
          },
          allowWhileIdle: true,
        },
      })),
    })
  } catch (schedulingError) {
    try {
      await cancelWorkoutReminders()
      if (previousReminders.length > 0) {
        await LocalNotifications.schedule({ notifications: previousReminders })
      }
    } catch (restorationError) {
      throw new AggregateError(
        [schedulingError, restorationError],
        'Workout reminder scheduling and restoration both failed.',
      )
    }
    throw schedulingError
  }
  return true
}

/** Cancela todos los recordatorios de entrenamiento previamente programados. */
export async function cancelWorkoutReminders(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const notifications = [1, 2, 3, 4, 5, 6, 7].map(day => ({ id: REMINDER_ID_BASE + day }))
  await LocalNotifications.cancel({ notifications })
}

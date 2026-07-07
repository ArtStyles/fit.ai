export type ProgressLocale = 'es' | 'en'

export type ProgressSummaryInput = {
  sessions: number
  volumeNow: number
  volumeBefore: number
  records: number
}

function plural(count: number, singular: string, pluralValue: string): string {
  return `${count} ${count === 1 ? singular : pluralValue}`
}

export function summarizeProgress(input: ProgressSummaryInput, locale: ProgressLocale): string {
  const sessions = Math.max(0, Math.round(input.sessions))
  const records = Math.max(0, Math.round(input.records))
  const volumeNow = Math.max(0, Math.round(input.volumeNow))
  const volumeBefore = Math.max(0, Math.round(input.volumeBefore))

  if (sessions <= 0) {
    return locale === 'en'
      ? 'Complete your first session to start measuring consistency, volume, and records.'
      : 'Completa tu primera sesión para empezar a medir constancia, volumen y marcas.'
  }

  const recordPart = records > 0
    ? locale === 'en'
      ? `, with ${plural(records, 'personal record', 'personal records')} detected`
      : `, con ${plural(records, 'marca personal', 'marcas personales')} ${records === 1 ? 'detectada' : 'detectadas'}`
    : ''

  const volumeChange = volumeBefore > 0
    ? Math.round(((volumeNow - volumeBefore) / volumeBefore) * 100)
    : null

  if (volumeChange !== null && volumeChange > 0) {
    return locale === 'en'
      ? `Measured training volume is up ${volumeChange}% across ${plural(sessions, 'session', 'sessions')}${recordPart}.`
      : `El volumen medido subió ${volumeChange}% en ${plural(sessions, 'sesión', 'sesiones')}${recordPart}.`
  }

  if (volumeChange !== null && volumeChange < 0) {
    const absoluteChange = Math.abs(volumeChange)
    return locale === 'en'
      ? `Measured training volume is down ${absoluteChange}% across ${plural(sessions, 'session', 'sessions')}${recordPart}.`
      : `El volumen medido bajó ${absoluteChange}% en ${plural(sessions, 'sesión', 'sesiones')}${recordPart}.`
  }

  return locale === 'en'
    ? `${plural(sessions, 'session', 'sessions')} recorded${recordPart}. Keep logging sessions to compare volume and records truthfully.`
    : `${plural(sessions, 'sesión', 'sesiones')} ${sessions === 1 ? 'registrada' : 'registradas'}${recordPart}. Sigue guardando sesiones para comparar volumen y marcas con datos reales.`
}

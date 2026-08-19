export function formatSuspensionDeadline(value: string | null, timeZone: string): string {
  if (!value) return 'Hasta nueva revisión'
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value))
}

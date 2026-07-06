const DECIMAL_AGE = /^\d+$/

export function parseDecimalAge(raw: string): number | null {
  const value = raw.trim()
  if (!DECIMAL_AGE.test(value)) return null

  const age = Number(value)
  return Number.isInteger(age) && age >= 18 && age <= 100 ? age : null
}

export function dateOfBirthFromAge(raw: string, currentYear = new Date().getFullYear()): string {
  const age = parseDecimalAge(raw)
  if (age === null) throw new Error('Edad inválida. Introduce un número entero entre 18 y 100.')
  return `${currentYear - age}-01-01`
}

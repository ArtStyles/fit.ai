export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase()
}

export type UsernameValidation = { ok: true; value: string } | { ok: false; error: string }

export function validateUsername(raw: string): UsernameValidation {
  const value = normalizeUsername(raw)
  if (value.length < 3) return { ok: false, error: 'Mínimo 3 caracteres.' }
  if (value.length > 20) return { ok: false, error: 'Máximo 20 caracteres.' }
  if (!/^[a-z][a-z0-9_]*$/.test(value)) {
    return { ok: false, error: 'Empieza por una letra; solo minúsculas, números y _.' }
  }
  return { ok: true, value }
}

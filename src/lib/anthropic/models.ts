/**
 * Constantes de modelo para el cliente Anthropic.
 *
 * Sobreescribibles via variables de entorno (útil en staging/testing):
 *   ANTHROPIC_MODEL_PRIMARY   — default: claude-sonnet-4-5
 *   ANTHROPIC_MODEL_FALLBACK  — default: claude-opus-4-5
 *
 * El fallback (Opus) se usa SOLO cuando el error del intento anterior
 * fue CONSTRAINT_VIOLATION (el modelo eligió exercise_ids fuera del pool).
 * Para errores de parsing o schema, se reutiliza el modelo primario con feedback.
 */

export const AI_MODELS = {
  primary:  process.env.ANTHROPIC_MODEL_PRIMARY  ?? 'claude-sonnet-4-5',
  fallback: process.env.ANTHROPIC_MODEL_FALLBACK ?? 'claude-opus-4-5',
  /** Chat y ajustes del coach: alto volumen, respuestas cortas → modelo barato. */
  coach:    process.env.ANTHROPIC_MODEL_COACH    ?? 'claude-haiku-4-5',
} as const

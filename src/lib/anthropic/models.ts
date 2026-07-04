/** Anthropic remains limited to chat and typed plan-adjustment interpretation. */
export const AI_MODELS = {
  coach: process.env.ANTHROPIC_MODEL_COACH ?? 'claude-haiku-4-5',
} as const

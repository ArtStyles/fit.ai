import type { GeneratePlanResult } from '@/app/actions/generatePlan'
import type { OnboardingAnswers } from '@/app/onboarding/types'

export type AutomaticOnboardingOutcome =
  | { phase: 'success'; result: GeneratePlanResult }
  | { phase: 'save_error'; error: string }
  | { phase: 'generation_error'; error: string }

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback
}

export async function runAutomaticOnboarding(
  answers: OnboardingAnswers,
  save: (answers: OnboardingAnswers) => Promise<void>,
  generate: () => Promise<GeneratePlanResult>,
): Promise<AutomaticOnboardingOutcome> {
  try {
    await save(answers)
  } catch (reason) {
    return { phase: 'save_error', error: errorMessage(reason, 'No pudimos guardar tu perfil.') }
  }

  try {
    const result = await generate()
    return result.success
      ? { phase: 'success', result }
      : { phase: 'generation_error', error: result.error ?? 'No pudimos generar tu plan ahora.' }
  } catch (reason) {
    return { phase: 'generation_error', error: errorMessage(reason, 'No pudimos generar tu plan ahora.') }
  }
}

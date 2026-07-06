import { describe, expect, it, vi } from 'vitest'
import { defaultAnswers } from '@/app/onboarding/types'
import { runAutomaticOnboarding } from '../onboardingWorkflow'

describe('automatic onboarding workflow phases', () => {
  it('reports a save failure and never starts generation', async () => {
    const generate = vi.fn(async () => ({ success: true }))

    await expect(runAutomaticOnboarding(
      defaultAnswers,
      async () => { throw new Error('No se pudo guardar.') },
      generate,
    )).resolves.toEqual({ phase: 'save_error', error: 'No se pudo guardar.' })
    expect(generate).not.toHaveBeenCalled()
  })

  it('reports a generation result failure after save succeeds', async () => {
    const calls: string[] = []
    const outcome = await runAutomaticOnboarding(
      defaultAnswers,
      async () => { calls.push('save') },
      async () => { calls.push('generate'); return { success: false, error: 'Motor no disponible.' } },
    )

    expect(outcome).toEqual({ phase: 'generation_error', error: 'Motor no disponible.' })
    expect(calls).toEqual(['save', 'generate'])
  })

  it('reports a thrown generation failure as generation-specific', async () => {
    await expect(runAutomaticOnboarding(
      defaultAnswers,
      async () => undefined,
      async () => { throw new Error('network down') },
    )).resolves.toEqual({ phase: 'generation_error', error: 'network down' })
  })

  it('returns success only after save then generation', async () => {
    const calls: string[] = []
    const result = { success: true, planId: 'plan-1' }

    await expect(runAutomaticOnboarding(
      defaultAnswers,
      async () => { calls.push('save') },
      async () => { calls.push('generate'); return result },
    )).resolves.toEqual({ phase: 'success', result })
    expect(calls).toEqual(['save', 'generate'])
  })
})

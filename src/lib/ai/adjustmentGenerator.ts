/**
 * adjustmentGenerator.ts — Punto de entrada unificado de ajustes de rutina.
 *
 * Igual que planGenerator.ts:
 *   USE_AI_MOCK=true / sin ANTHROPIC_API_KEY → mock local determinista
 *   en otro caso → Claude real (modelo coach, Haiku por defecto)
 */

import 'server-only'
import { mockAdjustmentSuggestion } from './mock-adjustmentGenerator'
import { callClaudeForAdjustment } from './real-coachGenerator'
import type { AdjustmentChange, AdjustmentContext } from './adjustments'

export interface AdjustmentResult {
  suggestion: string
  changes:    AdjustmentChange[]
  isMock:     boolean
  model:      string
}

export async function generateAdjustment(opts: {
  userId:       string
  request:      string
  context:      AdjustmentContext
  coachContext: string
}): Promise<AdjustmentResult> {
  const useMock =
    process.env.USE_AI_MOCK === 'true' ||
    !process.env.ANTHROPIC_API_KEY

  if (useMock) {
    const mock = await mockAdjustmentSuggestion(opts.request, opts.context)
    return { suggestion: mock.suggestion, changes: mock.changes, isMock: true, model: 'mock' }
  }

  const result = await callClaudeForAdjustment({
    userId:       opts.userId,
    request:      opts.request,
    context:      opts.context,
    coachContext: opts.coachContext,
  })

  return { suggestion: result.suggestion, changes: result.changes, isMock: false, model: result.model }
}

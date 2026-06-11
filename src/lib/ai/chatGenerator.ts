/**
 * chatGenerator.ts — Punto de entrada unificado del chat del coach.
 *
 * Igual que planGenerator.ts:
 *   USE_AI_MOCK=true / sin ANTHROPIC_API_KEY → mock local
 *   en otro caso → Claude real (modelo coach, Haiku por defecto)
 */

import 'server-only'
import { mockChatResponse } from './mock-chatGenerator'
import { callClaudeForChat } from './real-coachGenerator'
import type { CoachHistoryMessage } from './real-coachGenerator'

export type ChatConversationContext = 'general' | 'workout_plan' | 'nutrition' | 'progress'

export interface CoachChatResult {
  content: string
  isMock:  boolean
  model:   string
}

export async function generateCoachReply(opts: {
  userId:              string
  message:             string
  history:             CoachHistoryMessage[]
  contextText:         string
  conversationContext: ChatConversationContext
}): Promise<CoachChatResult> {
  const useMock =
    process.env.USE_AI_MOCK === 'true' ||
    !process.env.ANTHROPIC_API_KEY

  if (useMock) {
    const mock = await mockChatResponse(opts.message, opts.conversationContext)
    return { content: mock.content, isMock: true, model: 'mock' }
  }

  const result = await callClaudeForChat({
    userId:      opts.userId,
    message:     opts.message,
    history:     opts.history,
    contextText: opts.contextText,
  })

  return { content: result.content, isMock: false, model: result.model }
}

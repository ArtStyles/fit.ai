'use server'

import { createClient } from '@/lib/supabase/server'
import { generateCoachReply } from '@/lib/ai/chatGenerator'
import { loadCoachContextText } from '@/lib/ai/coachContextLoader'
import { checkUserRateLimit, checkGlobalDailyBudget } from '@/lib/ai/rate-limits'
import type { CoachHistoryMessage } from '@/lib/ai/real-coachGenerator'

export type ConversationContext = 'general' | 'workout_plan' | 'nutrition' | 'progress'

export interface ConversationRow {
  id: string
  title: string
  context: ConversationContext | null
  created_at: string
  updated_at: string
}

export interface MessageRow {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface CreateConversationResult {
  success: boolean
  conversationId?: string
  error?: string
}

export interface SendMessageResult {
  success: boolean
  userMessageId?: string
  assistantMessageId?: string
  assistantContent?: string
  error?: string
}

export async function getConversations(): Promise<ConversationRow[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await (supabase
    .from('ai_conversations') as any)
    .select('id, title, context, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(30) as { data: ConversationRow[] | null }

  return data ?? []
}

export async function getMessages(conversationId: string): Promise<MessageRow[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: conv } = await (supabase
    .from('ai_conversations') as any)
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .maybeSingle() as { data: { id: string } | null }

  if (!conv) return []

  const { data } = await (supabase
    .from('ai_messages') as any)
    .select('id, conversation_id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true }) as { data: MessageRow[] | null }

  return data ?? []
}

export async function createConversation(
  context: ConversationContext,
  title: string,
): Promise<CreateConversationResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }

  const { data, error } = await (supabase
    .from('ai_conversations') as any)
    .insert({ user_id: user.id, context, title })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (error || !data) {
    return { success: false, error: error?.message ?? 'No se pudo crear la conversación' }
  }

  return { success: true, conversationId: data.id }
}

export async function sendMessage(
  conversationId: string,
  content: string,
): Promise<SendMessageResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }

  const trimmed = content.trim()
  if (!trimmed) return { success: false, error: 'El mensaje no puede estar vacío' }

  const { data: conv } = await (supabase
    .from('ai_conversations') as any)
    .select('id, context')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .maybeSingle() as { data: { id: string; context: ConversationContext | null } | null }

  if (!conv) return { success: false, error: 'Conversación no encontrada' }

  // ── Rate limits (solo cuentan llamadas reales registradas en ai_usage_logs) ─
  const [userLimit, globalBudget] = await Promise.all([
    checkUserRateLimit(user.id, 'coach_chat'),
    checkGlobalDailyBudget(),
  ])
  if (!userLimit.allowed) return { success: false, error: userLimit.reason }
  if (!globalBudget.allowed) return { success: false, error: globalBudget.reason }

  // ── Contexto del coach + historial reciente de la conversación ─────────────
  const [contextText, { data: historyRows }] = await Promise.all([
    loadCoachContextText(supabase, user.id),
    (supabase
      .from('ai_messages') as any)
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(12) as Promise<{ data: CoachHistoryMessage[] | null }>,
  ])

  const history = (historyRows ?? []).reverse()

  const { data: userMsg, error: userMsgError } = await (supabase
    .from('ai_messages') as any)
    .insert({ conversation_id: conversationId, role: 'user', content: trimmed })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (userMsgError || !userMsg) {
    return { success: false, error: userMsgError?.message ?? 'No se pudo guardar el mensaje' }
  }

  let aiResponse
  try {
    aiResponse = await generateCoachReply({
      userId: user.id,
      message: trimmed,
      history,
      contextText,
      conversationContext: conv.context ?? 'general',
    })
  } catch (err) {
    console.error('[chat] generateCoachReply falló:', err)
    // Sin respuesta no dejamos el mensaje colgado: el usuario reintenta limpio.
    await (supabase.from('ai_messages') as any).delete().eq('id', userMsg.id)
    return {
      success: false,
      error: 'El coach no está disponible en este momento. Inténtalo de nuevo en unos minutos.',
    }
  }

  const { data: assistantMsg, error: assistantMsgError } = await (supabase
    .from('ai_messages') as any)
    .insert({ conversation_id: conversationId, role: 'assistant', content: aiResponse.content })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (assistantMsgError || !assistantMsg) {
    return { success: false, error: assistantMsgError?.message ?? 'No se pudo guardar la respuesta' }
  }

  await (supabase
    .from('ai_conversations') as any)
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)

  return {
    success: true,
    userMessageId: userMsg.id,
    assistantMessageId: assistantMsg.id,
    assistantContent: aiResponse.content,
  }
}

export async function deleteConversation(conversationId: string): Promise<{ success: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false }

  await (supabase
    .from('ai_conversations') as any)
    .delete()
    .eq('id', conversationId)
    .eq('user_id', user.id)

  return { success: true }
}

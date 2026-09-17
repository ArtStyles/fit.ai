import { mobileApi } from '../mobile-api'
import type * as Server from '@/app/actions/chat'
export type { ConversationContext, ConversationRow, MessageRow, CreateConversationResult, SendMessageResult } from '@/app/actions/chat'

export const getConversations: typeof Server.getConversations = () => mobileApi('/api/mobile/chat', { operation: 'list' })
export const getMessages: typeof Server.getMessages = conversationId => mobileApi('/api/mobile/chat', { operation: 'messages', conversationId })
export const createConversation: typeof Server.createConversation = (context, title) => mobileApi('/api/mobile/chat', { operation: 'create', context, title })
export const sendMessage: typeof Server.sendMessage = (conversationId, content) => mobileApi('/api/mobile/chat', { operation: 'send', conversationId, content })
export const deleteConversation: typeof Server.deleteConversation = conversationId => mobileApi('/api/mobile/chat', { operation: 'delete', conversationId })

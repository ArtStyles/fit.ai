import { handleMobileApi, MobileApiError, mobileApiOptions, readMobileJson } from '@/lib/mobile-api/http'
import { requireAppUserContext } from '@/lib/auth/server'
import { createConversation, deleteConversation, getConversations, getMessages, sendMessage, type ConversationContext } from '@/app/actions/chat'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const keys: Record<string, string[]> = { list: ['operation'], messages: ['operation', 'conversationId'], create: ['operation', 'context', 'title'], send: ['operation', 'conversationId', 'content'], delete: ['operation', 'conversationId'] }
export const runtime = 'nodejs'
export const maxDuration = 60
export async function OPTIONS() { return mobileApiOptions() }
export async function POST(request: Request) {
  return handleMobileApi(request, async () => {
    await requireAppUserContext()
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new MobileApiError(400, 'invalid_payload')
    const parsed = await readMobileJson(request)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new MobileApiError(400, 'invalid_payload')
    const body = parsed as Record<string, unknown>
    const operation = typeof body.operation === 'string' ? body.operation : ''
    const allowed = Object.hasOwn(keys, operation) ? keys[operation] : undefined
    if (!allowed || Object.keys(body).some(key => !allowed.includes(key))) throw new MobileApiError(400, 'invalid_operation')
    if (['messages', 'send', 'delete'].includes(operation) && (typeof body.conversationId !== 'string' || !UUID.test(body.conversationId))) throw new MobileApiError(400, 'invalid_conversation')
    switch (operation) {
      case 'list': return getConversations()
      case 'messages': return getMessages(body.conversationId as string)
      case 'delete': return deleteConversation(body.conversationId as string)
      case 'create': {
        if (!['general', 'workout_plan', 'nutrition', 'progress'].includes(String(body.context)) || typeof body.title !== 'string' || !body.title.trim() || body.title.length > 160) throw new MobileApiError(400, 'invalid_conversation')
        return createConversation(body.context as ConversationContext, body.title.trim())
      }
      case 'send': {
        if (typeof body.content !== 'string' || !body.content.trim() || body.content.length > 8000) throw new MobileApiError(400, 'invalid_message', 'El mensaje debe tener entre 1 y 8000 caracteres.')
        return sendMessage(body.conversationId as string, body.content.trim())
      }
    }
  })
}

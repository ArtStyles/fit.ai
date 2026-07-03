import { getConversations } from '@/app/actions/chat'
import { ChatContainer } from '@/components/chat/ChatContainer'

export const metadata = { title: 'Coach IA · Vekira' }

export default async function ChatPage() {
  const conversations = await getConversations()
  return <ChatContainer initialConversations={conversations} />
}

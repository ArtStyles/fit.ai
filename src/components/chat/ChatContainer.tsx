'use client'

import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, MessageSquare, Plus, Dumbbell, TrendingUp, Apple, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PendingLink } from '@/components/navigation/PendingLink'
import {
  createConversation,
  sendMessage,
  getMessages,
  deleteConversation,
  type ConversationContext,
  type ConversationRow,
  type MessageRow,
} from '@/app/actions/chat'
import { LongPressMenu, type LongPressAction } from '@/components/ui'
import { MessageBubble } from './MessageBubble'
import { ChatInputBar } from './ChatInputBar'

type View = 'list' | 'chat'

const CONTEXT_OPTIONS: {
  value: ConversationContext
  label: string
  description: string
  Icon: React.ComponentType<{ className?: string }>
}[] = [
  { value: 'workout_plan', label: 'Plan de entrenamiento', description: 'Ajusta ejercicios, volumen o distribución de días', Icon: Dumbbell },
  { value: 'progress',     label: 'Progreso',             description: 'Analiza tus marcas, racha y progresión',          Icon: TrendingUp },
  { value: 'nutrition',    label: 'Nutrición',             description: 'Proteínas, calorías y estrategias de dieta',      Icon: Apple },
  { value: 'general',      label: 'General',               description: 'Cualquier pregunta sobre fitness',                Icon: MessageSquare },
]

const CONTEXT_LABELS: Record<ConversationContext, string> = {
  workout_plan: 'Entrenamiento',
  progress:     'Progreso',
  nutrition:    'Nutrición',
  general:      'General',
}

interface Props {
  initialConversations: ConversationRow[]
}

export function ChatContainer({ initialConversations }: Props) {
  const [view, setView]                           = useState<View>('list')
  const [conversations, setConversations]         = useState<ConversationRow[]>(initialConversations)
  const [selected, setSelected]                   = useState<ConversationRow | null>(null)
  const [messages, setMessages]                   = useState<MessageRow[]>([])
  const [loadingMessages, setLoadingMessages]     = useState(false)
  const [sending, setSending]                     = useState(false)
  const [showNewDialog, setShowNewDialog]         = useState(false)
  const [creating, setCreating]                   = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSelectConversation(conv: ConversationRow) {
    setSelected(conv)
    setView('chat')
    setLoadingMessages(true)
    const msgs = await getMessages(conv.id)
    setMessages(msgs)
    setLoadingMessages(false)
  }

  async function handleNewConversation(context: ConversationContext) {
    setCreating(true)
    const label = CONTEXT_LABELS[context]
    const date  = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    const title = `${label} · ${date}`

    const result = await createConversation(context, title)
    setCreating(false)
    if (!result.success || !result.conversationId) return

    const newConv: ConversationRow = {
      id:         result.conversationId,
      title,
      context,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setConversations(prev => [newConv, ...prev])
    setShowNewDialog(false)
    setSelected(newConv)
    setMessages([])
    setView('chat')
  }

  async function handleSendMessage(content: string) {
    if (!selected || sending) return

    const tempId = Date.now()
    const tempUser: MessageRow = {
      id:              `tmp-u-${tempId}`,
      conversation_id: selected.id,
      role:            'user',
      content,
      created_at:      new Date().toISOString(),
    }
    const tempAssistant: MessageRow = {
      id:              `tmp-a-${tempId}`,
      conversation_id: selected.id,
      role:            'assistant',
      content:         '',
      created_at:      new Date().toISOString(),
    }

    setMessages(prev => [...prev, tempUser, tempAssistant])
    setSending(true)

    const result = await sendMessage(selected.id, content)

    if (result.success && result.assistantContent) {
      setMessages(prev => prev.map(msg => {
        if (msg.id === tempUser.id)      return { ...msg, id: result.userMessageId ?? msg.id }
        if (msg.id === tempAssistant.id) return { ...msg, id: result.assistantMessageId ?? msg.id, content: result.assistantContent! }
        return msg
      }))
      setConversations(prev => prev.map(c =>
        c.id === selected.id ? { ...c, updated_at: new Date().toISOString() } : c,
      ))
    } else {
      setMessages(prev => prev.filter(m => m.id !== tempUser.id && m.id !== tempAssistant.id))
    }

    setSending(false)
  }

  async function handleDeleteConversation(id: string) {
    setConversations(prev => prev.filter(c => c.id !== id))
    await deleteConversation(id)
  }

  function handleBack() {
    setView('list')
    setSelected(null)
    setMessages([])
  }

  // ── Chat view ───────────────────────────────────────────────────────────────

  if (view === 'chat' && selected) {
    return (
      <div className="flex h-dvh flex-col bg-background pb-16">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/40 bg-background/80 px-4 py-3 backdrop-blur-sm">
          <button
            type="button"
            onClick={handleBack}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{selected.title}</p>
            <p className="text-xs text-muted-foreground/70">
              {selected.context ? CONTEXT_LABELS[selected.context] : 'General'}
            </p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loadingMessages ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
                <MessageSquare className="h-6 w-6" />
              </div>
              <p className="text-sm text-muted-foreground">
                Conversación iniciada.<br />¿En qué te puedo ayudar?
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <ChatInputBar onSend={handleSendMessage} disabled={sending || loadingMessages} />
      </div>
    )
  }

  // ── List view ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/80 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div className="flex items-center gap-2.5">
            <PendingLink
              href="/dashboard"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </PendingLink>
            <h1 className="font-display text-xl font-bold text-foreground">Coach IA</h1>
          </div>
          <button
            type="button"
            onClick={() => setShowNewDialog(true)}
            className="flex min-h-[44px] items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 active:bg-violet-700"
          >
            <Plus className="h-4 w-4" />
            Nueva
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pt-6">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400">
              <MessageSquare className="h-8 w-8" />
            </div>
            <div>
              <p className="font-semibold text-white">Sin conversaciones aún</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pregúntale a tu coach sobre tu entrenamiento, progreso o nutrición
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewDialog(true)}
              className="mt-2 flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
            >
              <Plus className="h-4 w-4" />
              Iniciar conversación
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {conversations.map(conv => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                onSelect={() => handleSelectConversation(conv)}
                onDelete={() => handleDeleteConversation(conv.id)}
              />
            ))}
          </ul>
        )}
      </main>

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="mx-4 max-w-sm gap-0 rounded-2xl border-border/60 bg-popover p-0">
          <DialogHeader className="border-b border-border/40 px-5 py-4">
            <DialogTitle className="text-base text-white">Nueva conversación</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 p-4">
            {CONTEXT_OPTIONS.map(({ value, label, description, Icon }) => (
              <button
                key={value}
                type="button"
                disabled={creating}
                onClick={() => handleNewConversation(value)}
                className="flex items-center gap-3 rounded-xl border border-border/40 bg-muted/10 p-3.5 text-left transition-colors hover:border-violet-500/40 hover:bg-violet-500/5 disabled:opacity-50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ConversationItem({
  conversation,
  onSelect,
  onDelete,
}: {
  conversation: ConversationRow
  onSelect: () => void
  onDelete: () => void
}) {
  const label = conversation.context ? CONTEXT_LABELS[conversation.context] : 'General'
  const date  = new Date(conversation.updated_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

  const actions: LongPressAction[] = [
    { id: 'delete', label: 'Eliminar', icon: Trash2, variant: 'danger', onSelect: onDelete },
  ]

  return (
    <li>
      <LongPressMenu actions={actions} label={conversation.title}>
        <button
          type="button"
          onClick={onSelect}
          className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-border/40 bg-muted/10 p-3.5 text-left transition-colors hover:border-violet-500/30 hover:bg-violet-500/5"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{conversation.title}</p>
            <p className="text-xs text-muted-foreground/70">{label} · {date}</p>
          </div>
        </button>
      </LongPressMenu>
    </li>
  )
}

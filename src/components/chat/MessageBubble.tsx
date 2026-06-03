import { Bot } from 'lucide-react'
import type { MessageRow } from '@/app/actions/chat'

interface Props {
  message: MessageRow
}

export function MessageBubble({ message }: Props) {
  const isUser     = message.role === 'user'
  const isThinking = !isUser && !message.content

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] rounded-2xl rounded-br-sm bg-gradient-to-br from-violet-600 to-indigo-600 px-4 py-3 text-sm leading-relaxed text-white shadow-md shadow-violet-500/20">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-end gap-2.5 justify-start">
      {/* AI avatar */}
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/20 text-violet-300">
        <Bot className="h-3.5 w-3.5" />
      </div>

      <div className="max-w-[82%] rounded-2xl rounded-bl-sm border border-border/50 bg-muted/30 px-4 py-3 text-sm leading-relaxed text-foreground backdrop-blur-sm">
        {isThinking ? (
          <div className="flex items-center gap-1.5 py-0.5">
            <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:0ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:300ms]" />
          </div>
        ) : (
          <p className="whitespace-pre-wrap">{message.content}</p>
        )}
      </div>
    </div>
  )
}

'use client'

import { usePathname } from 'next/navigation'
import { MessageSquare, Sparkles } from 'lucide-react'
import { PendingLink } from './PendingLink'

// Hidden on full-screen flows and on the chat route itself (you're already there)
const HIDDEN_PREFIXES = ['/session', '/plans/generate', '/chat']

export function ChatFab() {
  const pathname = usePathname()

  if (HIDDEN_PREFIXES.some(p => pathname.startsWith(p))) return null

  return (
    <PendingLink
      href="/chat"
      showSpinner={false}
      aria-label="Abrir Coach IA"
      className="group fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-600/40 ring-1 ring-white/10 transition-transform duration-200 active:scale-95"
    >
      {/* soft sonar halo (single ping; suppressed under prefers-reduced-motion) */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full bg-violet-500/30 animate-ping [animation-duration:2.6s]"
      />

      {/* chat icon */}
      <MessageSquare className="relative h-6 w-6" />

      {/* AI sparkle badge */}
      <span
        aria-hidden
        className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-background ring-1 ring-violet-400/40"
      >
        <Sparkles className="h-3 w-3 text-violet-300" />
      </span>
    </PendingLink>
  )
}

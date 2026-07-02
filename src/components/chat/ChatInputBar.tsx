'use client'

import { useState, useRef, type KeyboardEvent } from 'react'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/I18nProvider'

interface Props {
  onSend: (content: string) => void
  disabled?: boolean
}

export function ChatInputBar({ onSend, disabled }: Props) {
  const { t } = useI18n()
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSend() {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInput() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  const canSend = !disabled && value.trim().length > 0

  return (
    <div className="border-t border-border/50 bg-background/95 px-4 py-3 backdrop-blur-md">
      <div
        className={cn(
          'flex items-end gap-2 rounded-2xl border px-4 py-3 transition-colors duration-200',
          'bg-muted/40',
          canSend
            ? 'border-violet-500/50 shadow-[0_0_0_1px_rgba(139,92,246,0.15)]'
            : 'border-border/60',
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={t('Escribe un mensaje…')}
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50"
          style={{ minHeight: '24px', maxHeight: '120px' }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          aria-label={t('Enviar mensaje')}
          className={cn(
            'mb-0.5 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-all duration-200',
            canSend
              ? 'bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/25 hover:from-violet-500 hover:to-indigo-500 hover:shadow-violet-500/40 active:scale-95'
              : 'bg-muted/60 text-muted-foreground/40 cursor-not-allowed',
          )}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1.5 text-center text-[11px] text-muted-foreground/40">
        {t('Enter para enviar · Shift+Enter para nueva línea')}
      </p>
    </div>
  )
}

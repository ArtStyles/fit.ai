'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateLanguage } from '@/app/actions/settings'
import { useToast } from '@/components/feedback/ToastProvider'
import { SettingsStatus } from '@/components/settings/SettingsStatus'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { AppLanguage } from '@/lib/i18n'

type LanguageOption = {
  value: AppLanguage
  title: string
  description: string
}

type FeedbackCopy = {
  saving: string
  saved: string
  error: string
}

const DEFAULT_FEEDBACK_COPY: FeedbackCopy = {
  saving: 'Guardando idioma…',
  saved: 'Idioma guardado.',
  error: 'No se pudo guardar el idioma.',
}

export function LanguageSelector({
  currentLanguage,
  legend,
  options,
  feedbackCopy = DEFAULT_FEEDBACK_COPY,
}: {
  currentLanguage: AppLanguage
  legend: string
  options: readonly LanguageOption[]
  feedbackCopy?: FeedbackCopy
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const { t } = useI18n()
  const [selected, setSelected] = useState(currentLanguage)
  const [pending, setPending] = useState(false)
  const [, startTransition] = useTransition()
  const [announcement, setAnnouncement] = useState<{ message: string; tone: 'info' | 'success' | 'error' } | null>(null)

  function selectLanguage(language: AppLanguage) {
    if (pending || language === selected) return

    const previousLanguage = selected
    setSelected(language)
    setPending(true)
    setAnnouncement({ message: feedbackCopy.saving, tone: 'info' })

    startTransition(() => {
      void updateLanguage(language)
        .then(result => {
          if (!result.ok) {
            const message = t(result.error || feedbackCopy.error)
            setSelected(previousLanguage)
            setAnnouncement({ message, tone: 'error' })
            showToast({ title: message, variant: 'error' })
            return
          }

          setAnnouncement({ message: feedbackCopy.saved, tone: 'success' })
          router.refresh()
        })
        .catch(() => {
          setSelected(previousLanguage)
          setAnnouncement({ message: feedbackCopy.error, tone: 'error' })
          showToast({ title: feedbackCopy.error, variant: 'error' })
        })
        .finally(() => setPending(false))
    })
  }

  return (
    <div className="space-y-4">
      <fieldset role="radiogroup" aria-label={legend} className="space-y-3">
        <legend className="sr-only">{legend}</legend>
        {options.map(option => {
          const isSelected = selected === option.value

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={pending}
              onClick={() => selectLanguage(option.value)}
              className={`flex min-h-11 w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${
                isSelected
                  ? 'border-violet-500/60 bg-violet-500/10'
                  : 'border-border/60 bg-muted/10 hover:bg-muted/20'
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  isSelected ? 'border-violet-400' : 'border-muted-foreground/60'
                }`}
              >
                {isSelected ? <span className="h-2.5 w-2.5 rounded-full bg-violet-400" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{option.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{option.description}</span>
              </span>
            </button>
          )
        })}
      </fieldset>

      <p role="status" aria-live="polite" className="sr-only">{announcement?.message ?? ''}</p>
      {announcement ? <SettingsStatus tone={announcement.tone}>{announcement.message}</SettingsStatus> : null}
    </div>
  )
}

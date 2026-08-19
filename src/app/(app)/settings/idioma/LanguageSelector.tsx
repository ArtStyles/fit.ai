'use client'

import { useReducer, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateLanguage } from '@/app/actions/settings'
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

type LanguageFeedbackState = {
  message: string
  tone: 'info' | 'success' | 'error'
}

export type LanguageSelectionState = {
  selected: AppLanguage
  pending: boolean
  feedback: LanguageFeedbackState | null
}

type LanguageSelectionAction =
  | { type: 'select'; language: AppLanguage; message: string }
  | { type: 'success'; message: string }
  | { type: 'failure'; language: AppLanguage; message: string }

type LanguageSaveResult =
  | { ok: true }
  | { ok: false; error: string }

const DEFAULT_FEEDBACK_COPY: FeedbackCopy = {
  saving: 'Guardando idioma…',
  saved: 'Idioma guardado.',
  error: 'No se pudo guardar el idioma.',
}

export function languageSelectionReducer(
  state: LanguageSelectionState,
  action: LanguageSelectionAction,
): LanguageSelectionState {
  if (action.type === 'select') {
    return {
      selected: action.language,
      pending: true,
      feedback: { message: action.message, tone: 'info' },
    }
  }
  if (action.type === 'success') {
    return {
      ...state,
      pending: false,
      feedback: { message: action.message, tone: 'success' },
    }
  }
  return {
    selected: action.language,
    pending: false,
    feedback: { message: action.message, tone: 'error' },
  }
}

export async function persistLanguageSelection({
  language,
  save,
  refresh,
  fallbackError,
}: {
  language: AppLanguage
  save: (language: AppLanguage) => Promise<{ ok: boolean; error?: string }>
  refresh: () => void
  fallbackError: string
}): Promise<LanguageSaveResult> {
  let result: { ok: boolean; error?: string }
  try {
    result = await save(language)
  } catch {
    return { ok: false, error: fallbackError }
  }

  if (!result.ok) return { ok: false, error: result.error || fallbackError }
  refresh()
  return { ok: true }
}

export function LanguageFeedback({
  feedback,
}: {
  feedback: LanguageFeedbackState | null
}) {
  if (!feedback) return null
  return <SettingsStatus tone={feedback.tone}>{feedback.message}</SettingsStatus>
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
  const { t } = useI18n()
  const [state, dispatch] = useReducer(languageSelectionReducer, {
    selected: currentLanguage,
    pending: false,
    feedback: null,
  })
  const [, startTransition] = useTransition()

  function selectLanguage(language: AppLanguage) {
    if (state.pending || language === state.selected) return

    const previousLanguage = state.selected
    dispatch({ type: 'select', language, message: feedbackCopy.saving })

    startTransition(() => {
      void persistLanguageSelection({
        language,
        save: updateLanguage,
        refresh: () => router.refresh(),
        fallbackError: feedbackCopy.error,
      }).then(result => {
        if (result.ok) {
          dispatch({ type: 'success', message: feedbackCopy.saved })
          return
        }
        dispatch({
          type: 'failure',
          language: previousLanguage,
          message: t(result.error),
        })
      })
    })
  }

  return (
    <div className="space-y-4">
      <fieldset className="space-y-3">
        <legend className="sr-only">{legend}</legend>
        {options.map(option => {
          const isSelected = state.selected === option.value

          return (
            <label
              key={option.value}
              className={`relative flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-2xl border p-4 text-left transition-colors has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:disabled]:cursor-wait has-[:disabled]:opacity-60 ${
                isSelected
                  ? 'border-violet-500/60 bg-violet-500/10'
                  : 'border-border/60 bg-muted/10 hover:bg-muted/20'
              }`}
            >
              <input
                type="radio"
                name="language"
                value={option.value}
                checked={isSelected}
                disabled={state.pending}
                onChange={() => selectLanguage(option.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
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
            </label>
          )
        })}
      </fieldset>

      <LanguageFeedback feedback={state.feedback} />
    </div>
  )
}

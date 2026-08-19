'use client'

import { createContext, useCallback, useContext, useEffect, useMemo } from 'react'
import {
  translate,
  type AppLanguage,
  type TranslationValues,
} from '@/lib/i18n'
import { resolveUserTimeZone } from '@/lib/workouts/schedule'

type I18nValue = {
  language: AppLanguage
  timeZone: string
  t: (source: string, values?: TranslationValues) => string
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({
  language,
  timeZone,
  children,
  syncDocumentLanguage = true,
}: {
  language: AppLanguage
  timeZone?: string | null
  children: React.ReactNode
  syncDocumentLanguage?: boolean
}) {
  const resolvedTimeZone = resolveUserTimeZone(timeZone)
  const t = useCallback(
    (source: string, values?: TranslationValues) => translate(language, source, values),
    [language],
  )
  const value = useMemo(
    () => ({ language, timeZone: resolvedTimeZone, t }),
    [language, resolvedTimeZone, t],
  )

  useEffect(() => {
    if (syncDocumentLanguage) document.documentElement.lang = language
  }, [language, syncDocumentLanguage])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used within I18nProvider')
  return context
}

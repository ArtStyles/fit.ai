'use client'

import { useRef } from 'react'
import { updateLanguage } from '@/app/actions/settings'
import type { AppLanguage } from '@/lib/i18n'

type LanguageOption = {
  value: AppLanguage
  title: string
}

export function LanguageSelector({
  currentLanguage,
  legend,
  options,
}: {
  currentLanguage: AppLanguage
  legend: string
  options: readonly LanguageOption[]
}) {
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form
      ref={formRef}
      action={updateLanguage}
      onChange={event => {
        if ((event.target as HTMLInputElement).name === 'language') {
          formRef.current?.requestSubmit()
        }
      }}
    >
      <fieldset className="space-y-3">
        <legend className="sr-only">{legend}</legend>
        {options.map(option => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border/60 bg-muted/10 p-4 has-[:checked]:border-violet-500/60 has-[:checked]:bg-violet-500/10"
          >
            <input
              type="radio"
              name="language"
              value={option.value}
              defaultChecked={currentLanguage === option.value}
              className="h-4 w-4 accent-violet-500"
            />
            <span className="text-sm font-semibold text-foreground">{option.title}</span>
          </label>
        ))}
      </fieldset>
    </form>
  )
}

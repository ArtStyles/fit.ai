'use client'

import type { ReactNode } from 'react'
import { SubmitButton } from '@/components/feedback/SubmitButton'
import { useI18n } from '@/components/i18n/I18nProvider'
import { cn } from '@/lib/utils'

export function SettingsSaveBar({
  label,
  pendingLabel,
  children,
  className,
  disabled,
}: {
  label: string
  pendingLabel?: string
  children?: ReactNode
  className?: string
  disabled?: boolean
}) {
  const { t } = useI18n()

  return (
    <div className="sticky bottom-0 -mx-4 border-t border-border/60 bg-background/95 px-4 pt-3 pb-[var(--app-safe-area-bottom)] backdrop-blur sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pt-0 sm:pb-0">
      <SubmitButton
        label={label}
        pendingLabel={pendingLabel ?? t('Guardando')}
        disabled={disabled}
        className={cn('h-11 w-full bg-violet-500 text-white hover:bg-violet-600', className)}
      >
        {children}
      </SubmitButton>
    </div>
  )
}

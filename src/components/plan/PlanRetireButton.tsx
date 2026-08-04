'use client'

import { Trash2 } from 'lucide-react'
import { deletePlan } from '@/app/actions/plan'
import { useI18n } from '@/components/i18n/I18nProvider'

interface PlanRetireButtonProps {
  planId: string
  planName: string
}

export function PlanRetireButton({ planId, planName }: PlanRetireButtonProps) {
  const { t } = useI18n()
  const label = `${t('Archivar')} ${planName}`

  return (
    <form
      action={deletePlan}
      onSubmit={event => {
        const confirmed = window.confirm(
          t('El plan se archivará, pero tu historial permanecerá intacto.'),
        )
        if (!confirmed) event.preventDefault()
      }}
    >
      <input type="hidden" name="planId" value={planId} />
      <button
        type="submit"
        aria-label={label}
        title={label}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-red-500/10 hover:text-red-300 focus-visible:ring-2 focus-visible:ring-red-400"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </form>
  )
}

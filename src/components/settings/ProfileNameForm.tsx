'use client'

import { useActionState } from 'react'
import { updateProfileName, type ProfileNameActionState } from '@/app/actions/settings'
import { SettingsField } from './SettingsField'
import { SubmitButton } from '@/components/feedback/SubmitButton'
import { SettingsStatus } from './SettingsStatus'
import { useI18n } from '@/components/i18n/I18nProvider'
import { preserveSettingsFormValues } from './preserveSettingsFormValues'

const initialState: ProfileNameActionState = {
  ok: false,
  message: null,
  fieldErrors: {},
}

export function ProfileNameForm({ initialName }: { initialName: string }) {
  const { t } = useI18n()
  const [state, formAction] = useActionState(updateProfileName, initialState)

  return (
    <form ref={preserveSettingsFormValues} action={formAction} className="space-y-4">
      <SettingsField
        id="fullName"
        label={t('Nombre')}
        error={state.fieldErrors.fullName ? t(state.fieldErrors.fullName) : undefined}
      >
        <input
          id="fullName"
          name="fullName"
          autoComplete="name"
          defaultValue={initialName}
          maxLength={100}
          className="h-12 w-full rounded-xl border border-input bg-background px-4 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        />
      </SettingsField>

      {state.message ? (
        <SettingsStatus tone={state.ok ? 'success' : 'error'}>{t(state.message)}</SettingsStatus>
      ) : null}

      <SubmitButton label={t('Guardar cambios')} pendingLabel={t('Guardando')} className="min-h-12 w-full rounded-xl bg-violet-600 text-white hover:bg-violet-700" />
    </form>
  )
}

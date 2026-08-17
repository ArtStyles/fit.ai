'use client'

import { useFormState } from 'react-dom'
import { updateProfileName, type ProfileNameActionState } from '@/app/actions/settings'
import { SettingsField } from './SettingsField'
import { SettingsSaveBar } from './SettingsSaveBar'
import { SettingsStatus } from './SettingsStatus'
import { useI18n } from '@/components/i18n/I18nProvider'

const initialState: ProfileNameActionState = {
  ok: false,
  message: null,
  fieldErrors: {},
}

export function ProfileNameForm({ initialName }: { initialName: string }) {
  const { t } = useI18n()
  const [state, formAction] = useFormState(updateProfileName, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <SettingsField
        id="fullName"
        label={t('Nombre')}
        error={state.fieldErrors.fullName ? t(state.fieldErrors.fullName) : undefined}
      >
        <input
          id="fullName"
          name="fullName"
          defaultValue={initialName}
          maxLength={100}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        />
      </SettingsField>

      {state.message ? (
        <SettingsStatus tone={state.ok ? 'success' : 'error'}>{t(state.message)}</SettingsStatus>
      ) : null}

      <SettingsSaveBar label={t('Guardar')} pendingLabel={t('Guardando')} />
    </form>
  )
}

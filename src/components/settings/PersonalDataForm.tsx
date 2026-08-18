'use client'

import { useFormState } from 'react-dom'
import { updatePersonalData } from '@/app/actions/settings'
import { useI18n } from '@/components/i18n/I18nProvider'
import {
  INITIAL_PERSONAL_DATA_STATE,
  PERSONAL_DATA_GENDERS,
  type PersonalDataValue,
} from '@/lib/profile/personalData'
import { SettingsField } from './SettingsField'
import { SettingsSaveBar } from './SettingsSaveBar'
import { SettingsSection } from './SettingsSection'
import { SettingsStatus } from './SettingsStatus'

export function PersonalDataForm({
  initial,
  currentWeightKg,
}: {
  initial: PersonalDataValue
  currentWeightKg: number | null
}) {
  const { t } = useI18n()
  const [state, action] = useFormState(updatePersonalData, INITIAL_PERSONAL_DATA_STATE)

  return (
    <form action={action} className="space-y-5">
      {state.message ? (
        <SettingsStatus tone={state.ok ? 'success' : 'error'}>{t(state.message)}</SettingsStatus>
      ) : null}
      {state.formError ? <SettingsStatus tone="error">{t(state.formError)}</SettingsStatus> : null}

      <SettingsSection
        title={t('Información personal')}
        description={t('Datos opcionales para adaptar tus recomendaciones.')}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <SettingsField
            id="heightCm"
            label={t('Altura')}
            unit="cm"
            help={t('En centímetros, entre 100 y 250.')}
            error={state.fieldErrors.heightCm ? t(state.fieldErrors.heightCm) : undefined}
          >
            <input
              id="heightCm"
              name="heightCm"
              type="number"
              inputMode="decimal"
              min={100}
              max={250}
              step="0.1"
              defaultValue={initial.heightCm ?? ''}
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            />
          </SettingsField>

          <SettingsField
            id="dateOfBirth"
            label={t('Fecha de nacimiento')}
            help={t('Debes tener entre 18 y 100 años.')}
            error={state.fieldErrors.dateOfBirth ? t(state.fieldErrors.dateOfBirth) : undefined}
          >
            <input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              defaultValue={initial.dateOfBirth ?? ''}
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            />
          </SettingsField>

          <div className="sm:col-span-2">
            <SettingsField
              id="gender"
              label={t('Género')}
              help={t('Este dato es opcional.')}
              error={state.fieldErrors.gender ? t(state.fieldErrors.gender) : undefined}
            >
              <select
                id="gender"
                name="gender"
                defaultValue={initial.gender ?? ''}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              >
                <option value="">{t('Sin definir')}</option>
                {PERSONAL_DATA_GENDERS.map(({ value, label }) => (
                  <option key={value} value={value}>{t(label)}</option>
                ))}
              </select>
            </SettingsField>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('Peso actual')}
        description={t('El peso se actualiza desde tu historial de medidas.')}
      >
        <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-background/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-lg font-semibold text-foreground">
            {currentWeightKg === null ? t('Sin peso registrado') : `${currentWeightKg} kg`}
          </p>
          <a
            href="/medidas?from=settings"
            className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-violet-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            {t('Registrar o actualizar peso')}
          </a>
        </div>
      </SettingsSection>

      <SettingsSaveBar label={t('Guardar datos')} pendingLabel={t('Guardando datos')} />
    </form>
  )
}

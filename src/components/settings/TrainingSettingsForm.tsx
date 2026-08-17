'use client'

import { useState } from 'react'
import { useFormState } from 'react-dom'
import { updateTrainingSettings } from '@/app/actions/settings'
import { useI18n } from '@/components/i18n/I18nProvider'
import {
  EQUIPMENT_OPTIONS,
  FITNESS_LEVELS,
  GYM_TYPES,
  SESSION_DURATIONS,
  TRAINING_FREQUENCIES,
  TRAINING_GOALS,
  WEEK_DAYS,
  type TrainingSettingsValue,
} from '@/lib/profile/trainingPreferences'
import { INITIAL_TRAINING_SETTINGS_STATE } from '@/lib/profile/trainingSettingsActionState'
import { SettingsChoiceGroup } from './SettingsChoiceGroup'
import { SettingsField } from './SettingsField'
import { SettingsSaveBar } from './SettingsSaveBar'
import { SettingsSection } from './SettingsSection'
import { SettingsStatus } from './SettingsStatus'

type ReadinessStatus = 'pending' | 'cleared' | 'modified' | 'professional_clearance_required'

export function daySelectionMessage(
  daysPerWeek: number,
  selectedDays: readonly number[],
  t: (key: string, values?: Record<string, string | number>) => string,
): string | null {
  const difference = selectedDays.length - daysPerWeek
  if (difference === 0) return null

  const count = Math.abs(difference)
  if (difference > 0) {
    return t(count === 1 ? 'Quita {count} día para continuar.' : 'Quita {count} días para continuar.', { count })
  }

  return t(count === 1 ? 'Elige {count} día más para continuar.' : 'Elige {count} días más para continuar.', { count })
}

function readinessCopy(status: ReadinessStatus) {
  switch (status) {
    case 'cleared':
      return { tone: 'success' as const, message: 'Listo para entrenar.' }
    case 'modified':
      return { tone: 'warning' as const, message: 'Entrena con las adaptaciones indicadas.' }
    case 'professional_clearance_required':
      return { tone: 'warning' as const, message: 'Consulta a un profesional antes de entrenar.' }
    case 'pending':
      return { tone: 'info' as const, message: 'Completa tu información de preparación para recibir orientación.' }
  }
}

function toggleSelection<T extends string | number>(selected: readonly T[], value: T): T[] {
  return selected.includes(value)
    ? selected.filter(item => item !== value)
    : [...selected, value]
}

export function TrainingSettingsForm({
  initial,
  readinessStatus,
  hasActivePlan,
}: {
  initial: TrainingSettingsValue
  readinessStatus: ReadinessStatus
  hasActivePlan: boolean
}) {
  const { t } = useI18n()
  const [form, setForm] = useState({
    ...initial,
    availableEquipment: initial.gymType === 'home_no_equipment' ? [] : initial.availableEquipment,
  })
  const [state, action] = useFormState(updateTrainingSettings, INITIAL_TRAINING_SETTINGS_STATE)
  const dayMessage = daySelectionMessage(form.daysPerWeek, form.preferredWorkoutDays, t)
  const dayCountValid = dayMessage === null
  const readiness = readinessCopy(readinessStatus)

  const setPrimaryGoal = (primaryGoal: TrainingSettingsValue['primaryGoal']) => {
    setForm(current => ({ ...current, primaryGoal }))
  }
  const setFitnessLevel = (fitnessLevel: TrainingSettingsValue['fitnessLevel']) => {
    setForm(current => ({ ...current, fitnessLevel }))
  }
  const setDaysPerWeek = (daysPerWeek: TrainingSettingsValue['daysPerWeek']) => {
    setForm(current => ({ ...current, daysPerWeek }))
  }
  const setSessionDuration = (sessionDurationMinutes: TrainingSettingsValue['sessionDurationMinutes']) => {
    setForm(current => ({ ...current, sessionDurationMinutes }))
  }
  const setGymType = (gymType: TrainingSettingsValue['gymType']) => {
    setForm(current => ({
      ...current,
      gymType,
      availableEquipment: gymType === 'home_no_equipment' ? [] : current.availableEquipment,
    }))
  }
  const toggleDay = (day: number) => {
    setForm(current => ({
      ...current,
      preferredWorkoutDays: toggleSelection(current.preferredWorkoutDays, day).sort((a, b) => a - b),
    }))
  }
  const toggleEquipment = (equipment: TrainingSettingsValue['availableEquipment'][number]) => {
    setForm(current => ({
      ...current,
      availableEquipment: toggleSelection(current.availableEquipment, equipment),
    }))
  }

  return (
    <form action={action} className="space-y-5">
      {state.message ? <SettingsStatus tone={state.ok ? 'success' : 'error'}>{t(state.message)}</SettingsStatus> : null}
      {state.formError ? <SettingsStatus tone="error">{t(state.formError)}</SettingsStatus> : null}

      <input type="hidden" name="primaryGoal" value={form.primaryGoal} />
      <input type="hidden" name="fitnessLevel" value={form.fitnessLevel} />
      <input type="hidden" name="daysPerWeek" value={form.daysPerWeek} />
      <input type="hidden" name="sessionDurationMinutes" value={form.sessionDurationMinutes} />
      <input type="hidden" name="gymType" value={form.gymType} />
      {form.preferredWorkoutDays.map(day => (
        <input key={day} type="hidden" name="preferredWorkoutDays" value={day} />
      ))}
      {form.availableEquipment.map(item => (
        <input key={item} type="hidden" name="availableEquipment" value={item} />
      ))}

      <SettingsSection
        title={t('Objetivo y experiencia')}
        description={t('Elige el objetivo y el nivel que guiarán tus próximas generaciones.')}
      >
        <div className="space-y-5">
          <SettingsChoiceGroup
            id="primaryGoal"
            label={t('Objetivo')}
            options={TRAINING_GOALS.map(option => ({ value: option.value, label: t(option.label) }))}
            selected={[form.primaryGoal]}
            multiple={false}
            onToggle={setPrimaryGoal}
            error={state.fieldErrors.primaryGoal ? t(state.fieldErrors.primaryGoal) : undefined}
          />
          <SettingsChoiceGroup
            id="fitnessLevel"
            label={t('Nivel')}
            options={FITNESS_LEVELS.map(option => ({ value: option.value, label: t(option.label) }))}
            selected={[form.fitnessLevel]}
            multiple={false}
            onToggle={setFitnessLevel}
            error={state.fieldErrors.fitnessLevel ? t(state.fieldErrors.fitnessLevel) : undefined}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('Disponibilidad')}
        description={t('Define tu frecuencia, duración y los días exactos en los que quieres entrenar.')}
      >
        <div className="space-y-5">
          <SettingsChoiceGroup
            id="daysPerWeek"
            label={t('Frecuencia semanal')}
            options={TRAINING_FREQUENCIES.map(value => ({ value, label: t('{count} días por semana', { count: value }) }))}
            selected={[form.daysPerWeek]}
            multiple={false}
            onToggle={setDaysPerWeek}
            error={state.fieldErrors.daysPerWeek ? t(state.fieldErrors.daysPerWeek) : undefined}
          />
          <SettingsChoiceGroup
            id="sessionDurationMinutes"
            label={t('Duración por sesión')}
            options={SESSION_DURATIONS.map(value => ({ value, label: t('{minutes} min', { minutes: value }) }))}
            selected={[form.sessionDurationMinutes]}
            multiple={false}
            onToggle={setSessionDuration}
            error={state.fieldErrors.sessionDurationMinutes ? t(state.fieldErrors.sessionDurationMinutes) : undefined}
          />
          <SettingsChoiceGroup
            id="preferredWorkoutDays"
            label={t('Semana de entrenamiento')}
            options={WEEK_DAYS.map(day => ({ value: day.value, label: t(day.label) }))}
            selected={form.preferredWorkoutDays}
            multiple
            onToggle={toggleDay}
            error={state.fieldErrors.preferredWorkoutDays ? t(state.fieldErrors.preferredWorkoutDays) : dayMessage ?? undefined}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('Espacio y equipo')}
        description={t('Elige dónde entrenas y el equipo que el motor puede usar.')}
      >
        <div className="space-y-5">
          <SettingsChoiceGroup
            id="gymType"
            label={t('Gimnasio')}
            options={GYM_TYPES.map(option => ({ value: option.value, label: t(option.label) }))}
            selected={[form.gymType]}
            multiple={false}
            onToggle={setGymType}
            error={state.fieldErrors.gymType ? t(state.fieldErrors.gymType) : undefined}
          />
          {form.gymType !== 'home_no_equipment' ? (
            <SettingsChoiceGroup
              id="availableEquipment"
              label={t('Equipo disponible')}
              options={EQUIPMENT_OPTIONS.map(option => ({ value: option.value, label: t(option.label) }))}
              selected={form.availableEquipment}
              multiple
              onToggle={toggleEquipment}
              error={state.fieldErrors.availableEquipment ? t(state.fieldErrors.availableEquipment) : undefined}
            />
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('Seguridad')}
        description={t('Describe lesiones o limitaciones relevantes para tus próximas recomendaciones.')}
      >
        <div className="space-y-5">
          <SettingsField
            id="injuries"
            label={t('Lesiones o limitaciones')}
            error={state.fieldErrors.injuries ? t(state.fieldErrors.injuries) : undefined}
          >
            <textarea
              id="injuries"
              name="injuries"
              rows={4}
              maxLength={1000}
              value={form.injuries ?? ''}
              onChange={event => setForm(current => ({ ...current, injuries: event.target.value || null }))}
              className="min-h-24 w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            />
          </SettingsField>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{t('Estado de preparación')}</p>
            <SettingsStatus tone={readiness.tone}>{t(readiness.message)}</SettingsStatus>
          </div>
        </div>
      </SettingsSection>

      <SettingsStatus tone="info">{t('Guardar estas preferencias no cambia automáticamente tu plan activo.')}</SettingsStatus>
      {hasActivePlan ? (
        <a
          href="/plan"
          className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-violet-300 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          {t('Revisar o adaptar el plan')}
        </a>
      ) : null}
      <SettingsSaveBar
        label={t('Guardar preferencias')}
        pendingLabel={t('Guardando preferencias')}
        disabled={!dayCountValid}
      />
    </form>
  )
}

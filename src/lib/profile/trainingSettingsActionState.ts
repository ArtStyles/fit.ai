import type { TrainingSettingsFieldErrors } from './trainingPreferences'

export type TrainingSettingsActionState = {
  ok: boolean
  message: string | null
  formError: string | null
  fieldErrors: TrainingSettingsFieldErrors
}

export const INITIAL_TRAINING_SETTINGS_STATE: TrainingSettingsActionState = {
  ok: false,
  message: null,
  formError: null,
  fieldErrors: {},
}

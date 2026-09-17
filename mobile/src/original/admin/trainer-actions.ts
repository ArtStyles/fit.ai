import type { AdminTrainerActionResult } from '@/app/actions/adminTrainers'
import { navigate, refresh, RouteRedirect } from '../router'
import { adminAction } from './action-request'

export type { AdminTrainerActionResult } from '@/app/actions/adminTrainers'

async function decision(operation: string, form: FormData): Promise<AdminTrainerActionResult> {
  try {
    const result = await adminAction<AdminTrainerActionResult>(operation, form)
    if (result.ok) refresh()
    return result
  } catch (error) {
    if (error instanceof RouteRedirect) {
      navigate(error.href)
      return { ok: false, error: 'Vuelve a abrir el expediente con una cuenta autorizada.' }
    }
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo completar la acción administrativa.' }
  }
}

export const startTrainerReview = (form: FormData) => decision('startTrainerReview', form)
export const requestTrainerChanges = (form: FormData) => decision('requestTrainerChanges', form)
export const approveTrainerApplication = (form: FormData) => decision('approveTrainerApplication', form)
export const rejectTrainerApplication = (form: FormData) => decision('rejectTrainerApplication', form)
export const reinstateTrainerProfile = (form: FormData) => decision('reinstateTrainerProfile', form)
export const scheduleTrainerInterview = (form: FormData) => decision('scheduleTrainerInterview', form)
export const recordTrainerInterviewOutcome = (form: FormData) => decision('recordTrainerInterviewOutcome', form)

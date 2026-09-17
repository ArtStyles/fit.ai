import { mobileApi } from '../mobile-api'
import { coachingForm } from './trainerApplications'
import type * as Server from '@/app/actions/trainerProfile'

export const updateTrainerProfile: typeof Server.updateTrainerProfile = data => mobileApi('/api/mobile/coaching', coachingForm('updateProfile', data))

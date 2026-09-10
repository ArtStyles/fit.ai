'use server'

export type RescheduleWorkoutInput = { accountId: string; planId: string; workoutId: string; sourceDate: string; targetDate: string | null }
export type RescheduleWorkoutResult = { success: true; scheduledDate: string; reverted: boolean } | { success: false; error: string }

export async function rescheduleWorkout(_input: RescheduleWorkoutInput): Promise<RescheduleWorkoutResult> {
  return { success: false, error: 'La reprogramación está disponible en la aplicación Android local.' }
}

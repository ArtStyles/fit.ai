export type PersonalGoalsSlotProps = {
  language: 'es' | 'en'
  selectedExerciseId: string | null
  onSelectionHandled: () => void
}

// Android supplies the account-bound implementation through its existing alias boundary.
export const PERSONAL_GOALS_ENABLED = false
export function PersonalGoalsSlot(props: PersonalGoalsSlotProps) { void props; return null }

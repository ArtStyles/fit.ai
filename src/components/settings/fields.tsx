import { FITNESS_LEVELS, GYM_TYPES, TRAINING_GOALS, WEEK_DAYS } from '@/lib/profile/trainingPreferences'

// Legacy exports retain the select-field tuple contract while their values
// come from the canonical training-preference catalog.
export const GOALS = TRAINING_GOALS.map(({ value, label }) => [value, label])
export const LEVELS = FITNESS_LEVELS.map(({ value, label }) => [value, label])
export const GYMS = GYM_TYPES.map(({ value, label }) => [value, label])

export const GENDERS = [
  ['male', 'Masculino'],
  ['female', 'Femenino'],
  ['other', 'Otro'],
  ['prefer_not_to_say', 'Prefiero no decir'],
]

export const DAY_OPTIONS = WEEK_DAYS.map(({ value, shortLabel }) => ({ value, label: shortLabel }))

export function SelectField({
  label,
  name,
  value,
  options,
  emptyLabel = 'Sin definir',
}: {
  label: string
  name: string
  value: string | null
  options: string[][]
  emptyLabel?: string
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ''}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
      >
        <option value="">{emptyLabel}</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  )
}

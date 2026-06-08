// Shared field constants + presentational SelectField used across the
// settings sub-pages (Datos personales, Entrenamiento).

export const GOALS = [
  ['build_muscle', 'Ganar músculo'],
  ['gain_strength', 'Ganar fuerza'],
  ['lose_weight', 'Perder peso'],
  ['improve_endurance', 'Mejorar resistencia'],
  ['stay_active', 'Mantenerse activo'],
  ['other', 'Otro'],
]

export const LEVELS = [
  ['beginner', 'Principiante'],
  ['intermediate', 'Intermedio'],
  ['advanced', 'Avanzado'],
]

export const GYMS = [
  ['home_no_equipment', 'Casa sin equipo'],
  ['home_basic', 'Casa con equipo básico'],
  ['full_gym', 'Gimnasio completo'],
]

export const GENDERS = [
  ['male', 'Masculino'],
  ['female', 'Femenino'],
  ['other', 'Otro'],
  ['prefer_not_to_say', 'Prefiero no decir'],
]

export const DAY_OPTIONS = [
  { value: 1, label: 'L' },
  { value: 2, label: 'M' },
  { value: 3, label: 'X' },
  { value: 4, label: 'J' },
  { value: 5, label: 'V' },
  { value: 6, label: 'S' },
  { value: 7, label: 'D' },
]

export function SelectField({
  label,
  name,
  value,
  options,
}: {
  label: string
  name: string
  value: string | null
  options: string[][]
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ''}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
      >
        <option value="">Sin definir</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  )
}

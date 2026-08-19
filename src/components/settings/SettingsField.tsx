import { Children, cloneElement, type ReactElement } from 'react'

type FieldControlProps = {
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}

export function SettingsField({
  id,
  label,
  help,
  error,
  unit,
  children,
}: {
  id: string
  label: string
  help?: string
  error?: string
  unit?: string
  children: ReactElement<FieldControlProps>
}) {
  const control = Children.only(children)
  const describedBy = [
    control.props['aria-describedby'],
    help ? `${id}-help` : undefined,
    error ? `${id}-error` : undefined,
  ].filter(Boolean).join(' ')

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}{unit ? <span className="ml-1 text-muted-foreground">({unit})</span> : null}
      </label>
      {cloneElement(control, {
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(error ? { 'aria-invalid': true } : {}),
      })}
      {help ? <p id={`${id}-help`} className="text-xs text-muted-foreground">{help}</p> : null}
      {error ? <p id={`${id}-error`} role="alert" className="text-xs text-red-300">{error}</p> : null}
    </div>
  )
}

import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function SubmitButton({
  label,
  children,
  pendingLabel: _pendingLabel,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  pendingLabel?: string
  children?: ReactNode
}) {
  return <button type="submit" {...props}>{children}{label}</button>
}

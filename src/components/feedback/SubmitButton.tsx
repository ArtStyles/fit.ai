'use client'

import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type SubmitButtonProps = ButtonProps & {
  label: string
  pendingLabel?: string
}

export function SubmitButton({
  label,
  pendingLabel = 'Guardando',
  className,
  children,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      className={cn('gap-2 disabled:opacity-70', className)}
      {...props}
      disabled={pending || props.disabled}
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending ? pendingLabel : children ?? label}
    </Button>
  )
}

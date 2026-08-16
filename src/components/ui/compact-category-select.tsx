'use client'

import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const ALL_VALUE = '__all__'

export type CompactCategoryOption = {
  value: string
  label: string
}

export function CompactCategorySelect({
  ariaLabel,
  name,
  value,
  defaultValue = '',
  onValueChange,
  options,
  allLabel,
  className,
}: {
  ariaLabel: string
  name?: string
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  options: CompactCategoryOption[]
  allLabel: string
  className?: string
}) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue)
  const currentValue = value ?? uncontrolledValue

  function handleValueChange(nextValue: string) {
    const normalized = nextValue === ALL_VALUE ? '' : nextValue
    if (value === undefined) setUncontrolledValue(normalized)
    onValueChange?.(normalized)
  }

  const currentLabel = currentValue
    ? options.find(option => option.value === currentValue)?.label ?? currentValue
    : allLabel

  return (
    <>
      {name ? <input type="hidden" name={name} value={currentValue} /> : null}
      <Select value={currentValue || ALL_VALUE} onValueChange={handleValueChange}>
        <SelectTrigger
          aria-label={ariaLabel}
          className={cn(
            'h-12 min-w-0 overflow-hidden rounded-xl border-border/70 bg-background px-3 font-normal text-foreground [&>span]:min-w-0 [&>span]:truncate [&>svg]:shrink-0',
            className,
          )}
        >
          <SelectValue>{currentLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent className="z-[80] max-h-64 w-[var(--radix-select-trigger-width)] min-w-0 max-w-[calc(100vw-2rem)] rounded-xl">
          <SelectItem value={ALL_VALUE} className="min-h-12 min-w-0 overflow-hidden [&>span:last-child]:truncate">{allLabel}</SelectItem>
          {options.map(option => (
            <SelectItem key={option.value} value={option.value} className="min-h-12 min-w-0 overflow-hidden [&>span:last-child]:truncate">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}

'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function TrainingGoalSelect({ id, value, onChange, language, disabled = false }: {
  id: string
  value: string
  onChange: (value: string) => void
  language: 'es' | 'en'
  disabled?: boolean
}) {
  const label = language === 'es' ? 'Meta de entrenamientos por semana' : 'Workout goal per week'
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        aria-label={label}
        className="h-12 min-w-0 gap-3 rounded-xl border-border/60 bg-background text-left text-base focus:ring-violet-400 [&>span]:min-w-0 [&>svg]:shrink-0"
      >
        <SelectValue placeholder={language === 'es' ? 'Elegir meta (opcional)' : 'Choose a goal (optional)'} />
      </SelectTrigger>
      <SelectContent
        collisionPadding={16}
        className="z-[80] max-h-[min(20rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] min-w-0 max-w-[calc(100vw-2rem)] rounded-xl border-violet-500/30 bg-popover text-popover-foreground shadow-xl shadow-black/30 motion-reduce:animate-none"
      >
        {Array.from({ length: 7 }, (_, index) => {
          const count = index + 1
          return (
            <SelectItem
              key={count}
              value={String(count)}
              className="min-h-12 rounded-lg py-3 text-base data-[state=checked]:bg-violet-500/15 focus:bg-violet-500/25 focus:text-foreground"
            >
              {count} {language === 'es' ? count === 1 ? 'entrenamiento' : 'entrenamientos' : count === 1 ? 'workout' : 'workouts'}
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}

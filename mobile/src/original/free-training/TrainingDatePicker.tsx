'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { isCivilDate } from '@/lib/workouts/occurrences'
import { cn } from '@/lib/utils'
import { datePickerCells, moveDateFocus, shiftDateMonth } from './date-picker'

export type TrainingDatePickerProps = {
  id: string
  value: string
  max: string
  language: 'es' | 'en'
  disabled?: boolean
  onChange: (date: string) => void
}

const weekdays = {
  es: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
}
const initials = { es: ['L', 'M', 'X', 'J', 'V', 'S', 'D'], en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] }

export function TrainingDatePicker({ id, value, max, language, disabled = false, onChange }: TrainingDatePickerProps) {
  const t = (es: string, en: string) => language === 'es' ? es : en
  const selected = isCivilDate(value) && value <= max ? value : max
  const [open, setOpen] = useState(false)
  const [focusedDate, setFocusedDate] = useState(selected)
  const dayButtons = useRef(new Map<string, HTMLButtonElement>())
  const keyboardFocus = useRef(false)
  const monthId = useId()
  const locale = language === 'es' ? 'es-ES' : 'en-US'
  const fullDate = (date: string) => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
  const month = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${focusedDate}T12:00:00Z`))
  const cells = datePickerCells(focusedDate, max)
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7))

  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  useEffect(() => {
    if (open && !disabled && keyboardFocus.current) {
      dayButtons.current.get(focusedDate)?.focus()
      keyboardFocus.current = false
    }
  }, [focusedDate, open, disabled])

  function changeOpen(next: boolean) {
    if (disabled && next) return
    if (next) setFocusedDate(selected)
    setOpen(next)
  }
  function choose(date: string) {
    if (disabled || date > max) return
    onChange(date)
    setOpen(false)
  }

  return <Dialog open={open && !disabled} onOpenChange={changeOpen}>
    <DialogTrigger asChild>
      <button id={id} type="button" disabled={disabled} aria-label={t('Fecha', 'Date')} aria-describedby={`${id}-value`} data-date={value} className="flex h-12 w-full min-w-0 items-center gap-3 rounded-xl border border-border/60 bg-background px-3 text-left text-base font-medium text-foreground transition-colors hover:border-violet-400/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:pointer-events-none disabled:opacity-50">
        <CalendarDays className="h-5 w-5 shrink-0 text-violet-300" aria-hidden="true" />
        <span id={`${id}-value`} className="min-w-0 flex-1 truncate">{isCivilDate(value) ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : t('Elegir fecha', 'Choose date')}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </DialogTrigger>
    <DialogContent closeLabel={t('Cerrar', 'Close')} className="max-w-sm gap-0 rounded-3xl border-border/60 bg-card p-3 shadow-2xl sm:p-5" onOpenAutoFocus={event => { event.preventDefault(); dayButtons.current.get(selected)?.focus({ preventScroll: true }) }}>
      <DialogHeader className="px-1 pb-3 pt-1 text-left">
        <DialogTitle className="font-display text-xl font-bold">{t('Elegir fecha', 'Choose date')}</DialogTitle>
        <DialogDescription>{t('El día en que realizaste tu entrenamiento.', 'The day you completed your workout.')}</DialogDescription>
      </DialogHeader>
      <div className="mb-4 flex items-center justify-between gap-2">
        <button type="button" disabled={disabled} aria-label={t('Mes anterior', 'Previous month')} onClick={() => setFocusedDate(shiftDateMonth(focusedDate, -1))} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-30"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
        <p id={monthId} aria-live="polite" className="text-center font-display text-lg font-bold text-foreground first-letter:uppercase">{month}</p>
        <button type="button" disabled={disabled || focusedDate.slice(0, 7) >= max.slice(0, 7)} aria-label={t('Mes siguiente', 'Next month')} onClick={() => { const next = shiftDateMonth(focusedDate, 1); setFocusedDate(next > max ? max : next) }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-30"><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
      </div>
      <div role="grid" aria-labelledby={monthId} className="space-y-1">
        <div role="row" className="grid grid-cols-7 gap-1">
          {weekdays[language].map((day, index) => <span key={day} role="columnheader" aria-label={day} className="pb-2 text-center text-[11px] font-semibold uppercase text-muted-foreground">{initials[language][index]}</span>)}
        </div>
        {weeks.map((week, index) => <div key={index} role="row" className="grid grid-cols-7 gap-1">
          {week.map((cell, cellIndex) => <div key={cell.date ?? `empty-${cellIndex}`} role="gridcell" aria-selected={cell.date === value}>
            {cell.date && <button type="button" ref={node => { if (node) dayButtons.current.set(cell.date!, node); else dayButtons.current.delete(cell.date!) }} data-date={cell.date} aria-label={fullDate(cell.date)} aria-current={cell.isToday ? 'date' : undefined} disabled={disabled || cell.isFuture} tabIndex={cell.date === focusedDate ? 0 : -1} onFocus={() => setFocusedDate(cell.date!)} onClick={() => choose(cell.date!)} onKeyDown={event => {
              const next = moveDateFocus(cell.date!, event.key, max, event.shiftKey)
              if (next === null) return
              event.preventDefault()
              if (next !== focusedDate) { keyboardFocus.current = true; setFocusedDate(next) }
            }} className={cn('flex min-h-11 w-full items-center justify-center rounded-xl text-sm font-semibold tabular-nums transition-colors hover:bg-violet-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:pointer-events-none disabled:opacity-25', cell.isToday && 'border border-violet-400/50 text-violet-200', cell.date === value ? 'bg-violet-500 text-white shadow-sm shadow-violet-950/30 hover:bg-violet-500' : 'text-foreground')}>
              {cell.dayNum}
            </button>}
          </div>)}
        </div>)}
      </div>
      <button type="button" disabled={disabled} onClick={() => choose(max)} className="mt-5 flex min-h-11 w-full items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/10 text-sm font-semibold text-violet-200 hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-30">{t('Hoy', 'Today')}</button>
    </DialogContent>
  </Dialog>
}

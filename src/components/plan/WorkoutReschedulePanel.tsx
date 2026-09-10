'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { rescheduleWorkout } from '@/app/actions/rescheduleWorkout'
import type { SchedulePresentation } from '@/lib/workouts/occurrences'
import { useI18n } from '@/components/i18n/I18nProvider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const control = 'h-auto min-h-11 min-w-0 w-full gap-3 rounded-xl border border-input bg-background px-3 py-2 text-left text-sm text-foreground focus:ring-violet-500 [&>span]:min-w-0 [&>span]:line-clamp-none [&>span]:whitespace-normal [&>span]:break-words [&>svg]:shrink-0'
const menu = 'z-[80] max-h-[min(20rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] min-w-0 max-w-[calc(100vw-2rem)] rounded-xl border-violet-500/30 bg-popover text-popover-foreground shadow-xl shadow-black/30'
const option = 'min-h-11 min-w-0 rounded-lg py-3 text-left data-[state=checked]:bg-violet-500/15 focus:bg-violet-500/25 focus:text-foreground data-[disabled]:text-muted-foreground data-[disabled]:opacity-100 [&>span:last-child]:min-w-0 [&>span:last-child]:whitespace-normal [&>span:last-child]:break-words'
export function WorkoutReschedulePanel({ accountId, planId, schedule }: { accountId: string; planId: string; schedule: SchedulePresentation }) {
  const { t } = useI18n()
  const fieldId = useId()
  const router = useRouter()
  const [selectedKey, setSelectedKey] = useState('')
  const [target, setTarget] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const selected = schedule.occurrences.find(row => `${row.workoutId}:${row.sourceDate}` === selectedKey) ?? schedule.occurrences[0]
  if (!selected) return null
  const effectiveTarget = target || selected.targets.find(row => row.date === selected.scheduledDate)?.date
    || selected.targets.find(row => !row.reason)?.date || selected.targets[0]?.date
  const unavailable = selected.targets.find(row => row.date === effectiveTarget)?.reason
  const moved = selected.sourceDate !== selected.scheduledDate
  async function save(revert: boolean) {
    if (pending || !selected) return
    setPending(true); setError(''); setMessage('')
    try {
      const result = await rescheduleWorkout({ accountId, planId, workoutId: selected.workoutId, sourceDate: selected.sourceDate, targetDate: revert ? null : effectiveTarget })
      if (!result.success) setError(result.error)
      else { setMessage(`${t(result.reverted ? 'Fecha original restaurada' : 'Sesión reprogramada')}: ${result.scheduledDate}`); setTarget(''); router.refresh() }
    } catch { setError(t('No se pudo guardar el cambio de fecha. Reintenta.')) }
    finally { setPending(false) }
  }
  return (
    <section className="space-y-4 rounded-2xl border border-border/60 bg-[hsl(var(--surface-1))] p-5" aria-label={t('Reprogramar una sesión')}>
      <div><h2 className="font-semibold text-foreground">{t('Mover una sesión')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('Cambia solo esta fecha. El horario semanal y los ejercicios se conservan.')}</p></div>
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); void save(false) }}>
        <div className="space-y-1 text-sm"><label id={`${fieldId}-source-label`} htmlFor={`${fieldId}-source`}>{t('Sesión y fecha original')}</label>
          <Select disabled={pending} value={`${selected.workoutId}:${selected.sourceDate}`} onValueChange={value => { setSelectedKey(value); setTarget(''); setError(''); setMessage('') }}>
            <SelectTrigger id={`${fieldId}-source`} aria-labelledby={`${fieldId}-source-label`} className={control}><SelectValue /></SelectTrigger>
            <SelectContent className={menu} collisionPadding={16}>
              {schedule.occurrences.map(row => (
                <SelectItem key={`${row.workoutId}:${row.sourceDate}`} value={`${row.workoutId}:${row.sourceDate}`} className={option} textValue={`${row.workoutName} · ${row.sourceDate}`}>
                  <span className="block font-medium">{row.workoutName}</span>
                  <span className="block text-xs text-muted-foreground">{row.sourceDate}{row.sourceDate !== row.scheduledDate ? ` → ${row.scheduledDate}` : ''}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">{t('Fecha programada')}: <strong className="text-foreground">{selected.scheduledDate}</strong>{moved ? ` · ${t('Reprogramada')}` : ''}</p>
        <div className="space-y-1 text-sm"><label id={`${fieldId}-target-label`} htmlFor={`${fieldId}-target`}>{t('Nueva fecha')}</label>
          <Select disabled={pending} value={effectiveTarget ?? ''} onValueChange={value => { setTarget(value); setError(''); setMessage('') }}>
            <SelectTrigger id={`${fieldId}-target`} aria-labelledby={`${fieldId}-target-label`} className={control}><SelectValue /></SelectTrigger>
            <SelectContent className={menu} collisionPadding={16}>
              {selected.targets.map(row => (
                <SelectItem key={row.date} value={row.date} disabled={Boolean(row.reason)} className={option} textValue={row.date}>
                  <span className="block">{row.date}</span>
                  {row.reason && <span className="block text-xs text-muted-foreground">{t(row.reason)}</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {unavailable && <p className="text-sm text-muted-foreground">{t(unavailable)}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="min-h-11 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={pending || Boolean(unavailable) || effectiveTarget === selected.scheduledDate} type="submit">{t(pending ? 'Guardando…' : 'Guardar fecha')}</button>
          {moved && <button className="min-h-11 rounded-xl border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={pending || Boolean(selected.revertReason)} type="button" onClick={() => void save(true)}>{t('Restaurar fecha original')}</button>}
        </div>
        {moved && selected.revertReason && <p className="text-sm text-muted-foreground">{t(selected.revertReason)}</p>}
        <p role="status" className="text-sm text-foreground">{message}</p>
        {error && <p role="alert" className="text-sm text-red-400">{t(error)}</p>}
      </form>
    </section>
  )
}

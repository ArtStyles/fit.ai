'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { rescheduleWorkout } from '@/app/actions/rescheduleWorkout'
import type { SchedulePresentation } from '@/lib/workouts/occurrences'
import { useI18n } from '@/components/i18n/I18nProvider'

const control = 'min-h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50'
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
        <div className="space-y-1 text-sm"><label htmlFor={`${fieldId}-source`}>{t('Sesión y fecha original')}</label>
          <select id={`${fieldId}-source`} className={control} disabled={pending} value={`${selected.workoutId}:${selected.sourceDate}`} onChange={event => { setSelectedKey(event.target.value); setTarget(''); setError(''); setMessage('') }}>
            {schedule.occurrences.map(row => <option key={`${row.workoutId}:${row.sourceDate}`} value={`${row.workoutId}:${row.sourceDate}`}>{row.workoutName} · {row.sourceDate}{row.sourceDate !== row.scheduledDate ? ` → ${row.scheduledDate}` : ''}</option>)}
          </select>
        </div>
        <p className="text-sm text-muted-foreground">{t('Fecha programada')}: <strong className="text-foreground">{selected.scheduledDate}</strong>{moved ? ` · ${t('Reprogramada')}` : ''}</p>
        <div className="space-y-1 text-sm"><label htmlFor={`${fieldId}-target`}>{t('Nueva fecha')}</label>
          <select id={`${fieldId}-target`} className={control} disabled={pending} value={effectiveTarget} onChange={event => { setTarget(event.target.value); setError(''); setMessage('') }}>
            {selected.targets.map(row => <option key={row.date} value={row.date} disabled={Boolean(row.reason)}>{row.date}{row.reason ? ` · ${t(row.reason)}` : ''}</option>)}
          </select>
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

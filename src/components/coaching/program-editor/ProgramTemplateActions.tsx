'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ProgramTemplateView, RoutineSummary } from './types'

export function ProgramTemplateActions({
  template,
  summary,
}: {
  template: ProgramTemplateView
  summary: RoutineSummary
}) {
  const router = useRouter()
  const [archiving, setArchiving] = useState(false)
  const [message, setMessage] = useState('')

  async function archive() {
    if (archiving || !window.confirm('¿Archivar esta plantilla? Las asignaciones ya publicadas no cambiarán.')) return
    setArchiving(true)
    const formData = new FormData()
    formData.set('templateId', template.id)
    try {
      const result = await (await import('@/app/actions/trainerPrograms')).archiveTrainerProgram(formData)
      setMessage(result.ok ? 'Plantilla archivada.' : result.error ?? 'No se pudo archivar la plantilla.')
      if (result.ok) router.refresh()
    } catch {
      setMessage('No se pudo archivar la plantilla.')
    } finally {
      setArchiving(false)
    }
  }

  return (
    <aside className="rounded-2xl border border-border/70 bg-muted/10 p-4" aria-labelledby="routine-summary-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="routine-summary-title" className="font-bold text-foreground">Resumen semanal</h2>
        <span className="rounded-full border border-border px-2 py-1 text-xs font-semibold capitalize text-muted-foreground">{template.status === 'draft' ? 'Borrador' : template.status}</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-background/60 p-3"><dt className="text-xs text-muted-foreground">Días</dt><dd className="text-lg font-bold">{summary.days}</dd></div>
        <div className="rounded-xl bg-background/60 p-3"><dt className="text-xs text-muted-foreground">Ejercicios</dt><dd className="text-lg font-bold">{summary.exercises}</dd></div>
        <div className="rounded-xl bg-background/60 p-3"><dt className="text-xs text-muted-foreground">Series</dt><dd className="text-lg font-bold">{summary.sets}</dd></div>
        <div className="rounded-xl bg-background/60 p-3"><dt className="text-xs text-muted-foreground">Duración</dt><dd className="text-lg font-bold">{summary.estimatedMinutes} min</dd><span className="text-[11px] text-muted-foreground">estimado</span></div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">Asignar y publicar una revisión siguen siendo acciones separadas de esta plantilla editable.</p>
      <button type="button" disabled={archiving || template.status === 'archived'} onClick={() => void archive()} className="mt-4 min-h-11 w-full rounded-xl border border-destructive/40 px-4 text-sm font-semibold text-destructive disabled:opacity-50">
        {archiving ? 'Archivando…' : 'Archivar plantilla'}
      </button>
      {message ? <p aria-live="polite" className="mt-2 text-sm text-muted-foreground">{message}</p> : null}
    </aside>
  )
}

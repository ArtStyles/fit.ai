'use client'

import type { FormEvent } from 'react'
import { SaveStateIndicator } from './SaveStateIndicator'
import type { ProgramTemplateView, SaveState } from './types'

type Result = { ok: boolean; error?: string }

export function ProgramTemplateSummary({
  template,
  saveState,
  onDirty,
  onSave,
}: {
  template: ProgramTemplateView
  saveState: SaveState
  onDirty: () => void
  onSave: (formData: FormData) => Promise<Result>
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    await onSave(formData)
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-muted/10 p-4" aria-labelledby="template-summary-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Rutina profesional</p>
          <h1 id="template-summary-title" className="truncate text-xl font-bold text-foreground">{template.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {template.goal || 'Sin objetivo definido'} · {template.days_per_week} {template.days_per_week === 1 ? 'día' : 'días'} por semana
          </p>
        </div>
        <SaveStateIndicator state={saveState} />
      </div>

      <details className="mt-4 rounded-xl border border-border/60 bg-background/40 p-3" open>
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-foreground">Editar información</summary>
        <form onSubmit={event => void submit(event)} onChangeCapture={onDirty} noValidate className="mt-2 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="templateId" value={template.id} />
          <label className="text-sm font-semibold text-foreground">
            Nombre
            <input aria-label="Nombre de la rutina" name="name" required maxLength={120} defaultValue={template.name} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
          </label>
          <label className="text-sm font-semibold text-foreground">
            Días por semana
            <input aria-label="Días por semana" name="daysPerWeek" required type="number" min="1" max="7" defaultValue={template.days_per_week} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
          </label>
          <label className="text-sm font-semibold text-foreground sm:col-span-2">
            Objetivo
            <input aria-label="Objetivo de la rutina" name="goal" maxLength={240} defaultValue={template.goal ?? ''} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
          </label>
          <label className="text-sm font-semibold text-foreground sm:col-span-2">
            Descripción
            <textarea aria-label="Descripción de la rutina" name="description" maxLength={2000} defaultValue={template.description ?? ''} rows={3} className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 font-normal" />
          </label>
          <button type="submit" disabled={saveState === 'saving'} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:w-fit">
            {saveState === 'saving' ? 'Guardando…' : 'Guardar plantilla'}
          </button>
        </form>
      </details>
    </section>
  )
}

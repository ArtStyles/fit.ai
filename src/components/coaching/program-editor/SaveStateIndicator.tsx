import type { SaveState } from './types'

const SAVE_COPY: Record<SaveState, string> = {
  saved: 'Todo guardado',
  dirty: 'Cambios pendientes',
  saving: 'Guardando…',
  error: 'No se pudo guardar',
}

const SAVE_TONE: Record<SaveState, string> = {
  saved: 'text-emerald-600 dark:text-emerald-300',
  dirty: 'text-amber-700 dark:text-amber-300',
  saving: 'text-primary',
  error: 'text-destructive',
}

export function SaveStateIndicator({ state }: { state: SaveState }) {
  return (
    <span aria-live="polite" className={`text-xs font-semibold ${SAVE_TONE[state]}`}>
      {SAVE_COPY[state]}
    </span>
  )
}

'use client'

import { useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { deleteAccount } from '@/app/actions/account'
import { SubmitButton } from '@/components/feedback/SubmitButton'

const CONFIRM_WORD = 'ELIMINAR'

export function DeleteAccountSection() {
  const [confirming, setConfirming] = useState(false)
  const [text, setText] = useState('')
  const canDelete = text.trim() === CONFIRM_WORD

  return (
    <section className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Eliminar cuenta</p>
          <p className="text-xs text-muted-foreground">Borra tu cuenta y todos tus datos de forma permanente</p>
        </div>
      </div>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-4 h-11 w-full rounded-lg border border-red-500/40 bg-transparent text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/10"
        >
          Eliminar mi cuenta
        </button>
      ) : (
        <form action={deleteAccount} className="mt-4 space-y-3">
          <div className="rounded-xl border border-red-500/20 bg-background/60 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
            Esta acción es <span className="font-semibold text-red-300">irreversible</span>. Se eliminarán tu perfil,
            rutinas, historial de entrenamientos, medidas y conversaciones con la IA. No se puede deshacer.
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Escribe <span className="font-semibold text-foreground">{CONFIRM_WORD}</span> para confirmar
            </span>
            <input
              name="confirmText"
              value={text}
              onChange={e => setText(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              placeholder={CONFIRM_WORD}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm tracking-wide text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-2 focus:ring-red-500"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setConfirming(false); setText('') }}
              className="h-11 flex-1 rounded-lg border border-border/60 bg-transparent text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
            >
              Cancelar
            </button>
            <SubmitButton
              label="Eliminar definitivamente"
              pendingLabel="Eliminando"
              disabled={!canDelete}
              className="h-11 flex-1 bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Eliminar definitivamente
            </SubmitButton>
          </div>
        </form>
      )}
    </section>
  )
}

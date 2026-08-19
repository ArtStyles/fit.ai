'use client'

import { useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { deleteAccount } from '@/app/actions/account'
import { SubmitButton } from '@/components/feedback/SubmitButton'
import { useI18n } from '@/components/i18n/I18nProvider'

export function DeleteAccountConfirmationForm({
  confirmWord,
  text,
  canDelete,
  onTextChange,
  onCancel,
}: {
  confirmWord: string
  text: string
  canDelete: boolean
  onTextChange: (value: string) => void
  onCancel: () => void
}) {
  const { t } = useI18n()

  return (
    <form action={deleteAccount} className="mt-4 space-y-3">
      <div className="rounded-xl border border-red-500/20 bg-background/60 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
        {t('Esta acción es irreversible. Se eliminarán tu perfil, rutinas, historial de entrenamientos, medidas y conversaciones con la IA. No se puede deshacer.')}
      </div>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {t('Escribe {word} para confirmar', { word: confirmWord })}
        </span>
        <input
          name="confirmText"
          value={text}
          onChange={event => onTextChange(event.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          placeholder={confirmWord}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm tracking-wide text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-2 focus:ring-red-500"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-11 flex-1 rounded-lg border border-border/60 bg-transparent text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
        >
          {t('Cancelar')}
        </button>
        <SubmitButton
          label={t('Eliminar definitivamente')}
          pendingLabel={t('Eliminando')}
          disabled={!canDelete}
          className="h-11 flex-1 bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t('Eliminar definitivamente')}
        </SubmitButton>
      </div>
    </form>
  )
}

export function DeleteAccountSection() {
  const { language, t } = useI18n()
  const confirmWord = language === 'en' ? 'DELETE' : 'ELIMINAR'
  const [confirming, setConfirming] = useState(false)
  const [text, setText] = useState('')
  const canDelete = text.trim() === confirmWord

  return (
    <section className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{t('Eliminar cuenta')}</p>
          <p className="text-xs text-muted-foreground">{t('Borra tu cuenta y todos tus datos de forma permanente')}</p>
        </div>
      </div>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-4 h-11 w-full rounded-lg border border-red-500/40 bg-transparent text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/10"
        >
          {t('Eliminar mi cuenta')}
        </button>
      ) : (
        <DeleteAccountConfirmationForm
          confirmWord={confirmWord}
          text={text}
          canDelete={canDelete}
          onTextChange={setText}
          onCancel={() => { setConfirming(false); setText('') }}
        />
      )}
    </section>
  )
}

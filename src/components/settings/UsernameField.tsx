'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Check } from 'lucide-react'
import { checkUsernameAvailable, updateUsername } from '@/app/actions/username'
import { validateUsername } from '@/lib/social/username'
import { useToast } from '@/components/feedback/ToastProvider'
import { useI18n } from '@/components/i18n/I18nProvider'

export function UsernameField({ initialUsername }: { initialUsername: string }) {
  const [value, setValue] = useState(initialUsername)
  const [error, setError] = useState<string | null>(null)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const reqId = useRef(0)
  const { showToast } = useToast()
  const { t } = useI18n()

  useEffect(() => {
    if (value === initialUsername) { setAvailable(null); setError(null); setChecking(false); return }
    setAvailable(null)
    const v = validateUsername(value)
    if (!v.ok) { setError(v.error); setChecking(false); return }
    setError(null)
    setChecking(true)
    const id = ++reqId.current
    const timeoutId = setTimeout(async () => {
      const res = await checkUsernameAvailable(v.value)
      if (id !== reqId.current) return
      setAvailable(res.available)
      if (!res.available) setError(res.error ?? t('Ese nombre de usuario ya está en uso.'))
      setChecking(false)
    }, 350)
    return () => clearTimeout(timeoutId)
  }, [value, initialUsername, t])

  const changed = value !== initialUsername
  const canSave = changed && available === true && !checking && !saving

  async function save() {
    setSaving(true)
    const res = await updateUsername(value)
    setSaving(false)
    if (res.ok) { showToast({ title: t('Nombre de usuario actualizado.'), variant: 'success' }); setAvailable(null) }
    else { setError(res.error); showToast({ title: res.error, variant: 'error' }) }
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-muted/10 p-5">
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t('Nombre de usuario')}</span>
        <div className="flex items-center rounded-md border border-input bg-background px-3">
          <span className="text-muted-foreground">@</span>
          <input
            value={value}
            onChange={e => setValue(e.target.value)}
            autoCapitalize="none"
            maxLength={20}
            className="h-10 flex-1 bg-transparent px-2 text-sm text-foreground outline-none"
          />
          {checking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {!checking && changed && available === true && <Check className="h-4 w-4 text-green-500" />}
        </div>
      </label>
      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
      <button
        type="button"
        onClick={save}
        disabled={!canSave}
        className="mt-3 h-10 rounded-md bg-violet-500 px-4 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50"
      >
        {saving ? t('Guardando') : t('Guardar usuario')}
      </button>
    </section>
  )
}

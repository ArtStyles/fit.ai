import { useEffect, useRef, useState } from 'react'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { resizeImageToSquare, validateAvatarFile } from '@/lib/images/avatar'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { TrainerPhotoFieldProps } from '@/components/coaching/TrainerProfilePhotoField'
import { updateAvatar } from './actions/avatar'
import { getAppStore } from './storage'

export function TrainerProfilePhotoField({ photoUrl, error, disabled = false, onChange, onBusyChange }: TrainerPhotoFieldProps) {
  const { language } = useI18n(), en = language === 'en'
  const [selected, setSelected] = useState({ source: photoUrl, url: photoUrl })
  const [pending, setPending] = useState(false), [message, setMessage] = useState('')
  const mounted = useRef(true), busy = useRef(false)
  if (selected.source !== photoUrl) setSelected({ source: photoUrl, url: photoUrl })
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  function choose(url: string | null) { setSelected({ source: photoUrl, url }); onChange?.(url) }
  async function upload(file?: File) {
    if (!file || disabled || busy.current) return
    busy.current = true; setPending(true); setMessage(''); onBusyChange?.(true)
    try {
      const valid = validateAvatarFile(file.type, file.size)
      if (!valid.ok) throw new Error(valid.error)
      const store = await getAppStore(), version = store.sessionVersion(), owner = (await store.read())?.accountId
      const assertCurrent = async () => {
        const current = await store.read()
        if (!owner || !mounted.current || store.sessionVersion() !== version || current?.accountId !== owner || current.remoteUserId !== owner) throw new Error(en ? 'Your account changed. Open the original account to continue.' : 'La cuenta activa cambió. Abre la cuenta original para continuar.')
      }
      await assertCurrent()
      const processed = await resizeImageToSquare(file)
      await assertCurrent()
      const data = new FormData(); data.set('file', new File([processed.blob], 'avatar.webp', { type: processed.contentType }))
      const result = await updateAvatar(data)
      await assertCurrent()
      if (!result.ok) throw new Error(result.error)
      choose(result.url)
      setMessage(en ? 'Photo ready. Save the form to apply it to your professional profile.' : 'Foto preparada. Guarda el formulario para aplicarla al perfil profesional.')
    } catch (reason) {
      if (mounted.current) setMessage(reason instanceof Error ? reason.message : en ? 'Could not upload the photo.' : 'No se pudo subir la foto.')
    } finally {
      busy.current = false
      if (mounted.current) { setPending(false); onBusyChange?.(false) }
    }
  }
  return <div id="professionalPhotoUrl" tabIndex={-1} role="group" aria-label={en ? 'Professional photo' : 'Foto profesional'} className="space-y-3 rounded-2xl border border-border/60 p-4 focus:outline-none focus:ring-2 focus:ring-violet-400">
    <input type="hidden" name="professionalPhotoUrl" value={selected.url ?? ''} />
    <p className="text-sm font-semibold">{en ? 'Professional photo' : 'Foto profesional'}</p>
    {selected.url && <img src={selected.url} alt={en ? 'Selected professional photo' : 'Foto profesional seleccionada'} className="h-24 w-24 rounded-xl object-cover" />}
    <p className="text-sm text-muted-foreground">{en ? 'Uploaded images are also used as your account photo. Save this form to confirm your professional photo.' : 'La imagen subida también se usa como foto de tu cuenta. Guarda este formulario para confirmar la foto profesional.'}</p>
    <div className="flex flex-wrap gap-3">
      <label className={`relative inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold ${disabled || pending ? 'opacity-50' : 'cursor-pointer'}`}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}{en ? 'Choose photo' : 'Elegir foto'}
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || pending} aria-label={en ? 'Upload professional photo' : 'Subir foto profesional'} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void upload(file) }} />
      </label>
      {selected.url && <button type="button" disabled={disabled || pending} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold disabled:opacity-50" onClick={() => { choose(null); setMessage(en ? 'Save the form to remove the professional photo.' : 'Guarda el formulario para quitar la foto profesional.') }}><Trash2 className="h-4 w-4" />{en ? 'Remove photo' : 'Quitar foto'}</button>}
    </div>
    {message && <p role="status" className="text-sm">{message}</p>}
    {error && <p id="professionalPhotoUrl-error" role="alert" className="text-sm text-red-300">{error}</p>}
  </div>
}

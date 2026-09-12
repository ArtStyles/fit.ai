'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ImagePlus, Pencil, Upload } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { FitnessCard, FitnessPhotoUrls, FitnessTheme } from '@/lib/fitness-card/types'
import { FitnessCardCover } from './FitnessCardCover'
import styles from './fitness-card.module.css'

type Props = { card: FitnessCard; busy: boolean; onSave: (artisticName: string, theme: FitnessTheme, expectedRevision: number) => Promise<void>; onUpload: (slot: 1 | 2 | 3, file: File) => Promise<FitnessCard>; onRemove: (slot: 1 | 2 | 3) => Promise<FitnessCard>; photoUrls: FitnessPhotoUrls }

export function FitnessCardEditor({ card, busy, onSave, onUpload, onRemove, photoUrls }: Props) {
  const { language } = useI18n()
  const es = language === 'es'
  const id = useId()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(card.artisticName)
  const [theme, setTheme] = useState<FitnessTheme>(card.theme)
  const [selection, setSelection] = useState<{ slot: 1 | 2 | 3; file: File } | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const inputs = useRef<Partial<Record<1 | 2 | 3, HTMLInputElement | null>>>({})
  const baseStyle = useRef({ artisticName: card.artisticName, theme: card.theme })
  const baseRevision = useRef(card.revision)
  const disabled = busy || working
  useEffect(() => { if (!selection) { setPreview(null); return } const url = URL.createObjectURL(selection.file); setPreview(url); return () => URL.revokeObjectURL(url) }, [selection])
  const changeOpen = (next: boolean) => { if (!next && disabled) return; if (next) { baseStyle.current = { artisticName: card.artisticName, theme: card.theme }; baseRevision.current = card.revision; setName(card.artisticName); setTheme(card.theme); setError('') } else setSelection(null); setOpen(next) }
  const rebaseAfterPhoto = (saved: FitnessCard) => { if (saved.owner.userId === card.owner.userId && saved.artisticName === baseStyle.current.artisticName && saved.theme === baseStyle.current.theme) baseRevision.current = saved.revision }
  const run = async (action: () => Promise<void>) => { setError(''); setWorking(true); try { await action() } catch { setError(es ? 'No se pudo guardar. Comprueba tu conexión e inténtalo de nuevo.' : 'Could not save. Check your connection and try again.') } finally { setWorking(false) } }
  return <Dialog open={open} onOpenChange={changeOpen}><DialogTrigger asChild><Button variant="outline" disabled={busy}><Pencil size={16} className="mr-2" />{es ? 'Editar tarjeta' : 'Edit card'}</Button></DialogTrigger>
    <DialogContent className="max-w-xl" closeLabel={es ? 'Cerrar' : 'Close'}><DialogHeader><DialogTitle>{es ? 'Hazla tuya.' : 'Make it yours.'}</DialogTitle><DialogDescription>{es ? 'Tu nombre artístico, tus colores y tres fotos elegidas por ti.' : 'Your artistic name, your colors and three photos chosen by you.'}</DialogDescription></DialogHeader>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); void run(async () => { await onSave(name.trim(), theme, baseRevision.current); setSelection(null); setOpen(false) }) }}>
      <FitnessCardCover card={{ ...card, artisticName: name, theme }} compact />
      <label className={styles.field} htmlFor={`${id}-name`}>{es ? 'Nombre artístico (opcional)' : 'Artistic name (optional)'}<Input id={`${id}-name`} maxLength={60} value={name} disabled={disabled} onChange={event => setName(event.target.value)} placeholder={card.owner.name} /></label>
      <div className={styles.field}><label htmlFor={`${id}-theme`}>{es ? 'Estilo' : 'Style'}</label><Select value={theme} onValueChange={value => setTheme(value as FitnessTheme)} disabled={disabled}><SelectTrigger id={`${id}-theme`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="violet">Violet · {es ? 'El original' : 'The original'}</SelectItem><SelectItem value="ember">Ember · {es ? 'Fuego interior' : 'Inner fire'}</SelectItem><SelectItem value="ice">Ice · {es ? 'Enfoque puro' : 'Pure focus'}</SelectItem></SelectContent></Select></div>
      <div><h3 className="mb-2 text-sm font-semibold">{es ? 'Tus tres fotos' : 'Your three photos'}</h3><p className={`${styles.note} mb-3`}>{es ? 'Las fotos se guardan al subirlas o eliminarlas. JPG, PNG o WebP, hasta 12 MB.' : 'Photos save when uploaded or removed. JPG, PNG or WebP, up to 12 MB.'}</p>
      <div className={styles.editorPhotos}>{([1,2,3] as const).map(slot => <div key={slot}><div className={styles.photo}>{(selection?.slot === slot && preview) || photoUrls[slot] ? <img src={(selection?.slot === slot && preview) || photoUrls[slot]} alt={`${es ? 'Foto' : 'Photo'} ${slot}`} /> : <span className={styles.photoEmpty}><ImagePlus size={22} />0{slot}</span>}</div>
        <input ref={node => { inputs.current[slot] = node }} type="file" className="sr-only" tabIndex={-1} aria-label={`${es ? 'Seleccionar foto' : 'Choose photo'} ${slot}`} accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) { setError(es ? 'Elige una imagen JPG, PNG o WebP de hasta 12 MB.' : 'Choose a JPG, PNG or WebP image up to 12 MB.'); return } setError(''); setSelection({slot,file}) }} />
        <div className={styles.photoActions}><Button type="button" variant="outline" disabled={disabled || !!selection} onClick={() => inputs.current[slot]?.click()}>{photoUrls[slot] ? (es ? 'Reemplazar' : 'Replace') : (es ? 'Elegir foto' : 'Choose photo')}</Button>{card.photos.some(photo => photo.slot === slot) && <Button type="button" variant="ghost" disabled={disabled || !!selection} onClick={() => void run(async () => { rebaseAfterPhoto(await onRemove(slot)) })}>{es ? 'Eliminar' : 'Remove'}</Button>}</div>
      </div>)}</div></div>
      {selection && <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3"><p className={`${styles.note} mb-2`}>{es ? `Vista previa de la foto ${selection.slot}. Confirma para guardarla.` : `Preview of photo ${selection.slot}. Confirm to save it.`}</p><div className={styles.actions}><Button type="button" disabled={disabled} onClick={() => void run(async () => { rebaseAfterPhoto(await onUpload(selection.slot, selection.file)); setSelection(null) })}><Upload size={15} className="mr-2" />{es ? 'Subir foto' : 'Upload photo'}</Button><Button type="button" variant="ghost" disabled={disabled} onClick={() => setSelection(null)}>{es ? 'Cancelar' : 'Cancel'}</Button></div></div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={disabled || !!selection}>{disabled ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Guardar estilo' : 'Save style')}</Button>
    </form></DialogContent>
  </Dialog>
}

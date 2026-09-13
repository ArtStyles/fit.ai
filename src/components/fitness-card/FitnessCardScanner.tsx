'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, ImageUp, ScanLine } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { parseFitnessCardLink } from '@/lib/fitness-card/sharing'

type Scanner = { start(): Promise<void>; stop(): void; destroy(): void }
type CameraSession = { scanner: Scanner; video: HTMLVideoElement }

function disposeCamera(session: CameraSession | null) {
  if (!session) return
  // Keep the captured element: the dialog may already have removed its ref.
  const stream = session.video.srcObject
  try { session.scanner.stop() } catch { /* Continue releasing the stream. */ }
  try { session.scanner.destroy() } catch { /* Continue releasing the stream. */ }
  if (stream && 'getTracks' in stream && typeof stream.getTracks === 'function') stream.getTracks().forEach(track => track.stop())
  session.video.srcObject = null
}

export function FitnessCardScanner({ onScan, disabled = false }: { onScan: (ownerId: string) => void; disabled?: boolean }) {
  const { language } = useI18n()
  const es = language === 'es'
  const [open, setOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [decoding, setDecoding] = useState(false)
  const [error, setError] = useState('')
  const video = useRef<HTMLVideoElement>(null)
  const camera = useRef<CameraSession | null>(null)
  const epoch = useRef(0)
  const mounted = useRef(true)
  const isOpen = useRef(false)
  const cameraStarting = useRef(false)

  const invalidate = useCallback(() => {
    epoch.current++
    const active = camera.current
    camera.current = null
    disposeCamera(active)
    if (mounted.current) setDecoding(false)
  }, [])
  const current = (token: number) => mounted.current && isOpen.current && token === epoch.current && !document.hidden
  const changeOpen = (next: boolean) => {
    isOpen.current = next
    invalidate()
    setError('')
    setOpen(next)
  }
  const accept = (value: string, token: number) => {
    if (!current(token)) return
    const ownerId = parseFitnessCardLink(value)
    if (!ownerId) { setError(es ? 'Este código no es una Fitness Card válida.' : 'This code is not a valid Fitness Card.'); return }
    // Invalidate before invoking the parent, so repeated camera frames and
    // outstanding image decoding cannot deliver a second result.
    isOpen.current = false
    invalidate()
    setOpen(false)
    onScan(ownerId)
  }
  const startCamera = async () => {
    if (!isOpen.current || cameraStarting.current || document.hidden) return
    invalidate()
    const token = epoch.current
    cameraStarting.current = true
    setStarting(true); setError('')
    let session: CameraSession | null = null
    try {
      const { default: QrScanner } = await import('qr-scanner')
      if (!current(token) || !video.current) return
      const element = video.current
      const next = new QrScanner(element, result => accept(typeof result === 'string' ? result : result.data, token), {
        preferredCamera: 'environment', returnDetailedScanResult: true, highlightScanRegion: true,
      })
      session = { scanner: next, video: element }
      camera.current = session
      await next.start()
      // A permission prompt can resolve after close, hiding or unmount.
      if (!current(token)) disposeCamera(session)
    } catch {
      disposeCamera(session)
      if (camera.current === session) camera.current = null
      if (current(token)) setError(es ? 'No se pudo usar la cámara. Revisa el permiso o elige una imagen del QR.' : 'Could not use the camera. Check its permission or choose an image of the QR code.')
    } finally {
      cameraStarting.current = false
      if (mounted.current) setStarting(false)
    }
  }
  const scanImage = async (file: File | undefined) => {
    if (!file || !isOpen.current || document.hidden) return
    invalidate()
    const token = epoch.current
    setError(''); setDecoding(true)
    try {
      const { default: QrScanner } = await import('qr-scanner')
      if (!current(token)) return
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true })
      accept(typeof result === 'string' ? result : result.data, token)
    } catch {
      if (current(token)) setError(es ? 'No se encontró una Fitness Card válida en esa imagen.' : 'No valid Fitness Card was found in that image.')
    } finally { if (current(token)) setDecoding(false) }
  }

  useEffect(() => {
    mounted.current = true
    const hidden = () => { if (document.hidden) invalidate() }
    document.addEventListener('visibilitychange', hidden)
    return () => { mounted.current = false; isOpen.current = false; document.removeEventListener('visibilitychange', hidden); invalidate() }
  }, [invalidate])
  useEffect(() => { if (disabled) { isOpen.current = false; invalidate(); setOpen(false) } }, [disabled, invalidate])

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button type="button" variant="outline" disabled={disabled} className="min-h-11 gap-2"><ScanLine className="h-4 w-4" aria-hidden="true" />{es ? 'Escanear QR' : 'Scan QR'}</Button></DialogTrigger>
    <DialogContent className="w-[calc(100%-2rem)] rounded-2xl" closeLabel={es ? 'Cerrar' : 'Close'}>
      <DialogHeader><DialogTitle>{es ? 'Escanear Fitness Card' : 'Scan Fitness Card'}</DialogTitle><DialogDescription>{es ? 'La cámara solo leerá el enlace privado de la tarjeta. Tú confirmarás la solicitud después.' : 'The camera reads the private card link. You will confirm the request afterwards.'}</DialogDescription></DialogHeader>
      <div className="space-y-4">
        <video ref={video} muted playsInline className="aspect-square w-full rounded-xl bg-black object-cover" aria-label={es ? 'Vista de la cámara para escanear QR' : 'Camera view for scanning QR codes'} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {decoding && <p role="status" className="text-sm text-muted-foreground">{es ? 'Leyendo imagen…' : 'Reading image…'}</p>}
        <Button type="button" className="min-h-11 w-full gap-2" onClick={() => void startCamera()} disabled={starting || decoding}><Camera className="h-4 w-4" aria-hidden="true" />{starting ? (es ? 'Abriendo cámara…' : 'Opening camera…') : (es ? 'Usar cámara' : 'Use camera')}</Button>
        <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-input px-4 text-sm font-medium hover:bg-accent focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
          <ImageUp className="h-4 w-4" aria-hidden="true" />{es ? 'Elegir imagen del QR' : 'Choose QR image'}
          <input type="file" accept="image/*" className="sr-only" disabled={starting || decoding} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void scanImage(file) }} />
        </label>
      </div>
    </DialogContent>
  </Dialog>
}

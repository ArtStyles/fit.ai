'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, ImageUp, ScanLine } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { parseFitnessCardLink } from '@/lib/fitness-card/sharing'

type Scanner = { start(): Promise<void>; stop(): void; destroy(): void; $overlay?: HTMLDivElement }
type CameraSession = { scanner: Scanner; video: HTMLVideoElement }

function disposeCamera(session: CameraSession | null) {
  if (!session) return
  // Keep the captured element: the dialog may already have removed its ref.
  const stream = session.video.srcObject
  try { session.scanner.stop() } catch { /* Continue releasing the stream. */ }
  try { session.scanner.destroy() } catch { /* Continue releasing the stream. */ }
  if (stream && 'getTracks' in stream && typeof stream.getTracks === 'function') stream.getTracks().forEach(track => track.stop())
  session.video.srcObject = null
  session.scanner.$overlay?.remove()
  session.video.remove()
}

export function FitnessCardScanner({ onScan, disabled = false }: { onScan: (ownerId: string) => void; disabled?: boolean }) {
  const { language } = useI18n()
  const es = language === 'es'
  const [open, setOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [decoding, setDecoding] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [error, setError] = useState('')
  const videoHost = useRef<HTMLDivElement>(null)
  const camera = useRef<CameraSession | null>(null)
  const epoch = useRef(0)
  const mounted = useRef(true)
  const isOpen = useRef(false)
  const cameraStarting = useRef(false)
  const cameraWanted = useRef(false)
  const startCameraRef = useRef<(() => Promise<void>) | null>(null)
  const pendingImage = useRef<File | null>(null)
  const imageReading = useRef(false)
  const scanImageRef = useRef<((file: File | undefined) => Promise<void>) | null>(null)

  const invalidate = useCallback(() => {
    epoch.current++
    const active = camera.current
    camera.current = null
    disposeCamera(active)
    if (mounted.current) { setDecoding(false); setCameraActive(false) }
  }, [])
  const current = (token: number) => mounted.current && isOpen.current && token === epoch.current && !document.hidden
  const changeOpen = (next: boolean) => {
    isOpen.current = next
    cameraWanted.current = false
    pendingImage.current = null
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
    cameraWanted.current = false
    pendingImage.current = null
    invalidate()
    setOpen(false)
    onScan(ownerId)
  }
  const startCamera = async () => {
    if (!isOpen.current || cameraStarting.current || document.hidden) return
    pendingImage.current = null
    cameraWanted.current = true
    invalidate()
    const token = epoch.current
    cameraStarting.current = true
    setStarting(true); setError('')
    let session: CameraSession | null = null
    try {
      const { default: QrScanner } = await import('@/lib/fitness-card/qr-decoder')
      if (!current(token) || !videoHost.current) return
      // qr-scanner's delayed stop reads its video again after 300 ms. Give each
      // session its own element so an old stop cannot switch off a new stream.
      const element = document.createElement('video')
      element.className = 'block h-full w-full object-contain'
      element.setAttribute('aria-label', es ? 'Vista de la cámara para escanear QR' : 'Camera view for scanning QR codes')
      videoHost.current.appendChild(element)
      const next = new QrScanner(element, result => accept(typeof result === 'string' ? result : result.data, token), {
        preferredCamera: 'environment', returnDetailedScanResult: true, maxScansPerSecond: 8,
        calculateScanRegion: frame => {
          const width = frame.videoWidth || 640, height = frame.videoHeight || 480
          const scale = Math.min(1, 768 / Math.max(width, height))
          return { x: 0, y: 0, width, height, downScaledWidth: Math.round(width * scale), downScaledHeight: Math.round(height * scale) }
        },
        onDecodeError: reason => {
          const message = (reason instanceof Error ? reason.message : reason).replace(/^Scanner error:\s*/, '')
          if (current(token) && message !== QrScanner.NO_QR_CODE_FOUND) setError(es ? 'El lector no pudo procesar la imagen. Reinicia la cámara o elige una imagen del QR.' : 'The scanner could not process the image. Restart the camera or choose a QR image.')
        },
      })
      session = { scanner: next, video: element }
      camera.current = session
      await next.start()
      // A permission prompt can resolve after close, hiding or unmount.
      if (!current(token)) disposeCamera(session)
      else setCameraActive(true)
    } catch {
      disposeCamera(session)
      if (camera.current === session) camera.current = null
      if (current(token)) { cameraWanted.current = false; setError(es ? 'No se pudo usar la cámara. Revisa el permiso o elige una imagen del QR.' : 'Could not use the camera. Check its permission or choose an image of the QR code.') }
    } finally {
      cameraStarting.current = false
      if (mounted.current) setStarting(false)
      // A permission prompt may finish after the open reader returns to view.
      if (token !== epoch.current && mounted.current && isOpen.current && cameraWanted.current && !document.hidden) queueMicrotask(() => { void startCameraRef.current?.() })
    }
  }
  const scanImage = async (file: File | undefined) => {
    if (!file || !isOpen.current) return
    cameraWanted.current = false
    // Android can deliver the file before the WebView resumes. Keep it only in
    // this open reader and process it when visible, rather than losing the pick.
    pendingImage.current = file
    if (document.hidden || imageReading.current) return
    imageReading.current = true
    invalidate()
    const token = epoch.current
    setError(''); setDecoding(true)
    try {
      const { default: QrScanner } = await import('@/lib/fitness-card/qr-decoder')
      if (!current(token)) return
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true })
      if (current(token)) pendingImage.current = null
      accept(typeof result === 'string' ? result : result.data, token)
    } catch {
      if (current(token)) { pendingImage.current = null; setError(es ? 'No se encontró una Fitness Card válida en esa imagen.' : 'No valid Fitness Card was found in that image.') }
    } finally {
      imageReading.current = false
      if (current(token)) setDecoding(false)
      if (pendingImage.current && mounted.current && isOpen.current && !document.hidden) queueMicrotask(() => { void scanImageRef.current?.(pendingImage.current ?? undefined) })
    }
  }

  useEffect(() => { startCameraRef.current = startCamera; scanImageRef.current = scanImage })
  useEffect(() => {
    mounted.current = true
    const hidden = () => {
      if (document.hidden) invalidate()
      else if (isOpen.current && pendingImage.current) void scanImageRef.current?.(pendingImage.current)
      else if (isOpen.current && cameraWanted.current) void startCameraRef.current?.()
    }
    document.addEventListener('visibilitychange', hidden)
    return () => { mounted.current = false; isOpen.current = false; cameraWanted.current = false; pendingImage.current = null; document.removeEventListener('visibilitychange', hidden); invalidate() }
  }, [invalidate])
  useEffect(() => { if (disabled) { isOpen.current = false; cameraWanted.current = false; pendingImage.current = null; invalidate(); setOpen(false) } }, [disabled, invalidate])

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button type="button" variant="outline" disabled={disabled} className="min-h-11 gap-2"><ScanLine className="h-4 w-4" aria-hidden="true" />{es ? 'Escanear QR' : 'Scan QR'}</Button></DialogTrigger>
    <DialogContent className="w-[calc(100%-2rem)] rounded-2xl" closeLabel={es ? 'Cerrar' : 'Close'}>
      <DialogHeader><DialogTitle>{es ? 'Escanear Fitness Card' : 'Scan Fitness Card'}</DialogTitle><DialogDescription>{es ? 'La cámara solo leerá el enlace privado de la tarjeta. Tú confirmarás la solicitud después.' : 'The camera reads the private card link. You will confirm the request afterwards.'}</DialogDescription></DialogHeader>
      <div className="space-y-4">
        <div ref={videoHost} className="relative aspect-square w-full overflow-hidden rounded-xl bg-black" />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {decoding && <p role="status" className="text-sm text-muted-foreground">{es ? 'Leyendo imagen…' : 'Reading image…'}</p>}
        {cameraActive && !error && <p role="status" className="text-sm text-muted-foreground">{es ? 'Buscando un QR… Mantén el código completo a la vista.' : 'Looking for a QR… Keep the entire code in view.'}</p>}
        <Button type="button" className="min-h-11 w-full gap-2" onClick={() => void startCamera()} disabled={starting || decoding}><Camera className="h-4 w-4" aria-hidden="true" />{starting ? (es ? 'Abriendo cámara…' : 'Opening camera…') : cameraActive ? (es ? 'Reiniciar cámara' : 'Restart camera') : (es ? 'Usar cámara' : 'Use camera')}</Button>
        <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-input px-4 text-sm font-medium hover:bg-accent focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
          <ImageUp className="h-4 w-4" aria-hidden="true" />{es ? 'Elegir imagen del QR' : 'Choose QR image'}
          <input type="file" accept="image/*" className="sr-only" disabled={starting || decoding} onClick={() => { cameraWanted.current = false; pendingImage.current = null; invalidate() }} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void scanImage(file) }} />
        </label>
      </div>
    </DialogContent>
  </Dialog>
}

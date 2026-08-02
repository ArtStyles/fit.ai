'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Grid3X3, Loader2, Minus, Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { calculateSquareCrop } from '@/lib/images/post'

type Point = { x: number; y: number }

type Props = {
  file: File
  open: boolean
  onCancel: () => void
  onComplete: (file: File) => void
}

function exportCanvas(canvas: HTMLCanvasElement): Promise<{ blob: Blob; extension: string }> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) {
        resolve({ blob, extension: 'webp' })
        return
      }
      canvas.toBlob(jpeg => {
        if (jpeg) resolve({ blob: jpeg, extension: 'jpg' })
        else reject(new Error('No se pudo exportar el recorte.'))
      }, 'image/jpeg', 0.9)
    }, 'image/webp', 0.9)
  })
}

export function PostImageCropper({ file, open, onCancel, onComplete }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; point: Point } | null>(null)
  const [viewportSize, setViewportSize] = useState(320)
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 })
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const objectUrl = useMemo(() => URL.createObjectURL(file), [file])

  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl])

  useEffect(() => {
    const node = viewportRef.current
    if (!node) return
    const update = () => setViewportSize(node.clientWidth || 320)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [open])

  useEffect(() => {
    setOffset({ x: 0, y: 0 })
    setZoom(1)
    setError(null)
  }, [file])

  const baseScale = Math.max(viewportSize / imageSize.width, viewportSize / imageSize.height)
  const baseWidth = imageSize.width * baseScale
  const baseHeight = imageSize.height * baseScale

  function clampOffset(next: Point, nextZoom = zoom): Point {
    const maxX = Math.max(0, (baseWidth * nextZoom - viewportSize) / 2)
    const maxY = Math.max(0, (baseHeight * nextZoom - viewportSize) / 2)
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    }
  }

  function changeZoom(next: number) {
    const value = Math.max(1, Math.min(3, next))
    setZoom(value)
    setOffset(current => clampOffset(current, value))
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, point: { x: event.clientX, y: event.clientY } }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.point.x
    const dy = event.clientY - drag.point.y
    drag.point = { x: event.clientX, y: event.clientY }
    setOffset(current => clampOffset({ x: current.x + dx, y: current.y + dy }))
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  async function saveCrop() {
    setSaving(true)
    setError(null)
    try {
      const bitmap = await createImageBitmap(file)
      const crop = calculateSquareCrop(
        bitmap.width,
        bitmap.height,
        viewportSize,
        zoom,
        offset.x,
        offset.y,
      )
      const canvas = document.createElement('canvas')
      canvas.width = 1080
      canvas.height = 1080
      const context = canvas.getContext('2d')
      if (!context) throw new Error('No se pudo preparar la imagen.')
      context.drawImage(bitmap, crop.sx, crop.sy, crop.size, crop.size, 0, 0, 1080, 1080)
      bitmap.close?.()
      const { blob, extension } = await exportCanvas(canvas)
      onComplete(new File([blob], `publicacion-${Date.now()}.${extension}`, { type: blob.type }))
    } catch {
      setError('No se pudo recortar esta imagen. Prueba con otra foto.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!next && !saving) onCancel() }}>
      <DialogContent className="max-w-md border-border/70 p-0 sm:rounded-2xl">
        <DialogHeader className="border-b border-border/60 px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2">
            <Grid3X3 className="h-5 w-5 text-primary" /> Ajustar foto
          </DialogTitle>
          <DialogDescription>Arrastra para encuadrar y usa el control para acercar.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 p-4 sm:p-5">
          <div
            ref={viewportRef}
            className="relative aspect-square w-full touch-none cursor-grab overflow-hidden rounded-xl bg-black active:cursor-grabbing"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          >
            <img
              src={objectUrl}
              alt="Vista previa para recortar"
              draggable={false}
              onLoad={event => setImageSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
              style={{
                width: baseWidth,
                height: baseHeight,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${zoom})`,
                transformOrigin: 'center',
              }}
            />
            <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/60" aria-hidden="true">
              <span className="absolute left-1/3 top-0 h-full w-px bg-white/35" />
              <span className="absolute left-2/3 top-0 h-full w-px bg-white/35" />
              <span className="absolute left-0 top-1/3 h-px w-full bg-white/35" />
              <span className="absolute left-0 top-2/3 h-px w-full bg-white/35" />
            </div>
          </div>

          <div className="flex items-center gap-3" aria-label="Nivel de zoom">
            <Minus className="h-4 w-4 text-muted-foreground" />
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              aria-label="Acercar o alejar la foto"
              onChange={event => changeZoom(Number(event.target.value))}
              className="h-2 flex-1 cursor-pointer accent-violet-500"
            />
            <Plus className="h-4 w-4 text-muted-foreground" />
          </div>

          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

          <button
            type="button"
            onClick={saveCrop}
            disabled={saving}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Usar esta foto
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

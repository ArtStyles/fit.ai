'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Globe2, ImagePlus, Loader2, Pencil, Plus, Send, X } from 'lucide-react'
import { createPost } from '@/app/actions/posts'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { validatePostImage, resizePostImage, MAX_POST_IMAGES } from '@/lib/images/post'
import { useToast } from '@/components/feedback/ToastProvider'
import { PostImageCropper } from './PostImageCropper'

type ComposerImage = { id: string; original: File; cropped: File; previewUrl: string }
type CropTarget = { original: File; replaceIndex?: number }
type Props = {
  author: { name: string; username: string | null; avatarUrl: string | null }
}

export function PostComposer({ author }: Props) {
  const [body, setBody] = useState('')
  const [images, setImages] = useState<ComposerImage[]>([])
  const [cropTarget, setCropTarget] = useState<CropTarget | null>(null)
  const [cropQueue, setCropQueue] = useState<File[]>([])
  const [pending, startTransition] = useTransition()
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const previewUrlsRef = useRef<Set<string>>(new Set())
  const router = useRouter()
  const { showToast } = useToast()

  useEffect(() => {
    const urls = previewUrlsRef.current
    return () => urls.forEach(url => URL.revokeObjectURL(url))
  }, [])

  function beginCrop(files: File[]) {
    if (!files.length) return
    setCropTarget({ original: files[0] })
    setCropQueue(files.slice(1))
  }

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = ''
    const available = MAX_POST_IMAGES - images.length
    if (available <= 0) {
      showToast({ title: `Puedes añadir hasta ${MAX_POST_IMAGES} fotos.`, variant: 'info' })
      return
    }

    const valid: File[] = []
    let validationError: string | null = null
    for (const file of picked) {
      const validation = validatePostImage(file.type, file.size)
      if (validation.ok) valid.push(file)
      else validationError = validation.error
    }
    if (validationError) showToast({ title: validationError, variant: 'error' })
    if (valid.length > available) {
      showToast({ title: `Solo se añadirán ${available} foto${available === 1 ? '' : 's'}.`, variant: 'info' })
    }
    beginCrop(valid.slice(0, available))
  }

  function finishCrop(cropped: File) {
    if (!cropTarget) return
    const previewUrl = URL.createObjectURL(cropped)
    previewUrlsRef.current.add(previewUrl)
    if (cropTarget.replaceIndex !== undefined) {
      setImages(current => current.map((image, index) => {
        if (index !== cropTarget.replaceIndex) return image
        URL.revokeObjectURL(image.previewUrl)
        previewUrlsRef.current.delete(image.previewUrl)
        return { ...image, cropped, previewUrl }
      }))
    } else {
      setImages(current => [...current, {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        original: cropTarget.original,
        cropped,
        previewUrl,
      }])
    }

    const [next, ...remaining] = cropQueue
    setCropQueue(remaining)
    setCropTarget(next ? { original: next } : null)
  }

  function cancelCrop() {
    setCropTarget(null)
    setCropQueue([])
  }

  function editAt(index: number) {
    setCropQueue([])
    setCropTarget({ original: images[index].original, replaceIndex: index })
  }

  function removeAt(index: number) {
    setImages(current => current.filter((image, currentIndex) => {
      if (currentIndex !== index) return true
      URL.revokeObjectURL(image.previewUrl)
      previewUrlsRef.current.delete(image.previewUrl)
      return false
    }))
  }

  function submit() {
    if (!body.trim() && images.length === 0) {
      showToast({ title: 'Escribe algo o añade una foto.', variant: 'error' })
      return
    }
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set('body', body)
        for (const image of images) {
          const { blob, contentType } = await resizePostImage(image.cropped)
          const extension = contentType === 'image/webp' ? 'webp' : 'jpg'
          formData.append('file', new File([blob], `foto.${extension}`, { type: contentType }))
        }
        const result = await createPost(formData)
        if (result.ok) {
          showToast({ title: 'Publicación compartida.', variant: 'success' })
          router.push('/feed')
          router.refresh()
        } else {
          showToast({ title: result.error, variant: 'error' })
        }
      } catch {
        showToast({ title: 'No se pudo procesar una imagen. Inténtalo de nuevo.', variant: 'error' })
      }
    })
  }

  const initials = author.name.slice(0, 1).toUpperCase() || 'U'
  const canPublish = Boolean(body.trim() || images.length)
  const canAddMore = images.length < MAX_POST_IMAGES

  return (
    <div className="space-y-5 px-4 py-5">
      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm shadow-black/10">
        <div className="flex items-center gap-3 border-b border-border/60 p-4">
          <Avatar className="h-11 w-11">
            {author.avatarUrl && <AvatarImage src={author.avatarUrl} alt={author.name} />}
            <AvatarFallback className="bg-primary/15 font-semibold text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{author.name}</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Globe2 className="h-3 w-3" /> Visible en Comunidad
            </p>
          </div>
        </div>

        <div className="relative p-4">
          <textarea
            value={body}
            onChange={event => setBody(event.target.value)}
            maxLength={2200}
            placeholder="Escribe un pie de foto..."
            aria-label="Contenido de la publicación"
            className="min-h-28 w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/70"
          />
          <p className="text-right text-[11px] tabular-nums text-muted-foreground/70">{body.length}/2200</p>
        </div>
      </section>

      {images.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Fotos</h2>
              <p className="text-xs text-muted-foreground">Toca el lápiz para reajustar el encuadre.</p>
            </div>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {images.length}/{MAX_POST_IMAGES}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {images.map((image, index) => (
              <div key={images[index]?.id ?? index} className="group relative overflow-hidden rounded-xl bg-secondary">
                <img src={image.previewUrl} alt={`Foto ${index + 1}`} className="aspect-square w-full object-cover" />
                <div className="absolute inset-x-0 top-0 flex justify-end gap-1.5 bg-gradient-to-b from-black/60 to-transparent p-2 pb-6">
                  <button type="button" onClick={() => editAt(index)} aria-label={`Reencuadrar foto ${index + 1}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => removeAt(index)} aria-label={`Quitar foto ${index + 1}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}

            {canAddMore && (
              <button type="button" onClick={() => galleryInputRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-secondary/30 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Plus className="h-5 w-5" />
                </span>
                Añadir otra
              </button>
            )}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-primary/30 bg-gradient-to-b from-primary/[0.07] to-transparent p-5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <ImagePlus className="h-7 w-7" />
          </div>
          <h2 className="mt-3 text-base font-semibold">Añade tu mejor momento</h2>
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <button type="button" onClick={() => cameraInputRef.current?.click()}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
              <Camera className="h-4 w-4" /> Cámara
            </button>
            <button type="button" onClick={() => galleryInputRef.current?.click()}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold">
              <ImagePlus className="h-4 w-4" /> Galería
            </button>
          </div>
        </section>
      )}

      {images.length > 0 && canAddMore && (
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" onClick={() => cameraInputRef.current?.click()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium">
            <Camera className="h-4 w-4 text-primary" /> Tomar foto
          </button>
          <button type="button" onClick={() => galleryInputRef.current?.click()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium">
            <ImagePlus className="h-4 w-4 text-primary" /> Galería
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-border/70 bg-card p-4">
        <button type="button" onClick={submit} disabled={pending || !canPublish}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-45">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {pending ? 'Publicando...' : 'Compartir publicación'}
        </button>
      </div>

      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
      <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onPick} />

      {cropTarget && (
        <PostImageCropper file={cropTarget.original} open onCancel={cancelCrop} onComplete={finishCrop} />
      )}
    </div>
  )
}

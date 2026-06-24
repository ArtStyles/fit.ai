// src/components/social/PostComposer.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { createPost } from '@/app/actions/posts'
import { validatePostImage, resizePostImage, MAX_POST_IMAGES } from '@/lib/images/post'
import { useToast } from '@/components/feedback/ToastProvider'

export function PostComposer() {
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const { showToast } = useToast()

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    for (const f of picked) {
      const v = validatePostImage(f.type, f.size)
      if (!v.ok) { showToast({ title: v.error, variant: 'error' }); return }
    }
    const next = [...files, ...picked].slice(0, MAX_POST_IMAGES)
    setFiles(next)
    setPreviews(next.map(f => URL.createObjectURL(f)))
  }

  function removeAt(i: number) {
    const next = files.filter((_, idx) => idx !== i)
    setFiles(next)
    setPreviews(next.map(f => URL.createObjectURL(f)))
  }

  function submit() {
    if (!body.trim() && files.length === 0) {
      showToast({ title: 'Escribe algo o añade una foto.', variant: 'error' }); return
    }
    startTransition(async () => {
      const fd = new FormData()
      fd.set('body', body)
      for (const f of files) {
        const { blob, contentType } = await resizePostImage(f)
        const ext = contentType === 'image/webp' ? 'webp' : 'jpg'
        fd.append('file', new File([blob], `photo.${ext}`, { type: contentType }))
      }
      const res = await createPost(fd)
      if (res.ok) { showToast({ title: 'Publicado.', variant: 'success' }); router.push('/feed'); router.refresh() }
      else showToast({ title: res.error, variant: 'error' })
    })
  }

  return (
    <div className="space-y-4 p-4">
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="¿Qué quieres compartir con la comunidad?"
        className="h-32 w-full rounded-xl border border-border bg-card/40 p-3 text-sm"
      />
      {previews.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {previews.map((src, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Foto ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />
              <button onClick={() => removeAt(i)} aria-label="Quitar foto"
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <label className="inline-flex h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <ImagePlus className="h-5 w-5" /> Añadir foto
          <input type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
        </label>
        <button onClick={submit} disabled={pending}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60">
          {pending && <Loader2 className="h-4 w-4 animate-spin" />} Publicar
        </button>
      </div>
    </div>
  )
}

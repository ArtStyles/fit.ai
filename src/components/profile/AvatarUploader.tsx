'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { updateAvatar, removeAvatar } from '@/app/actions/avatar'
import { resizeImageToSquare } from '@/lib/images/avatar'
import { useToast } from '@/components/feedback/ToastProvider'
import { cn } from '@/lib/utils'

type Props = {
  avatarUrl: string | null
  initials: string
  size?: 'header' | 'lg'
  showRemove?: boolean
}

const SIZES = {
  header: { box: 'h-16 w-16', text: 'text-lg',  badge: 'h-5 w-5', icon: 'h-3 w-3'    },
  lg:     { box: 'h-24 w-24', text: 'text-2xl', badge: 'h-7 w-7', icon: 'h-3.5 w-3.5' },
}

export function AvatarUploader({ avatarUrl, initials, size = 'header', showRemove = false }: Props) {
  const router = useRouter()
  const { showToast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const s = SIZES[size]

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite re-seleccionar el mismo archivo
    if (!file) return

    let processed: { blob: Blob; contentType: string }
    try {
      processed = await resizeImageToSquare(file)
    } catch {
      showToast({ title: 'No se pudo procesar la imagen', variant: 'error' })
      return
    }

    const localUrl = URL.createObjectURL(processed.blob)
    setPreview(localUrl)

    const fd = new FormData()
    fd.append('file', processed.blob, 'avatar.webp')

    startTransition(async () => {
      const res = await updateAvatar(fd)
      URL.revokeObjectURL(localUrl)
      if (res.ok) {
        showToast({ title: 'Foto actualizada', variant: 'success' })
        router.refresh()
      } else {
        setPreview(null)
        showToast({ title: 'No se pudo guardar la foto', description: res.error, variant: 'error' })
      }
    })
  }

  function handleRemove() {
    startTransition(async () => {
      const res = await removeAvatar()
      if (res.ok) {
        setPreview(null)
        showToast({ title: 'Foto eliminada', variant: 'success' })
        router.refresh()
      } else {
        showToast({ title: 'No se pudo eliminar la foto', variant: 'error' })
      }
    })
  }

  const shown = preview ?? avatarUrl

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="relative rounded-full ring-offset-background transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label="Cambiar foto de perfil"
      >
        <Avatar className={s.box}>
          {shown && <AvatarImage src={shown} alt="Foto de perfil" />}
          <AvatarFallback className={cn('bg-gradient-to-br from-violet-500 to-violet-700 font-semibold text-white', s.text)}>
            {initials}
          </AvatarFallback>
        </Avatar>

        <span className={cn(
          'absolute bottom-0 right-0 flex items-center justify-center rounded-full border-2 border-background bg-violet-500 text-white',
          s.badge,
        )}>
          {pending ? <Loader2 className={cn('animate-spin', s.icon)} /> : <Camera className={s.icon} />}
        </span>
      </button>

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      {showRemove && avatarUrl && !pending && (
        <button
          type="button"
          onClick={handleRemove}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-red-300"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Quitar foto
        </button>
      )}
    </div>
  )
}

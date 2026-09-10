'use client'

import { useState } from 'react'
import { Expand } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { accountInitials } from '@/components/navigation/AccountWorkspaceTrigger'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type Props = {
  name: string | null
  avatarUrl: string | null
  className?: string
}

export function ProfilePhotoViewer({ name, avatarUrl, className }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const imageUrl = avatarUrl?.trim() || null
  const available = Boolean(imageUrl && imageUrl !== failedUrl)
  const ready = available && loadedUrl === imageUrl
  const avatar = (
    <Avatar className="h-full w-full border border-border/50">
      {available && imageUrl ? (
        <AvatarImage
          src={imageUrl}
          alt=""
          className="object-cover"
          onLoadingStatusChange={status => {
            if (status === 'loaded') setLoadedUrl(imageUrl)
            if (status === 'error') setFailedUrl(imageUrl)
          }}
        />
      ) : null}
      <AvatarFallback className="bg-primary/10 font-display text-2xl font-bold text-primary">
        {accountInitials(name)}
      </AvatarFallback>
    </Avatar>
  )

  if (!available) {
    return (
      <span
        role="img"
        aria-label={t('Foto de perfil')}
        data-marketing-private
        className={cn('block h-20 w-20 shrink-0', className)}
      >
        {avatar}
      </span>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t('Ampliar foto de perfil')}
          disabled={!ready}
          data-profile-photo-trigger
          data-marketing-private
          className={cn(
            'group relative h-20 w-20 shrink-0 rounded-full outline-none',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            className,
          )}
        >
          {avatar}
          {ready ? (
            <span aria-hidden="true" className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[hsl(var(--surface-1))] bg-card text-muted-foreground transition-colors group-hover:text-foreground motion-reduce:transition-none">
              <Expand className="h-3 w-3" />
            </span>
          ) : null}
        </button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="w-[calc(100vw-2rem)] max-w-2xl gap-4 border-border/60 bg-card p-4">
        <DialogTitle className="pr-14 text-base">{t('Foto de perfil')}</DialogTitle>
        {/* The full photo keeps its original proportions, unlike the circular thumbnail. */}
        <img
          src={imageUrl!}
          alt={name?.trim() || t('Foto de perfil')}
          data-marketing-private
          className="mx-auto mt-4 max-h-[65dvh] w-full rounded-xl object-contain"
        />
      </DialogContent>
    </Dialog>
  )
}

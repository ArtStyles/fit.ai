// src/components/social/PostMedia.tsx
import { cn } from '@/lib/utils'

export function PostMedia({ urls }: { urls: string[] }) {
  if (!urls.length) return null
  return (
    <div className={cn('grid gap-1 overflow-hidden rounded-xl', urls.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
      {urls.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={url}
          alt={`Foto ${i + 1}`}
          className="aspect-square w-full object-cover"
          loading="lazy"
        />
      ))}
    </div>
  )
}

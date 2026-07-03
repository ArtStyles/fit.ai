import { cn } from '@/lib/utils'

interface VekiraMarkProps {
  className?: string
  title?: string
}

interface VekiraLogoProps {
  className?: string
  markClassName?: string
  wordmarkClassName?: string
}

export function VekiraMark({ className, title }: VekiraMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
    >
      <defs>
        <linearGradient id="vekira-mark-gradient" x1="12" y1="8" x2="49" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C4B5FD" />
          <stop offset="0.48" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#6D28D9" />
        </linearGradient>
      </defs>
      <path d="M10 10h10.2L36 54H25.5L10 10Z" fill="url(#vekira-mark-gradient)" />
      <path
        d="M37.7 54 28 36.8l10.6-13.5-4.7-3.4L54 10.4l-1.5 22.2-5.2-3.7-9 10.2L46.7 54h-9Z"
        fill="url(#vekira-mark-gradient)"
      />
    </svg>
  )
}

export function VekiraLogo({ className, markClassName, wordmarkClassName }: VekiraLogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#151323] shadow-[0_8px_24px_-10px_rgba(124,58,237,0.9)]',
        markClassName,
      )}>
        <VekiraMark className="h-[70%] w-[70%]" />
      </span>
      <span className={cn('font-display text-xl font-black uppercase tracking-[0.16em]', wordmarkClassName)}>
        Vekira
      </span>
    </span>
  )
}

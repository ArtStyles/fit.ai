'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, CalendarDays, Info, Megaphone, Sparkles } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { cn } from '@/lib/utils'
import type { DashboardBannerData, DashboardBannerKind } from '@/lib/dashboard/banner'

const KIND_CONFIG: Record<DashboardBannerKind, {
  label: string
  icon: typeof Megaphone
  surface: string
  accent: string
}> = {
  announcement: {
    label: 'Anuncio',
    icon: Megaphone,
    surface: 'border-violet-400/25 bg-gradient-to-br from-violet-600/25 via-violet-500/10 to-fuchsia-500/10',
    accent: 'bg-violet-400/15 text-violet-100',
  },
  event: {
    label: 'Evento',
    icon: CalendarDays,
    surface: 'border-violet-400/25 bg-gradient-to-br from-violet-600/25 via-indigo-500/10 to-violet-500/10',
    accent: 'bg-violet-400/15 text-violet-100',
  },
  promotion: {
    label: 'Promoción',
    icon: Sparkles,
    surface: 'border-violet-400/25 bg-gradient-to-br from-violet-600/25 via-fuchsia-500/10 to-indigo-500/10',
    accent: 'bg-violet-300/15 text-violet-100',
  },
  info: {
    label: 'Información',
    icon: Info,
    surface: 'border-violet-400/25 bg-gradient-to-br from-violet-600/20 via-indigo-500/10 to-fuchsia-500/10',
    accent: 'bg-violet-300/15 text-violet-100',
  },
}

export function DashboardPromoBanner({
  banner,
  preview = false,
}: {
  banner: DashboardBannerData
  preview?: boolean
}) {
  const { t } = useI18n()
  const config = KIND_CONFIG[banner.kind]
  const Icon = config.icon
  const hasImage = Boolean(banner.image_url)
  const isExternal = banner.cta_href?.startsWith('https://') ?? false

  const cta = banner.cta_label && banner.cta_href ? (
    <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white/95 px-4 py-2 text-sm font-bold text-slate-950 shadow-sm transition-colors group-hover:bg-violet-50 motion-reduce:transition-none">
      {banner.cta_label}
      <ArrowRight className="h-3.5 w-3.5" />
    </span>
  ) : null

  const content = (
    <article
      className={cn(
        'group relative isolate min-h-44 overflow-hidden rounded-2xl border shadow-lg shadow-black/10',
        config.surface,
      )}
    >
      {banner.image_url && (
        <Image
          src={banner.image_url}
          alt=""
          fill
          sizes="(max-width: 512px) 100vw, 512px"
          className="-z-20 object-cover"
          unoptimized={banner.image_url.startsWith('blob:')}
        />
      )}
      {hasImage && <div className="absolute inset-0 -z-10 bg-gradient-to-r from-slate-950/95 via-slate-950/75 to-slate-950/25" />}
      {!hasImage && (
        <div aria-hidden="true" className="absolute -right-10 -top-12 -z-10 h-40 w-40 rounded-full border-[28px] border-white/[0.035]" />
      )}

      <div className="flex min-h-44 max-w-[88%] flex-col items-start justify-between gap-5 p-5">
        <div>
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em]', config.accent)}>
            <Icon className="h-3.5 w-3.5" />
            {t(config.label)}
          </span>
          <h2 className="mt-3 text-balance font-display text-xl font-bold leading-tight text-white">
            {banner.title || t('Título del banner')}
          </h2>
          {banner.description && (
            <p className="mt-2 line-clamp-3 max-w-sm text-base leading-relaxed text-white/85">
              {banner.description}
            </p>
          )}
        </div>
        {cta}
      </div>
    </article>
  )

  if (!banner.cta_href || preview) return content

  return isExternal ? (
    <a href={banner.cta_href} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400" rel="noreferrer">
      {content}
    </a>
  ) : (
    <Link href={banner.cta_href} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
      {content}
    </Link>
  )
}


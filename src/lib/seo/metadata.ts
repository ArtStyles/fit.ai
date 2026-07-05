import type { Metadata } from 'next'
import type { PublicLocale } from '@/lib/i18n/routing'

export type LocalizedMetadataInput = {
  locale: PublicLocale
  paths: Partial<Record<PublicLocale, string>>
  title: string
  description: string
  image?: string
  index?: boolean
}

export function buildLocalizedMetadata(
  input: LocalizedMetadataInput,
): Metadata {
  const canonical = input.paths[input.locale]
  if (!canonical) {
    throw new Error(`Missing canonical path for locale ${input.locale}`)
  }

  const languages: Record<string, string> = { 'x-default': '/' }
  if (input.paths.es) languages['es-419'] = input.paths.es
  if (input.paths.en) languages.en = input.paths.en

  return {
    title: input.title,
    description: input.description,
    alternates: {
      canonical,
      languages,
    },
    robots: input.index === false ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'website',
      locale: input.locale === 'es' ? 'es_419' : 'en_US',
      url: canonical,
      title: input.title,
      description: input.description,
      images: input.image ? [input.image] : ['/opengraph-image.png'],
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
    },
  }
}

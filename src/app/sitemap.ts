import type { MetadataRoute } from 'next'
import { localizedPath } from '@/lib/i18n/routing'
import { absoluteUrl } from '@/lib/seo/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const esHome = absoluteUrl(localizedPath('es', 'home'))
  const enHome = absoluteUrl(localizedPath('en', 'home'))
  const languages = { 'es-419': esHome, en: enHome }

  return [
    { url: absoluteUrl('/') },
    { url: esHome, alternates: { languages } },
    { url: enHome, alternates: { languages } },
  ]
}

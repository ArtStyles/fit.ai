import { notFound } from 'next/navigation'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { isPublicLocale } from '@/lib/i18n/routing'

export default async function PublicLocaleLayout({
  children,
  params: paramsPromise,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const params = await paramsPromise
  const { locale } = params

  if (!isPublicLocale(locale)) notFound()

  return <I18nProvider language={locale}>{children}</I18nProvider>
}

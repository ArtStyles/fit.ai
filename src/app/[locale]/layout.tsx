import { notFound } from 'next/navigation'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { isPublicLocale } from '@/lib/i18n/routing'

export default function PublicLocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  const { locale } = params

  if (!isPublicLocale(locale)) notFound()

  return <I18nProvider language={locale}>{children}</I18nProvider>
}

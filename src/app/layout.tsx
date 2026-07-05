import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import { Barlow_Condensed, Plus_Jakarta_Sans } from 'next/font/google'
import { ToastProvider } from '@/components/feedback/ToastProvider'
import { ActionNotice } from '@/components/feedback/ActionNotice'
import { SkipLink } from '@/components/accessibility/SkipLink'
import { NativeAppInit } from '@/components/native/NativeAppInit'
import { cookies, headers } from 'next/headers'
import { normalizeLanguage } from '@/lib/i18n'
import { SITE_URL } from '@/lib/seo/site'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import '@/styles/globals.css'

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700', '800', '900'],
  variable: '--font-display',
  display: 'swap',
})

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: { default: 'Vekira', template: '%s | Vekira' },
  description: 'Tu entrenador personal con IA. Rutinas adaptativas semana a semana.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Vekira',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#7c3aed',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const storedLanguage = cookies().get('fitai-language')?.value
  const language = normalizeLanguage(headers().get('x-public-locale') ?? storedLanguage)

  return (
    <html lang={language} className={`dark ${barlowCondensed.variable} ${plusJakarta.variable}`} suppressHydrationWarning>
      <body className="bg-background font-sans text-foreground antialiased">
        <SkipLink />
        <I18nProvider language={language} syncDocumentLanguage={false}>
          <NativeAppInit />
          <ToastProvider>
            <Suspense fallback={null}>
              <ActionNotice />
            </Suspense>
            {children}
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  )
}

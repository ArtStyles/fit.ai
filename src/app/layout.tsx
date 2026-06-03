import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import { Barlow_Condensed, Plus_Jakarta_Sans } from 'next/font/google'
import { RouteTransitionIndicator } from '@/components/navigation/RouteTransitionIndicator'
import { ToastProvider } from '@/components/feedback/ToastProvider'
import { ActionNotice } from '@/components/feedback/ActionNotice'
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
  title: { default: 'FitAI', template: '%s | FitAI' },
  description: 'Tu entrenador personal con IA. Rutinas adaptativas semana a semana.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'FitAI',
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
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`dark ${barlowCondensed.variable} ${plusJakarta.variable}`} suppressHydrationWarning>
      <body className="bg-background font-sans text-foreground antialiased">
        <ToastProvider>
          <Suspense fallback={null}>
            <RouteTransitionIndicator />
            <ActionNotice />
          </Suspense>
          {children}
        </ToastProvider>
      </body>
    </html>
  )
}

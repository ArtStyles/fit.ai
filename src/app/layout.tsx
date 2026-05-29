import type { Metadata } from 'next'
import { Suspense } from 'react'
import { RouteTransitionIndicator } from '@/components/navigation/RouteTransitionIndicator'
import { ToastProvider } from '@/components/feedback/ToastProvider'
import { ActionNotice } from '@/components/feedback/ActionNotice'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: { default: 'FitAI', template: '%s | FitAI' },
  description: 'Tu entrenador personal con IA. Rutinas adaptativas semana a semana.',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
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

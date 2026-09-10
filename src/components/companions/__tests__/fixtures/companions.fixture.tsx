import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/globals.css'
import '../../../../../mobile/src/original/fonts.css'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { CompanionHub } from '../../CompanionHub'
import { CompanionCard } from '../../CompanionCard'
import type { CompanionResult, CompanionSnapshot } from '@/lib/companions/types'

const root = createRoot(document.getElementById('root')!)
const fixtureWindow = window as Window & typeof globalThis & {
  __renderCompanion: (initial: CompanionResult<CompanionSnapshot>, mounted?: boolean, card?: boolean, viewerId?: string, language?: 'es' | 'en') => void
  __COMPANION_READY__?: boolean
}
fixtureWindow.__renderCompanion = (initial, mounted = true, card = false, viewerId, language = 'es') => root.render(
  <StrictMode><I18nProvider language={language} timeZone="America/Havana" syncDocumentLanguage={false}>
    {mounted ? <main className="min-h-screen bg-background pb-28">
      {card ? <div className="mx-auto max-w-lg px-4 py-6"><CompanionCard initial={initial} /></div> : <CompanionHub initial={initial} {...(viewerId ? { viewerId } : {})} />}
    </main> : <p>Otra pantalla</p>}
  </I18nProvider></StrictMode>,
)
fixtureWindow.__COMPANION_READY__ = true

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@/styles/globals.css'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { MusicIntegrationSettings } from '../../MusicIntegrationSettings'

const root = document.getElementById('root')
if (!root) throw new Error('Music integration settings fixture root is missing.')

window.__musicSettingsOpenCalls = 0

createRoot(root).render(
  <StrictMode>
    <I18nProvider language="es" syncDocumentLanguage={false}>
      <MusicIntegrationSettings />
    </I18nProvider>
  </StrictMode>,
)

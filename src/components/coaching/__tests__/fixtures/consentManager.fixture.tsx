import { createRoot } from 'react-dom/client'
import { ConsentManager } from '../../ConsentManager'
import { I18nProvider } from '@/components/i18n/I18nProvider'

const missingTraining = new URLSearchParams(window.location.search).get('missing-training') === 'true'

createRoot(document.getElementById('root')!).render(
  <I18nProvider language="es" timeZone="America/Havana" syncDocumentLanguage={false}>
    <main><ConsentManager relationshipId="relationship-1" consents={[
      ...(missingTraining ? [] : [{ scope: 'training_profile' as const, textVersion: 'training-profile-v1', grantedAt: '2026-08-08T12:00:00.000Z', revokedAt: null }]),
      { scope: 'body_measurements', textVersion: 'body-measurements-v1', grantedAt: '2026-08-08T12:00:00.000Z', revokedAt: null },
    ]} /></main>
  </I18nProvider>,
)

requestAnimationFrame(() => {
  (window as Window & { __CONSENT_MANAGER_READY__?: boolean }).__CONSENT_MANAGER_READY__ = true
})

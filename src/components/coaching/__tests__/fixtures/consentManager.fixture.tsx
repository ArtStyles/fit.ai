import { createRoot } from 'react-dom/client'
import { ConsentManager } from '../../ConsentManager'

createRoot(document.getElementById('root')!).render(
  <main><ConsentManager relationshipId="relationship-1" consents={[
    { scope: 'training_profile', textVersion: 'training-profile-v1', grantedAt: '2026-08-08T12:00:00.000Z', revokedAt: null },
    { scope: 'body_measurements', textVersion: 'body-measurements-v1', grantedAt: '2026-08-08T12:00:00.000Z', revokedAt: null },
  ]} /></main>,
)

requestAnimationFrame(() => {
  (window as Window & { __CONSENT_MANAGER_READY__?: boolean }).__CONSENT_MANAGER_READY__ = true
})

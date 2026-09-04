import { createRoot } from 'react-dom/client'
import { CoachRequestQueue } from '../../CoachRequestQueue'
import { I18nProvider } from '@/components/i18n/I18nProvider'

createRoot(document.getElementById('root')!).render(
  <I18nProvider language="es" timeZone="America/Havana" syncDocumentLanguage={false}>
    <main><CoachRequestQueue requests={[{
      id: 'request-1', clientId: '11111111-1111-4111-8111-111111111111', message: 'Mensaje de prueba', createdAt: '2026-08-08T12:00:00.000Z', serviceName: 'Servicio de prueba',
      clientName: 'Ana Pérez', clientAvatarUrl: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22%3E%3Crect width=%2248%22 height=%2248%22 fill=%22%237c3aed%22/%3E%3C/svg%3E',
    }]} /></main>
  </I18nProvider>,
)

requestAnimationFrame(() => {
  (window as Window & { __COACH_QUEUE_READY__?: boolean }).__COACH_QUEUE_READY__ = true
})

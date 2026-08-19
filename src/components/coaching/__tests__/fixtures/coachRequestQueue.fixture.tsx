import { createRoot } from 'react-dom/client'
import { CoachRequestQueue } from '../../CoachRequestQueue'
import { I18nProvider } from '@/components/i18n/I18nProvider'

createRoot(document.getElementById('root')!).render(
  <I18nProvider language="es" timeZone="America/Havana" syncDocumentLanguage={false}>
    <main><CoachRequestQueue requests={[{
      id: 'request-1', message: 'Mensaje de prueba', createdAt: '2026-08-08T12:00:00.000Z', serviceName: 'Servicio de prueba',
    }]} /></main>
  </I18nProvider>,
)

requestAnimationFrame(() => {
  (window as Window & { __COACH_QUEUE_READY__?: boolean }).__COACH_QUEUE_READY__ = true
})

import { createRoot } from 'react-dom/client'
import { CoachRequestQueue } from '../../CoachRequestQueue'

createRoot(document.getElementById('root')!).render(
  <main><CoachRequestQueue requests={[{
    id: 'request-1', message: 'Mensaje de prueba', createdAt: '2026-08-08T12:00:00.000Z', serviceName: 'Servicio de prueba',
  }]} /></main>,
)

requestAnimationFrame(() => {
  (window as Window & { __COACH_QUEUE_READY__?: boolean }).__COACH_QUEUE_READY__ = true
})

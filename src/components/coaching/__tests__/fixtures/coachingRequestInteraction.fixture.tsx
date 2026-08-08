import { createRoot } from 'react-dom/client'
import { CoachingRequestForm } from '../../CoachingRequestForm'
import { ClientCoachingStatus } from '../../ClientCoachingStatus'

createRoot(document.getElementById('root')!).render(
  <main>
    <CoachingRequestForm service={{ id: '11111111-1111-4111-8111-111111111111', name: 'Servicio de prueba' }} />
    <ClientCoachingStatus requests={[{ id: 'request-1', status: 'pending', createdAt: '2026-08-08T12:00:00.000Z' }]} />
  </main>,
)

requestAnimationFrame(() => {
  (window as Window & { __COACHING_REQUEST_READY__?: boolean }).__COACHING_REQUEST_READY__ = true
})

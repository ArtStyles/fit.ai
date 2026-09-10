import { createRoot } from 'react-dom/client'
import '@/styles/globals.css'
import '../../../../../mobile/src/original/fonts.css'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { AssignedCoachingRoutines } from '../../AssignedCoachingRoutines'
import { ClientCoachingStatus } from '../../ClientCoachingStatus'
import { ConsentManager } from '../../ConsentManager'

const missingTraining = new URLSearchParams(window.location.search).get('missing-training') === 'true'

createRoot(document.getElementById('root')!).render(
  <I18nProvider language="es" timeZone="America/Havana" syncDocumentLanguage={false}>
    <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <header className="mb-6"><h1 className="text-2xl font-bold">Acompañamiento</h1><p className="mt-1 text-sm text-muted-foreground">Tu entrenador, tus rutinas y los datos que compartes.</p></header>
      <ClientCoachingStatus relationship={{ id: 'relationship-1', status: 'active', trainerName: 'Marina Pérez', trainerAvatarUrl: null, serviceName: 'Fuerza y movilidad para tu día a día', startedAt: '2026-09-01T12:00:00.000Z', sourceRequestId: 'request-current' }} requests={[
        { id: 'request-current', status: 'accepted', trainerName: 'Marina Pérez', trainerAvatarUrl: null, serviceName: 'Fuerza y movilidad para tu día a día', createdAt: '2026-09-01T12:00:00.000Z' },
        { id: 'request-old', status: 'accepted', trainerName: 'Luis Sosa', trainerAvatarUrl: null, serviceName: 'Movilidad de agosto', createdAt: '2026-08-01T12:00:00.000Z' },
      ]}>
        <AssignedCoachingRoutines routines={[{ id: 'routine-1', name: 'Fuerza progresiva de cuerpo completo', trainerName: 'Marina Pérez', message: 'Prioriza la técnica y descansa entre series. Si notas molestias, adapta la carga antes de continuar.' }]} />
        <ConsentManager relationshipId="relationship-1" consents={[
          ...(missingTraining ? [] : [{ scope: 'training_profile' as const, textVersion: 'training-profile-v1', grantedAt: '2026-09-01T12:00:00.000Z', revokedAt: null }]),
          { scope: 'body_measurements', textVersion: 'body-measurements-v1', grantedAt: '2026-09-01T12:00:00.000Z', revokedAt: null },
        ]} />
      </ClientCoachingStatus>
    </main>
  </I18nProvider>,
)

requestAnimationFrame(() => {
  (window as Window & { __COACHING_HUB_READY__?: boolean }).__COACHING_HUB_READY__ = true
})

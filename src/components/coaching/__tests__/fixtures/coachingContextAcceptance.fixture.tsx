import { createRoot } from 'react-dom/client'

import '@/styles/globals.css'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import type { ClientCoachingSummary } from '@/lib/coaching/clientSummary'
import type { PublicTrainerDirectoryRow } from '@/lib/coaching/directory'
import { CoachingSummaryCard } from '@/components/dashboard/CoachingSummaryCard'
import { AssignProgramDialog, type Relationship } from '../../AssignProgramDialog'
import { ConsentManager } from '../../ConsentManager'
import { TrainerDirectory } from '../../TrainerDirectory'

const contractedTrainerId = '11111111-1111-4111-8111-111111111111'

const trainers: PublicTrainerDirectoryRow[] = [
  {
    bio: 'Entrenadora especializada en progresión de fuerza y técnica sostenible.',
    experienceSummary: 'Ocho años acompañando procesos de fuerza.',
    generalLocation: 'La Habana',
    languages: ['Español'],
    modalities: ['hybrid'],
    professionalName: 'Laura Méndez',
    professionalPhotoUrl: null,
    services: [],
    slug: 'laura-mendez',
    specialties: ['Fuerza', 'Técnica'],
    userId: contractedTrainerId,
    verifiedAt: '2026-08-20T12:00:00.000Z',
  },
  {
    bio: 'Entrenador de movilidad y acondicionamiento para objetivos cotidianos.',
    experienceSummary: 'Seis años guiando entrenamiento funcional.',
    generalLocation: 'Matanzas',
    languages: ['Español', 'Inglés'],
    modalities: ['online'],
    professionalName: 'Diego Ruiz',
    professionalPhotoUrl: null,
    services: [],
    slug: 'diego-ruiz',
    specialties: ['Movilidad'],
    userId: '22222222-2222-4222-8222-222222222222',
    verifiedAt: '2026-08-22T12:00:00.000Z',
  },
]

const contractedSummary: ClientCoachingSummary = {
  assignmentStatus: 'active',
  relationshipId: '33333333-3333-4333-8333-333333333333',
  relationshipStatus: 'active',
  serviceId: '44444444-4444-4444-8444-444444444444',
  serviceName: 'Seguimiento de fuerza integral',
  startedAt: '2026-08-24T12:00:00.000Z',
  trainerAvatarUrl: null,
  trainerName: 'Laura Méndez',
  trainerSlug: 'laura-mendez',
  trainerUserId: contractedTrainerId,
  trainingConsentActive: true,
}

const needsConsentSummary: ClientCoachingSummary = {
  assignmentStatus: null,
  relationshipId: '55555555-5555-4555-8555-555555555555',
  relationshipStatus: 'active',
  serviceId: '66666666-6666-4666-8666-666666666666',
  serviceName: 'Preparación de fuerza personalizada',
  startedAt: '2026-09-01T12:00:00.000Z',
  trainerAvatarUrl: null,
  trainerName: 'Marina Soler',
  trainerSlug: 'marina-soler',
  trainerUserId: '77777777-7777-4777-8777-777777777777',
  trainingConsentActive: false,
}

const proposalPendingSummary: ClientCoachingSummary = {
  assignmentStatus: 'proposed',
  relationshipId: '88888888-8888-4888-8888-888888888888',
  relationshipStatus: 'active',
  serviceId: '99999999-9999-4999-8999-999999999999',
  serviceName: 'Rendimiento y movilidad',
  startedAt: '2026-09-02T12:00:00.000Z',
  trainerAvatarUrl: null,
  trainerName: 'Carlos Vega',
  trainerSlug: 'carlos-vega',
  trainerUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  trainingConsentActive: true,
}

const assignmentRecipients: Relationship[] = [
  {
    canReceiveProposal: true,
    clientName: 'Ana Lista',
    clientUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    serviceName: 'Servicio Fuerza',
    startedAt: '1 sep 2026',
    state: 'Listo para recibir rutina',
  },
  {
    blockingReason: 'El cliente ya tiene una propuesta pendiente de revisión.',
    canReceiveProposal: false,
    clientName: 'Luis Pendiente',
    clientUserId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    serviceName: 'Servicio Movilidad',
    startedAt: '2 sep 2026',
    state: 'Propuesta pendiente',
  },
  {
    blockingReason: 'El cliente ya tiene una rutina profesional activa.',
    canReceiveProposal: false,
    clientName: 'Eva Activa',
    clientUserId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    id: '01234567-89ab-4cde-8f01-23456789abcd',
    serviceName: 'Servicio Resistencia',
    startedAt: '3 sep 2026',
    state: 'Rutina activa',
  },
]

const root = document.getElementById('root')
if (!root) throw new Error('Coaching context acceptance fixture root is missing.')

createRoot(root).render(
  <I18nProvider language="es" timeZone="America/Havana" syncDocumentLanguage={false}>
    <main id="main-content" className="mx-auto w-full max-w-6xl space-y-10 px-3 py-6 sm:px-6">
      <section aria-label="Directorio de entrenadores" data-acceptance-surface="directory">
        <TrainerDirectory
          coachingSummary={contractedSummary}
          filters={{}}
          nextCursor={null}
          trainers={trainers}
        />
      </section>

      <section aria-labelledby="dashboard-coaching-states" className="space-y-3" data-acceptance-surface="dashboard">
        <h2 id="dashboard-coaching-states" className="text-xl font-bold text-foreground">
          Estados del acompañamiento
        </h2>
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          <CoachingSummaryCard summary={needsConsentSummary} />
          <CoachingSummaryCard summary={proposalPendingSummary} />
        </div>
      </section>

      <section aria-label="Gestión de autorización" data-acceptance-surface="consent">
        <ConsentManager
          consents={[]}
          relationshipId="13572468-2468-4135-8246-135724681357"
        />
      </section>

      <section aria-label="Envío profesional de rutina" data-acceptance-surface="assignment">
        <AssignProgramDialog
          relationships={assignmentRecipients}
          selectedRelationshipId={assignmentRecipients[1].id}
          templateId="24681357-1357-4246-8135-246813572468"
        />
      </section>
    </main>
  </I18nProvider>,
)

requestAnimationFrame(() => {
  window.__COACHING_CONTEXT_ACCEPTANCE_READY__ = true
})

declare global {
  interface Window {
    __COACHING_CONTEXT_ACCEPTANCE_READY__?: boolean
  }
}

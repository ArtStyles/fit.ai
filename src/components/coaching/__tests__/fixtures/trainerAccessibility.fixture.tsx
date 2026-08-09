import { createRoot } from 'react-dom/client'
import '@/styles/globals.css'
import { ApplicationForm } from '../../ApplicationForm'
import { ApplicationTimeline } from '../../ApplicationTimeline'
import { AssignProgramDialog } from '../../AssignProgramDialog'
import { CoachRequestQueue } from '../../CoachRequestQueue'
import { ProgramTemplateEditor } from '../../ProgramTemplateEditor'
import { ProposedProgramReview } from '../../ProposedProgramReview'
import { TrainerPublicProfile } from '../../TrainerPublicProfile'
import { WorkspaceSwitcher } from '../../../navigation/WorkspaceSwitcher'

const surface = new URLSearchParams(window.location.search).get('surface')

function Surface() {
  if (surface === 'application') {
    return <ApplicationForm initialApplication={null} initialCredentials={[]} allowedPhotoUrls={[]} />
  }
  if (surface === 'requests') {
    return <CoachRequestQueue requests={[{
      id: '11111111-1111-4111-8111-111111111111',
      serviceName: 'Servicio de fuerza',
      message: 'Quiero mejorar mi técnica.',
      createdAt: '2026-08-08T12:00:00.000Z',
    }]} />
  }
  if (surface === 'assignment') {
    return <AssignProgramDialog
      templateId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      relationships={[{
        id: '11111111-1111-4111-8111-111111111111',
        label: 'Servicio Fuerza · iniciado 1 ene 2026 · ref. 11111111',
      }]}
    />
  }
  if (surface === 'timeline') {
    return <ApplicationTimeline
      applicantTimezone="America/Havana"
      events={[]}
      interview={{
        proposedAt: '2026-08-10T18:30:00.000Z',
        timezone: 'America/Havana',
        medium: 'video_call',
        externalUrl: 'https://meet.example.test/interview/ada',
        status: 'scheduled',
        publicNote: 'Ten tus credenciales a mano.',
      }}
    />
  }
  if (surface === 'proposal') {
    return <ProposedProgramReview proposal={{
      assignmentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      versionNumber: 1,
      trainerName: 'Ada Entrenadora',
      snapshot: {
        schemaVersion: 1,
        name: 'Fuerza inicial',
        goal: 'Aprender la técnica',
        description: null,
        daysPerWeek: 1,
        workouts: [],
      },
      exerciseNames: {},
    }} />
  }
  if (surface === 'workspace') {
    return <WorkspaceSwitcher workspace="coach" variant="desktop" />
  }
  if (surface === 'public-profile') {
    return <TrainerPublicProfile trainer={{
      userId: '11111111-1111-4111-8111-111111111111',
      slug: 'ada-entrenadora',
      professionalName: 'Ada Entrenadora',
      professionalPhotoUrl: null,
      bio: 'Entrenadora de fuerza.',
      specialties: ['Fuerza'],
      modalities: ['online'],
      experienceSummary: 'Ocho años de experiencia.',
      generalLocation: 'La Habana',
      languages: ['Español'],
      verifiedAt: '2026-08-08T00:00:00.000Z',
      services: [],
    }} />
  }
  return <ProgramTemplateEditor
    template={{
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Fuerza', goal: null, description: null, days_per_week: 2, status: 'draft',
    }}
    workouts={[{
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Día A', day_of_week: 1, order_in_plan: 1,
      exercises: [{
        id: '33333333-3333-4333-8333-333333333333',
        exercise_id: '44444444-4444-4444-8444-444444444444',
        order_index: 1, sets: 3, reps: 10, weight_kg: null, target_rpe: null,
        rest_seconds: 60, notes: null, exercise: { name: 'Sentadilla' },
      }],
    }]}
    options={[{
      id: '44444444-4444-4444-8444-444444444444', name: 'Sentadilla',
      muscle_groups: ['piernas'], equipment: [], difficulty: 'beginner',
      exercise_type: 'strength', is_compound: true,
    }]}
  />
}

createRoot(document.getElementById('root')!).render(
  <main id="main-content" aria-label="Superficie profesional" className="mx-auto max-w-5xl px-4 py-6">
    <Surface />
  </main>,
)

requestAnimationFrame(() => {
  (window as Window & { __TRAINER_ACCESSIBILITY_READY__?: boolean }).__TRAINER_ACCESSIBILITY_READY__ = true
})

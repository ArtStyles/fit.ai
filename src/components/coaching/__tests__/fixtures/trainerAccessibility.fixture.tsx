import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/globals.css'
import { TrainerDirectory } from '../../TrainerDirectory'
import { ApplicationForm } from '../../ApplicationForm'
import { ApplicationTimeline } from '../../ApplicationTimeline'
import { AssignProgramDialog } from '../../AssignProgramDialog'
import { CoachRequestQueue } from '../../CoachRequestQueue'
import { ProgramTemplateEditor } from '../../ProgramTemplateEditor'
import { ProposedProgramReview } from '../../ProposedProgramReview'
import { TrainerPublicProfile } from '../../TrainerPublicProfile'
import { WorkspaceSwitcher } from '../../../navigation/WorkspaceSwitcher'
import { ActiveWorkoutDockView } from '../../../navigation/BottomNav'
import { ExerciseCatalogDialog } from '../../../plan/ExercisePicker'
import type { PublicTrainerDirectoryRow } from '@/lib/coaching/directory'

const surface = new URLSearchParams(window.location.search).get('surface')

const trainerRows: PublicTrainerDirectoryRow[] = [
  {
    userId: '11111111-1111-4111-8111-111111111111',
    slug: 'ada-entrenadora',
    professionalName: 'Ada Entrenadora',
    professionalPhotoUrl: null,
    bio: 'Entrenamiento de fuerza adaptado a tu experiencia y disponibilidad.',
    specialties: ['Fuerza', 'Hipertrofia'],
    modalities: ['online', 'in_person'],
    experienceSummary: 'Ocho años acompañando procesos de fuerza.',
    generalLocation: 'La Habana',
    languages: ['Español', 'Inglés'],
    verifiedAt: '2026-08-08T00:00:00.000Z',
    services: [],
  },
  {
    userId: '22222222-2222-4222-8222-222222222222',
    slug: 'lucia-movimiento',
    professionalName: 'Lucía Movimiento',
    professionalPhotoUrl: null,
    bio: 'Movilidad y regreso progresivo al entrenamiento para todos los niveles.',
    specialties: ['Movilidad', 'Principiantes'],
    modalities: ['online'],
    experienceSummary: 'Especialista en movimiento y hábitos sostenibles.',
    generalLocation: 'Madrid',
    languages: ['Español'],
    verifiedAt: '2026-08-08T00:00:00.000Z',
    services: [],
  },
]

function DirectoryFixture() {
  const filtered = new URLSearchParams(window.location.search).get('filtered') === '1'
  const [filters, setFilters] = useState(filtered
    ? { text: 'fuerza', modality: 'online', location: 'La Habana' }
    : {})

  useEffect(() => {
    (window as Window & { __NEXT_LINK_NAVIGATE__?: (href: string) => void }).__NEXT_LINK_NAVIGATE__ = href => {
      if (href === '/trainers') setFilters({})
    }
    return () => {
      delete (window as Window & { __NEXT_LINK_NAVIGATE__?: (href: string) => void }).__NEXT_LINK_NAVIGATE__
    }
  }, [])

  return <TrainerDirectory filters={filters} nextCursor={null} trainers={trainerRows} />
}

function Surface() {
  if (surface === 'directory') {
    return <DirectoryFixture />
  }
  if (surface === 'catalog') {
    return <ExerciseCatalogDialog
      open
      onOpenChange={() => {}}
      selectionMode="multiple"
      title="Agregar ejercicios"
      onConfirm={() => {}}
      options={[
        { id: '1', name: 'Press de banca', muscleGroups: ['Pecho'], equipment: ['Barra'], imageUrl: null },
        { id: '2', name: 'Curl de bíceps', muscleGroups: ['Bíceps'], equipment: ['Mancuernas'], imageUrl: null },
        { id: '3', name: 'Extensión de pierna', muscleGroups: ['Cuádriceps'], equipment: ['Máquina'], imageUrl: null },
        { id: '4', name: 'Jalón al pecho', muscleGroups: ['Dorsales'], equipment: ['Cable'], imageUrl: null },
        { id: '5', name: 'Peso muerto', muscleGroups: ['Glúteos', 'Isquiotibiales'], equipment: ['Barra'], imageUrl: null },
        { id: '6', name: 'Elevaciones laterales', muscleGroups: ['Hombros'], equipment: ['Mancuernas'], imageUrl: null },
      ]}
    />
  }
  if (surface === 'active-dock') {
    return <>
      <section className="min-h-[70vh] space-y-3" aria-labelledby="active-workout-preview">
        <h1 id="active-workout-preview" className="text-2xl font-bold">Entrenamiento</h1>
        <p className="text-sm text-muted-foreground">Tus rutinas están listas para continuar.</p>
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-semibold">Pecho y tríceps</h2>
          <p className="mt-1 text-sm text-muted-foreground">Press de banca, fondos y extensiones</p>
        </div>
      </section>
      <ActiveWorkoutDockView
        workoutId="33333333-3333-4333-8333-333333333333"
        workoutName="Pecho y tríceps"
        elapsedLabel="12 min"
        completedSets={5}
        totalSets={12}
        percentage={42}
        onDiscard={() => {}}
      />
    </>
  }
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

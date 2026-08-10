import { createRoot } from 'react-dom/client'
import { ApplicationForm, type TrainerApplicationView } from '../../ApplicationForm'

const COMPLETE_APPLICATION: TrainerApplicationView = {
  id: '31111111-1111-4111-8111-111111111111',
  status: 'draft',
  professionalName: 'Ada Entrenadora',
  professionalPhotoUrl: 'https://cdn.example.test/ada.jpg',
  bio: 'Entrenadora de fuerza con un enfoque progresivo, seguro y adaptado a cada persona.',
  specialties: ['Fuerza'],
  modalities: ['online'],
  experienceSummary: 'Ocho años acompañando procesos de fuerza y movilidad.',
  generalLocation: 'La Habana',
  languages: ['Español'],
  contactEmail: 'ada@example.test',
  contactPhone: '+53 5555 0101',
  preferredContact: 'email',
  timezone: 'America/Havana',
  interviewAvailability: 'De lunes a viernes después de las 15:00.',
}

const CREDENTIALS = [{
  id: '41111111-1111-4111-8111-111111111111',
  credentialType: 'link' as const,
  title: 'Certificación de fuerza',
  issuer: 'Academia Ejemplo',
  issuedOn: '2024-01-10',
  expiresOn: null,
  externalUrl: 'https://issuer.example.test/cert/ada',
  fileName: null,
}]

const testCase = new URLSearchParams(window.location.search).get('case')
const application = {
  ...COMPLETE_APPLICATION,
  ...(testCase === 'photo' ? { professionalPhotoUrl: null } : {}),
  ...(testCase === 'modalities' ? { modalities: [] as TrainerApplicationView['modalities'] } : {}),
}

createRoot(document.getElementById('root')!).render(
  <ApplicationForm
    initialApplication={application}
    initialCredentials={testCase === 'credentials' ? [] : CREDENTIALS}
    allowedPhotoUrls={application.professionalPhotoUrl ? [application.professionalPhotoUrl] : []}
  />,
)

requestAnimationFrame(() => {
  (window as Window & { __APPLICATION_FORM_READY__?: boolean }).__APPLICATION_FORM_READY__ = true
})

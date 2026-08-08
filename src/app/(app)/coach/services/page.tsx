import { Briefcase } from 'lucide-react'
import { TrainerServiceForm, type TrainerServiceFormValue } from '@/components/coaching/TrainerServiceForm'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { requireActiveTrainerContext } from '@/lib/coaching/access'

export const metadata = { title: 'Servicios profesionales · Vekira' }

type ServiceRow = {
  id: string
  name: string
  description: string
  modality: TrainerServiceFormValue['modality']
  duration_minutes: number
  content: string
  capacity: number
  is_active: boolean
}

export default async function CoachServicesPage() {
  const { supabase, trainerProfile } = await requireActiveTrainerContext()
  const { data, error } = await (supabase.from('trainer_service_offerings') as any)
    .select('id, name, description, modality, duration_minutes, content, capacity, is_active')
    .eq('trainer_profile_id', trainerProfile.id)
    .order('created_at', { ascending: false })
  if (error) throw new Error('No se pudieron cargar los servicios.')
  const services = (data ?? []) as ServiceRow[]

  return (
    <div className="min-h-screen bg-background pb-28">
      <PageTopBar title="Servicios" subtitle="Define cómo acompañas a tus clientes" backHref="/coach/profile" backLabel="Perfil" icon={<Briefcase className="h-5 w-5" />} />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <TrainerServiceForm />
        {services.length > 0 ? (
          <section aria-label="Tus servicios" className="space-y-4">
            <h2 className="text-lg font-bold text-foreground">Tus servicios</h2>
            {services.map(service => (
              <TrainerServiceForm
                key={service.id}
                initialService={{
                  id: service.id,
                  name: service.name,
                  description: service.description,
                  modality: service.modality,
                  durationMinutes: service.duration_minutes,
                  content: service.content,
                  capacity: service.capacity,
                  isActive: service.is_active,
                }}
              />
            ))}
          </section>
        ) : null}
      </main>
    </div>
  )
}

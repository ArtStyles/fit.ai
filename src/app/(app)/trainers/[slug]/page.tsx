import { notFound } from 'next/navigation'
import { CoachingRequestForm } from '@/components/coaching/CoachingRequestForm'
import { TrainerPublicProfile } from '@/components/coaching/TrainerPublicProfile'
import { getActiveTrainerBySlug, getRequestableTrainerServicesBySlug } from '@/lib/coaching/directory'

export default async function TrainerPublicProfilePage({ params }: { params: { slug: string } }) {
  const trainer = await getActiveTrainerBySlug(params.slug)
  if (!trainer) notFound()
  const requestableServices = await getRequestableTrainerServicesBySlug(params.slug)

  return (
    <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <TrainerPublicProfile trainer={trainer} />
      {requestableServices.length ? <section className="mt-6 space-y-3" aria-labelledby="request-service-title">
        <h2 id="request-service-title" className="text-lg font-bold text-foreground">Solicitar un servicio</h2>
        {requestableServices.map(service => <CoachingRequestForm key={service.id} service={service} />)}
      </section> : null}
    </main>
  )
}

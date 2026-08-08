import { notFound } from 'next/navigation'
import { TrainerPublicProfile } from '@/components/coaching/TrainerPublicProfile'
import { getActiveTrainerBySlug } from '@/lib/coaching/directory'

export default async function TrainerPublicProfilePage({ params }: { params: { slug: string } }) {
  const trainer = await getActiveTrainerBySlug(params.slug)
  if (!trainer) notFound()

  return (
    <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <TrainerPublicProfile trainer={trainer} />
    </main>
  )
}

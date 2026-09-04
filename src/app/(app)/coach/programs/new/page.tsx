import { Dumbbell } from 'lucide-react'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { requireActiveTrainerContext } from '@/lib/coaching/access'
import { NewProgramTemplateForm } from '@/components/coaching/NewProgramTemplateForm'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const metadata = { title: 'Nueva rutina profesional · Vekira' }

export default async function NewCoachProgramPage({ searchParams }: { searchParams?: { clientId?: string | string[] } }) {
  const { user, supabase } = await requireActiveTrainerContext()
  const rawClientId = Array.isArray(searchParams?.clientId) ? searchParams.clientId[0] : searchParams?.clientId
  const clientId = rawClientId && UUID.test(rawClientId)
    ? (await (supabase.from('coaching_relationships') as any).select('id').eq('trainer_user_id', user.id).eq('client_user_id', rawClientId).eq('status', 'active').maybeSingle()).data ? rawClientId : undefined
    : undefined
  return <div className="min-h-screen bg-background pb-28"><PageTopBar title="Nueva rutina" subtitle="Plantilla profesional" backHref="/coach/programs" backLabel="Rutinas" icon={<Dumbbell className="h-5 w-5" />} /><main className="mx-auto max-w-2xl px-4 py-8"><NewProgramTemplateForm clientId={clientId} /></main></div>
}

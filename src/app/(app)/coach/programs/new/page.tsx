import { Dumbbell } from 'lucide-react'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { requireActiveTrainerContext } from '@/lib/coaching/access'
import { NewProgramTemplateForm } from '@/components/coaching/NewProgramTemplateForm'

export const metadata = { title: 'Nueva rutina profesional · Vekira' }

export default async function NewCoachProgramPage() {
  await requireActiveTrainerContext()
  return <div className="min-h-screen bg-background pb-28"><PageTopBar title="Nueva rutina" subtitle="Plantilla profesional" backHref="/coach/programs" backLabel="Rutinas" icon={<Dumbbell className="h-5 w-5" />} /><main className="mx-auto max-w-2xl px-4 py-8"><NewProgramTemplateForm /></main></div>
}

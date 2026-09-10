import { loadCompanion } from '@/app/actions/companions'
import { CompanionHub } from '@/components/companions/CompanionHub'
import { requireAppUserContext } from '@/lib/auth/server'

export const metadata = { title: 'Compañero de constancia · Vekira' }

export default async function CompanionPage() {
  const { user } = await requireAppUserContext()
  return <div className="min-h-screen bg-background pb-28"><CompanionHub key={user.id} viewerId={user.id} initial={await loadCompanion()} /></div>
}

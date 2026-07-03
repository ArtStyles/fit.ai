import { redirect } from 'next/navigation'
import { getAppUserContext } from '@/lib/auth/server'
import OnboardingWizard from './OnboardingWizard'
import { BrandTopBar } from '@/components/navigation/BrandTopBar'

export const metadata = { title: 'Bienvenido a Vekira' }

export default async function OnboardingPage() {
  const { user, profile } = await getAppUserContext()
  if (!user) redirect('/login')

  if (profile?.onboarding_done) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-background">
      <BrandTopBar />
      <OnboardingWizard />
    </div>
  )
}

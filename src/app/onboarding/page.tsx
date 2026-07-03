import { redirect } from 'next/navigation'
import { getAppUserContext } from '@/lib/auth/server'
import OnboardingWizard from './OnboardingWizard'

export const metadata = { title: 'Bienvenido a Vekira' }

export default async function OnboardingPage() {
  const { user, profile } = await getAppUserContext()
  if (!user) redirect('/login')

  if (profile?.onboarding_done) redirect('/dashboard')

  return <OnboardingWizard />
}

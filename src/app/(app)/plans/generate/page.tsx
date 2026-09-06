import { redirect }    from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { requireAppUserContext } from '@/lib/auth/server'
import { GeneratePlanClient } from './GeneratePlanClient'
import type { ProfileSummary } from './GeneratePlanClient'

export const metadata = { title: 'Generar plan · Vekira' }

export default async function GeneratePlanPage({
  searchParams,
}: {
  searchParams?: { autostart?: string }
}) {
  const { supabase, user } = await requireAppUserContext()

  // Leer perfil para mostrar el resumen al usuario
  type ProfileRow = {
    fitness_level:            string | null
    primary_goal:             string | null
    days_per_week:            number | null
    session_duration_minutes: number | null
    gym_type:                 string | null
  }

  const { data: profileRaw } = await supabase
    .from('profiles')
    .select('fitness_level, primary_goal, days_per_week, session_duration_minutes, gym_type')
    .eq('id', user.id)
    .single() as unknown as { data: ProfileRow | null }

  // Si el perfil está incompleto, redirigir al onboarding
  if (!profileRaw?.fitness_level || !profileRaw?.primary_goal || !profileRaw?.days_per_week) {
    redirect('/onboarding')
  }

  const profile: ProfileSummary = {
    fitnessLevel:   profileRaw.fitness_level!,
    primaryGoal:    profileRaw.primary_goal!,
    daysPerWeek:    profileRaw.days_per_week!,
    sessionMinutes: profileRaw.session_duration_minutes ?? 60,
    gymType:        profileRaw.gym_type ?? 'full_gym',
  }

  return (
    <div className="min-h-screen bg-background">
      <PageTopBar
        accountSlot="hidden"
        title="Generar plan"
        subtitle="Entrenamiento personalizado basado en evidencia"
        backHref="/plan"
        backLabel="Plan"
        icon={<Sparkles className="h-5 w-5" />}
      />

      <div className="mx-auto max-w-lg px-4 py-8">
        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <div className="mb-8 flex flex-col items-center text-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/10">
            <Sparkles className="h-8 w-8 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Tu plan personalizado</h1>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-xs">
              El motor creará un plan de entrenamiento adaptado a tu perfil,
              equipamiento, restricciones y objetivos.
            </p>
          </div>
        </div>

        {/* ── Contenido interactivo (Client Component) ─────────────────── */}
        <GeneratePlanClient profile={profile} autoStart={searchParams?.autostart === '1'} />

      </div>
    </div>
  )
}

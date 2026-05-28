'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { OnboardingAnswers } from './types'
import type { Database } from '@/types/database'

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

export async function saveOnboardingAnswers(answers: OnboardingAnswers): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Convert age string → ISO date (Jan 1 of birth year, good enough for fitness calcs)
  let date_of_birth: string | null = null
  const age = parseInt(answers.age, 10)
  if (!isNaN(age) && age > 0) {
    date_of_birth = `${new Date().getFullYear() - age}-01-01`
  }

  const payload: ProfileUpdate = {
    primary_goal:              answers.goal as ProfileUpdate['primary_goal'],
    fitness_level:             answers.fitness_level as ProfileUpdate['fitness_level'],
    days_per_week:             answers.days_per_week,
    session_duration_minutes:  answers.session_duration,
    gym_type:                  answers.gym_type as ProfileUpdate['gym_type'],
    available_equipment:       answers.equipment,
    injuries:                  answers.injuries.trim() || null,
    height_cm:                 answers.height_cm ? parseFloat(answers.height_cm) : null,
    weight_kg:                 answers.weight_kg ? parseFloat(answers.weight_kg) : null,
    date_of_birth,
    gender:                    answers.gender as ProfileUpdate['gender'],
    onboarding_done:           true,
  }

  // cast needed: supabase-js v2 generic inference issue with hand-crafted DB types
  const { error } = await supabase
    .from('profiles')
    .update(payload as never)
    .eq('id', user.id)

  if (error) throw new Error(error.message)
}

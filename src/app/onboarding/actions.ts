'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { OnboardingAnswers } from './types'
import type { Database } from '@/types/database'
import { dateOfBirthFromAge } from '@/lib/profile/age'

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

export async function saveOnboardingAnswers(answers: OnboardingAnswers): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Convert validated decimal age → ISO date (Jan 1 of birth year, good enough for fitness calcs)
  const date_of_birth = dateOfBirthFromAge(answers.age)

  const movementLimitations = answers.limitation_regions.map(region => ({
    region,
    side: null,
    status: answers.limitation_status ?? 'stable',
    movementsToAvoid: answers.movements_to_avoid.split(',').map(value => value.trim()).filter(Boolean),
    clinicianCleared: answers.clinician_cleared,
  }))

  const requiresProfessionalClearance =
    (answers.warning_symptoms.length > 0 && !answers.medically_cleared) ||
    (answers.recent_surgery && !answers.medically_cleared) ||
    (answers.known_disease && !answers.medically_cleared) ||
    (movementLimitations.length > 0 && (!answers.clinician_cleared || (
      answers.limitation_status === 'acute' ||
      (answers.limitation_status === 'recovering' && !answers.clinician_cleared)
    )))

  const readinessStatus: ProfileUpdate['readiness_status'] = requiresProfessionalClearance
    ? 'professional_clearance_required'
    : movementLimitations.length > 0
      ? 'modified'
      : 'cleared'

  const payload: ProfileUpdate = {
    full_name:                 answers.full_name.trim() || null,
    primary_goal:              answers.goal as ProfileUpdate['primary_goal'],
    fitness_level:             answers.fitness_level as ProfileUpdate['fitness_level'],
    days_per_week:             answers.days_per_week,
    session_duration_minutes:  answers.session_duration,
    gym_type:                  answers.gym_type as ProfileUpdate['gym_type'],
    available_equipment:       answers.equipment,
    injuries:                  answers.injuries.trim() || null,
    cardio_preferences:       answers.cardio_preferences,
    activity_level:           answers.activity_level ?? 'insufficiently_active',
    readiness_status:         readinessStatus,
    readiness_answers: {
      currentlyActive: answers.activity_level === 'regularly_active',
      warningSymptoms: answers.warning_symptoms,
      knownCardiovascularMetabolicOrRenalDisease: answers.known_disease,
      medicallyCleared: answers.medically_cleared,
      recentSurgery: answers.recent_surgery,
    },
    movement_limitations:     movementLimitations,
    readiness_version:        'fitai-2026.1',
    readiness_completed_at:   new Date().toISOString(),
    height_cm:                 answers.height_cm ? parseFloat(answers.height_cm) : null,
    weight_kg:                 answers.weight_kg ? parseFloat(answers.weight_kg) : null,
    date_of_birth,
    gender:                    answers.gender as ProfileUpdate['gender'],
    onboarding_done:           true,
    last_check_in_at:          new Date().toISOString(),
  }

  // cast needed: supabase-js v2 generic inference issue with hand-crafted DB types
  const { error } = await supabase
    .from('profiles')
    .update(payload as never)
    .eq('id', user.id)

  if (error) throw new Error(error.message)
}

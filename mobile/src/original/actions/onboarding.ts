import type { OnboardingAnswers } from '@/app/onboarding/types'
import { dateOfBirthFromAge } from '@/lib/profile/age'
import { mutate, profile } from './state'
import { applyReadiness } from './readiness'
import { parseTrainingSettingsForm } from '@/lib/profile/trainingPreferences'
export async function saveOnboardingAnswers(answers: OnboardingAnswers): Promise<void> {
  const form = new FormData()
  const entries = { fitnessLevel: answers.fitness_level, primaryGoal: answers.goal, daysPerWeek: answers.days_per_week, sessionDurationMinutes: answers.session_duration, gymType: answers.gym_type, injuries: answers.injuries }
  Object.entries(entries).forEach(([key, value]) => { if (value != null) form.set(key, String(value)) })
  answers.equipment.forEach(value => form.append('availableEquipment', value))
  for (let day = 1; day <= (answers.days_per_week ?? 0); day++) form.append('preferredWorkoutDays', String(day))
  const parsed = parseTrainingSettingsForm(form)
  if (!parsed.ok) throw new Error(parsed.formError ?? Object.values(parsed.fieldErrors)[0] ?? 'Completa tus preferencias de entrenamiento.')
  const dateOfBirth = dateOfBirthFromAge(answers.age)
  const height = answers.height_cm ? Number(answers.height_cm) : null; const weight = answers.weight_kg ? Number(answers.weight_kg) : null
  if ((height !== null && (!Number.isFinite(height) || height < 80 || height > 250)) || (weight !== null && (!Number.isFinite(weight) || weight < 20 || weight > 400))) throw new Error('Revisa tu altura y peso.')
  await mutate(state => {
    const row = profile(state)
    applyReadiness(row, { activityLevel: answers.activity_level ?? 'insufficiently_active', cardioPreferences: answers.cardio_preferences, warningSymptoms: answers.warning_symptoms, knownDisease: answers.known_disease, recentSurgery: answers.recent_surgery, medicallyCleared: answers.medically_cleared, limitations: answers.limitation_regions.map(region => ({ region, side: null, status: answers.limitation_status ?? 'stable', movementsToAvoid: answers.movements_to_avoid.split(',').map(value => value.trim()).filter(Boolean), clinicianCleared: answers.clinician_cleared })) })
    Object.assign(row, { full_name: answers.full_name.trim() || null, primary_goal: parsed.value.primaryGoal, fitness_level: parsed.value.fitnessLevel, days_per_week: parsed.value.daysPerWeek, session_duration_minutes: parsed.value.sessionDurationMinutes, gym_type: parsed.value.gymType, available_equipment: parsed.value.availableEquipment, injuries: parsed.value.injuries, height_cm: height, weight_kg: weight, date_of_birth: dateOfBirth, gender: answers.gender, onboarding_done: true, last_check_in_at: new Date().toISOString() })
  })
}

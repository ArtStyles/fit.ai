import { notFound } from 'next/navigation'
import { Dumbbell } from 'lucide-react'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { ProgramTemplateEditor } from '@/components/coaching/ProgramTemplateEditor'
import { AssignProgramDialog } from '@/components/coaching/AssignProgramDialog'
import { requireActiveTrainerContext } from '@/lib/coaching/access'
import type { PlanExerciseOption } from '@/components/plan/WorkoutExerciseList'

export const metadata = { title: 'Editar rutina profesional · Vekira' }

export default async function CoachProgramDetailPage({ params }: { params: { templateId: string } }) {
  const { user, supabase } = await requireActiveTrainerContext()
  const templates = supabase.from('trainer_program_templates') as any
  const { data: template, error } = await templates.select('id, name, goal, description, days_per_week, status').eq('id', params.templateId).eq('trainer_user_id', user.id).maybeSingle()
  if (error) throw new Error('No se pudo cargar la rutina.')
  if (!template) notFound()
  const [workoutResponse, exerciseResponse, relationshipResponse] = await Promise.all([
    (supabase.from('trainer_template_workouts') as any).select('id, name, day_of_week, order_in_plan, trainer_template_exercises(id, exercise_id, order_index, sets, reps, weight_kg, target_rpe, rest_seconds, notes, exercises(name))').eq('template_id', template.id).order('order_in_plan'),
    (supabase.from('exercises') as any).select('id, name, muscle_groups, equipment, difficulty, exercise_type, is_compound').eq('is_public', true).order('name').limit(200),
    (supabase.from('coaching_relationships') as any).select('id').eq('trainer_user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }),
  ])
  if (workoutResponse.error || exerciseResponse.error || relationshipResponse.error) throw new Error('No se pudo cargar el editor de la rutina.')
  const workouts = (workoutResponse.data ?? []).map((workout: any) => ({ ...workout, exercises: (workout.trainer_template_exercises ?? []).sort((a: any, b: any) => a.order_index - b.order_index).map((item: any) => ({ ...item, exercise: Array.isArray(item.exercises) ? item.exercises[0] ?? null : item.exercises ?? null })) }))
  return <div className="min-h-screen bg-background pb-28"><PageTopBar title="Editar rutina" subtitle="Plantilla profesional" backHref="/coach/programs" backLabel="Rutinas" icon={<Dumbbell className="h-5 w-5" />} /><main className="mx-auto max-w-4xl space-y-6 px-4 py-8"><ProgramTemplateEditor template={template} workouts={workouts} options={(exerciseResponse.data ?? []) as PlanExerciseOption[]} /><AssignProgramDialog templateId={template.id} relationships={(relationshipResponse.data ?? []) as Array<{ id: string }>} /></main></div>
}

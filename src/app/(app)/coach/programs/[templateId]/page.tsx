import { notFound } from 'next/navigation'
import { Dumbbell } from 'lucide-react'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { ProgramTemplateEditor } from '@/components/coaching/ProgramTemplateEditor'
import { requireActiveTrainerContext } from '@/lib/coaching/access'
import type { PlanExerciseOption } from '@/components/plan/WorkoutExerciseList'
import { resolveUserTimeZone } from '@/lib/workouts/schedule'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const metadata = { title: 'Editar rutina profesional · Vekira' }

export default async function CoachProgramDetailPage({ params, searchParams }: { params: { templateId: string }; searchParams?: { clientId?: string | string[] } }) {
  const { user, profile, supabase } = await requireActiveTrainerContext()
  const timeZone = resolveUserTimeZone(profile.timezone)
  const templates = supabase.from('trainer_program_templates') as any
  const { data: template, error } = await templates.select('id, name, goal, description, days_per_week, status').eq('id', params.templateId).eq('trainer_user_id', user.id).maybeSingle()
  if (error) throw new Error('No se pudo cargar la rutina.')
  if (!template) notFound()
  const [workoutResponse, exerciseResponse, relationshipResponse] = await Promise.all([
    (supabase.from('trainer_template_workouts') as any).select('id, name, day_of_week, order_in_plan, trainer_template_exercises(id, exercise_id, order_index, sets, reps, weight_kg, target_rpe, rest_seconds, notes, exercises(name, muscle_groups, equipment, image_url))').eq('template_id', template.id).order('order_in_plan'),
    (supabase.from('exercises') as any).select('id, name, image_url, muscle_groups, equipment, difficulty, exercise_type, is_compound').eq('is_public', true).order('name').limit(200),
    (supabase.from('coaching_relationships') as any).select('id, client_user_id, started_at, trainer_service_offerings(name)').eq('trainer_user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).order('id', { ascending: false }),
  ])
  if (workoutResponse.error || exerciseResponse.error || relationshipResponse.error) throw new Error('No se pudo cargar el editor de la rutina.')
  const workouts = (workoutResponse.data ?? []).map((workout: any) => ({ ...workout, exercises: (workout.trainer_template_exercises ?? []).sort((a: any, b: any) => a.order_index - b.order_index).map((item: any) => ({ ...item, exercise: Array.isArray(item.exercises) ? item.exercises[0] ?? null : item.exercises ?? null })) }))
  const relationshipRows = relationshipResponse.data ?? []
  const relationshipIds = relationshipRows.map((relationship: any) => relationship.id)
  const assignmentResponse = relationshipIds.length
    ? await (supabase.from('trainer_plan_assignments') as any)
      .select('id, relationship_id, client_user_id, source_template_id, status, created_at')
      .eq('trainer_user_id', user.id)
      .in('relationship_id', relationshipIds)
      .in('status', ['proposed', 'active'])
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
    : { data: [], error: null }
  if (assignmentResponse.error) throw new Error('No se pudo cargar el editor de la rutina.')
  const assignmentRows = assignmentResponse.data ?? []
  const assignmentClientIds = assignmentRows.map((assignment: any) => assignment.client_user_id)
  const clientIds = Array.from(new Set([...relationshipRows.map((relationship: any) => relationship.client_user_id), ...assignmentClientIds].filter(Boolean)))
  const { data: profileRows, error: profilesError } = clientIds.length
    ? await (supabase.from('public_profiles') as any).select('id, username, full_name, avatar_url').in('id', clientIds)
    : { data: [], error: null }
  if (profilesError) throw new Error('No se pudo cargar el editor de la rutina.')
  const profilesById = new Map((profileRows ?? []).map((profile: any) => [profile.id, profile]))
  const identity = (clientId: string) => {
    const profile = profilesById.get(clientId) as any
    return { clientName: profile?.full_name?.trim() || profile?.username?.trim() || 'Cliente', clientAvatarUrl: profile?.avatar_url || null }
  }
  const blockingAssignmentByRelationship = new Map<string, any>()
  for (const assignment of assignmentRows) {
    if (!blockingAssignmentByRelationship.has(assignment.relationship_id)) {
      blockingAssignmentByRelationship.set(assignment.relationship_id, assignment)
    }
  }
  const relationshipsById = new Map(relationshipRows.map((relationship: any) => [relationship.id, relationship]))
  const relationshipChoices = relationshipRows.map((relationship: any) => {
    const service = Array.isArray(relationship.trainer_service_offerings) ? relationship.trainer_service_offerings[0] : relationship.trainer_service_offerings
    const startedAt = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeZone }).format(new Date(relationship.started_at))
    const blockingAssignment = blockingAssignmentByRelationship.get(relationship.id)
    const isProposed = blockingAssignment?.status === 'proposed'
    const isActive = blockingAssignment?.status === 'active'
    const state = isProposed ? 'Propuesta pendiente' : isActive ? 'Rutina activa' : 'Listo para recibir rutina'
    const blockingReason = isProposed
      ? 'El cliente ya tiene una propuesta pendiente de revisión.'
      : isActive
        ? 'El cliente ya tiene una rutina profesional activa.'
        : undefined
    return {
      id: relationship.id,
      clientUserId: relationship.client_user_id,
      ...identity(relationship.client_user_id),
      serviceName: service?.name ?? 'Acompañamiento',
      startedAt,
      state,
      canReceiveProposal: !blockingAssignment,
      ...(blockingReason ? { blockingReason } : {}),
      label: `${service?.name ?? 'Acompañamiento'} · iniciado ${startedAt} · ref. ${relationship.id.slice(0, 8)}`,
    }
  })
  const revisionChoices = assignmentRows.filter((assignment: any) => assignment.status === 'active' && assignment.source_template_id === template.id).map((assignment: any) => {
    const relationship = relationshipsById.get(assignment.relationship_id) as any
    const service = Array.isArray(relationship?.trainer_service_offerings) ? relationship.trainer_service_offerings[0] : relationship?.trainer_service_offerings
    const startedAt = relationship?.started_at ? new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeZone }).format(new Date(relationship.started_at)) : undefined
    return { id: assignment.id, ...identity(assignment.client_user_id), serviceName: service?.name ?? 'Acompañamiento', startedAt, state: 'Rutina activa', label: `${service?.name ?? 'Acompañamiento'} · rutina activa` }
  })
  const requestedClientId = Array.isArray(searchParams?.clientId) ? searchParams.clientId[0] : searchParams?.clientId
  const selectedRelationshipId = requestedClientId && UUID.test(requestedClientId)
    ? relationshipRows.find((relationship: any) => relationship.client_user_id === requestedClientId)?.id
    : undefined
  return <div className="min-h-screen bg-background pb-28"><PageTopBar title="Editar rutina" subtitle="Plantilla profesional" backHref="/coach/programs" backLabel="Rutinas" icon={<Dumbbell className="h-5 w-5" />} /><main className="mx-auto max-w-6xl space-y-6 px-4 py-8"><ProgramTemplateEditor template={template} workouts={workouts} options={(exerciseResponse.data ?? []) as PlanExerciseOption[]} relationships={relationshipChoices} assignments={revisionChoices} selectedRelationshipId={selectedRelationshipId} /></main></div>
}

import 'server-only'

import { redirect } from 'next/navigation'
import { requireAppUserContext } from '@/lib/auth/server'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>
export type TrainerProfile = Database['public']['Tables']['trainer_profiles']['Row']

export type TrainerAccess =
  | { granted: true; profile: TrainerProfile }
  | { granted: false; reason: 'missing_profile' | 'suspended' | 'inactive' }

const TRAINER_PROFILE_COLUMNS = [
  'id',
  'user_id',
  'source_application_id',
  'slug',
  'status',
  'professional_name',
  'professional_photo_url',
  'bio',
  'specialties',
  'modalities',
  'experience_summary',
  'general_location',
  'languages',
  'verified_at',
  'created_at',
  'updated_at',
].join(', ')

export async function getTrainerAccess(
  userId: string,
  client?: SupabaseServerClient,
): Promise<TrainerAccess> {
  const supabase = client ?? await createClient()
  const profiles = supabase.from('trainer_profiles') as any
  const { data: rawData, error } = await profiles
    .select(TRAINER_PROFILE_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error('No se pudo verificar el acceso profesional.')
  const data = rawData as TrainerProfile | null
  if (!data) return { granted: false, reason: 'missing_profile' }
  if (data.status !== 'active') return { granted: false, reason: data.status }

  return { granted: true, profile: data }
}

export async function requireActiveTrainerContext() {
  const context = await requireAppUserContext()
  const access = await getTrainerAccess(context.user.id, context.supabase)

  if (!access.granted) redirect('/coach/apply')

  return {
    ...context,
    trainerProfile: access.profile,
  }
}

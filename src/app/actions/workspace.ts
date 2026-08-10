'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireAppUserContext } from '@/lib/auth/server'
import { getTrainerAccess } from '@/lib/coaching/access'
import { normalizeWorkspace, WORKSPACE_COOKIE } from '@/lib/coaching/workspace'

export async function setWorkspace(formData: FormData): Promise<never> {
  const context = await requireAppUserContext()
  const requestedWorkspace = formData.get('workspace')
  const access = await getTrainerAccess(context.user.id, context.supabase)
  const workspace = normalizeWorkspace(
    typeof requestedWorkspace === 'string' ? requestedWorkspace : undefined,
    access.granted,
  )

  cookies().set(WORKSPACE_COOKIE, workspace, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  revalidatePath('/', 'layout')
  redirect(workspace === 'coach' ? '/coach' : '/dashboard')
}

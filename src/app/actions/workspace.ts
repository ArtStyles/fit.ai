'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { requireAppUserContext } from '@/lib/auth/server'
import { getTrainerAccess } from '@/lib/coaching/access'
import {
  WORKSPACE_COOKIE,
  workspaceDestination,
  type Workspace,
  type WorkspaceChangeResult,
} from '@/lib/coaching/workspace'

export async function setWorkspace(formData: FormData): Promise<WorkspaceChangeResult> {
  const { user, supabase } = await requireAppUserContext()
  const value = formData.get('workspace')
  if (value !== 'personal' && value !== 'coach') {
    return {
      ok: false,
      code: 'invalid_workspace',
      error: 'El espacio solicitado no es válido.',
    }
  }

  const workspace: Workspace = value
  try {
    const access = await getTrainerAccess(user.id, supabase)
    if (workspace === 'coach' && !access.granted) {
      return {
        ok: false,
        code: 'coach_unavailable',
        error: 'El espacio de entrenador ya no está disponible.',
      }
    }

    revalidatePath('/', 'layout')
    cookies().set(WORKSPACE_COOKIE, workspace, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
    return { ok: true, workspace, destination: workspaceDestination(workspace) }
  } catch {
    return {
      ok: false,
      code: 'unexpected',
      error: 'No se pudo cambiar de espacio. Inténtalo nuevamente.',
    }
  }
}

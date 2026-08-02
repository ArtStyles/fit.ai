// src/app/actions/posts.ts
'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildSessionSnapshot, buildRoutineSnapshot } from '@/lib/social/snapshots'
import type { RoutineSnapshot, RoutineSnapshotExercise, SessionSnapshot } from '@/lib/social/snapshots'
import { postStoragePath } from '@/lib/images/post'

const BUCKET = 'posts'

export type ActionResult<T = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

export interface CreatePostInput {
  body?: string | null
  photoCount?: number               // nº de fotos en el FormData (file0..fileN)
  routineSnapshot?: RoutineSnapshot | null
}

// Crea un post con texto + fotos + (opcional) snapshot de rutina ya construido en cliente.
export async function createPost(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const body = (String(formData.get('body') ?? '').trim()) || null
  const routineRaw = formData.get('routineSnapshot')
  const routineSnapshot: RoutineSnapshot | null =
    typeof routineRaw === 'string' && routineRaw ? JSON.parse(routineRaw) : null

  const files = formData.getAll('file').filter((f): f is File => f instanceof File)

  if (!body && files.length === 0 && !routineSnapshot) {
    return { ok: false, error: 'La publicación está vacía.' }
  }

  const service = createServiceClient()
  const postId = randomUUID()

  // Subir fotos (ya reescaladas en cliente a webp).
  const photo_urls: string[] = []
  for (let i = 0; i < files.length; i++) {
    const path = postStoragePath(user.id, postId, i)
    const { error } = await service.storage
      .from(BUCKET)
      .upload(path, files[i], { contentType: files[i].type, upsert: true, cacheControl: '3600' })
    if (error) return { ok: false, error: 'No se pudo subir una imagen.' }
    photo_urls.push(service.storage.from(BUCKET).getPublicUrl(path).data.publicUrl)
  }

  const { error: insErr } = await (service.from('posts') as any).insert({
    id: postId,
    user_id: user.id,
    body,
    photo_urls,
    routine_snapshot: routineSnapshot,
  })
  if (insErr) return { ok: false, error: 'No se pudo crear la publicación.' }

  revalidatePath('/feed')
  return { ok: true, id: postId }
}

// Comparte una sesión completada propia: construye el session_snapshot desde sus logs.
export async function createPostFromSession(
  progressLogId: string,
  body?: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  // Log propio + nombre del workout.
  const { data: log } = await (supabase.from('progress_logs') as any)
    .select('id, completed_at, duration_minutes, workout_id, user_id')
    .eq('id', progressLogId)
    .eq('user_id', user.id)
    .maybeSingle() as { data: { id: string; completed_at: string; duration_minutes: number | null; workout_id: string | null } | null }
  if (!log) return { ok: false, error: 'Sesión no encontrada.' }

  let workoutName = 'Entrenamiento'
  if (log.workout_id) {
    const { data: w } = await (supabase.from('workouts') as any)
      .select('name').eq('id', log.workout_id).maybeSingle() as { data: { name: string } | null }
    if (w?.name) workoutName = w.name
  }

  const { data: exLogs } = await (supabase.from('exercise_logs') as any)
    .select('exercise_id, reps_completed, weights_kg')
    .eq('progress_log_id', progressLogId) as {
      data: { exercise_id: string; reps_completed: number[] | null; weights_kg: number[] | null }[] | null
    }

  const ids = Array.from(new Set((exLogs ?? []).map(e => e.exercise_id)))
  const names = new Map<string, string>()
  if (ids.length) {
    const { data: exs } = await (supabase.from('exercises') as any)
      .select('id, name').in('id', ids) as { data: { id: string; name: string }[] | null }
    for (const e of exs ?? []) names.set(e.id, e.name)
  }

  const snapshot: SessionSnapshot = buildSessionSnapshot(log, workoutName, exLogs ?? [], names)

  const service = createServiceClient()
  const postId = randomUUID()
  const { error } = await (service.from('posts') as any).insert({
    id: postId,
    user_id: user.id,
    body: (body?.trim()) || null,
    session_snapshot: snapshot,
  })
  if (error) return { ok: false, error: 'No se pudo compartir la sesión.' }

  revalidatePath('/feed')
  return { ok: true, id: postId }
}

// Comparte una rutina/plan propio: construye el routine_snapshot desde el plan del usuario.
export async function createPostFromPlan(
  planId: string,
  body?: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const { data: plan } = await (supabase.from('workout_plans') as any)
    .select('id, name, goal, days_per_week, difficulty')
    .eq('id', planId)
    .eq('user_id', user.id)
    .maybeSingle() as {
      data: { id: string; name: string; goal: string | null; days_per_week: number | null; difficulty: string | null } | null
    }
  if (!plan) return { ok: false, error: 'Rutina no encontrada.' }

  const { data: workouts } = await (supabase.from('workouts') as any)
    .select('id, name, day_of_week, order_in_plan')
    .eq('plan_id', planId)
    .eq('user_id', user.id) as {
      data: { id: string; name: string; day_of_week: number | null; order_in_plan: number | null }[] | null
    }
  const wks = workouts ?? []

  const exercisesByWorkout = new Map<string, RoutineSnapshotExercise[]>()
  if (wks.length) {
    const { data: wexs } = await (supabase.from('workout_exercises') as any)
      .select('workout_id, exercise_id, order_index, sets, reps, rest_seconds, weight_kg')
      .in('workout_id', wks.map(w => w.id)) as {
        data: {
          workout_id: string; exercise_id: string; order_index: number
          sets: number | null; reps: number | null; rest_seconds: number | null; weight_kg: number | null
        }[] | null
      }
    const rows = wexs ?? []
    const exIds = Array.from(new Set(rows.map(r => r.exercise_id)))
    const names = new Map<string, string>()
    if (exIds.length) {
      const { data: exs } = await (supabase.from('exercises') as any)
        .select('id, name').in('id', exIds) as { data: { id: string; name: string }[] | null }
      for (const e of exs ?? []) names.set(e.id, e.name)
    }
    for (const r of rows) {
      const list = exercisesByWorkout.get(r.workout_id) ?? []
      list.push({
        exercise_id: r.exercise_id,
        name: names.get(r.exercise_id) ?? 'Ejercicio',
        order_index: r.order_index,
        sets: r.sets, reps: r.reps, rest_seconds: r.rest_seconds, weight_kg: r.weight_kg,
      })
      exercisesByWorkout.set(r.workout_id, list)
    }
  }

  const snapshot = buildRoutineSnapshot(plan, wks, exercisesByWorkout)

  const service = createServiceClient()
  const postId = randomUUID()
  const { error } = await (service.from('posts') as any).insert({
    id: postId,
    user_id: user.id,
    body: (body?.trim()) || null,
    routine_snapshot: snapshot,
  })
  if (error) return { ok: false, error: 'No se pudo compartir la rutina.' }

  revalidatePath('/feed')
  return { ok: true, id: postId }
}

export async function deletePost(postId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  // RLS garantiza que solo borra los propios; igualmente filtramos por user_id.
  const { error } = await (supabase.from('posts') as any)
    .delete().eq('id', postId).eq('user_id', user.id)
  if (error) return { ok: false, error: 'No se pudo eliminar.' }

  // Limpieza best-effort de las fotos del post.
  const service = createServiceClient()
  const { data: files } = await service.storage.from(BUCKET).list(`${user.id}/${postId}`)
  if (files?.length) {
    await service.storage.from(BUCKET).remove(files.map(f => `${user.id}/${postId}/${f.name}`))
  }

  revalidatePath('/feed')
  return { ok: true }
}

// Clona la rutina de un post a las tablas del usuario actual.
export async function clonePlanFromPost(postId: string): Promise<ActionResult<{ planId: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesion no valida.' }

  const { data: planId, error } = await (supabase.rpc as any)('clone_plan_from_post_atomic', {
    p_post_id: postId,
  })

  if (error || !planId) {
    if (error?.message?.includes('PLAN_FAMILY_LIMIT')) {
      return {
        ok: false,
        error: 'Tu cuenta free permite guardar hasta dos planes. Archiva uno de tus planes o actualiza a Pro.',
      }
    }
    if (error?.message?.includes('POST_ROUTINE_NOT_FOUND_OR_UNAVAILABLE')) {
      return { ok: false, error: 'Esta publicacion no tiene una rutina disponible.' }
    }
    return { ok: false, error: 'No se pudo clonar la rutina.' }
  }

  revalidatePath('/plan')
  return { ok: true, planId }
}

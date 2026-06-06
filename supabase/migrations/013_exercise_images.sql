-- 013_exercise_images.sql
-- Bucket público para imágenes de ejercicios + image_url en el payload de la ficha.

-- 1. Bucket público
insert into storage.buckets (id, name, public)
values ('exercise-images', 'exercise-images', true)
on conflict (id) do nothing;

-- 2. Añadir image_url al payload de detalle de ejercicio
create or replace function public.get_exercise_detail_payload(
  p_exercise_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with target_exercise as (
  select
    e.id,
    e.name,
    e.description,
    e.muscle_groups,
    e.equipment,
    e.difficulty,
    e.exercise_type,
    e.is_compound,
    e.instructions,
    e.video_url,
    e.image_url
  from exercises e
  where e.id = p_exercise_id
    and e.is_public = true
  limit 1
),
exercise_rows as (
  select
    el.id,
    el.progress_log_id,
    el.sets_completed,
    el.reps_completed,
    el.weights_kg,
    el.rpe_values,
    el.notes,
    jsonb_build_object(
      'id', pl.id,
      'workout_id', pl.workout_id,
      'completed_at', pl.completed_at,
      'duration_minutes', pl.duration_minutes,
      'mood_rating', pl.mood_rating
    ) as progress_log,
    pl.completed_at as progress_completed_at
  from exercise_logs el
  join progress_logs pl on pl.id = el.progress_log_id
  where el.exercise_id = p_exercise_id
    and pl.user_id = auth.uid()
  order by pl.completed_at desc
),
workout_rows as (
  select distinct
    w.id,
    w.name,
    w.focus
  from exercise_logs el
  join progress_logs pl on pl.id = el.progress_log_id
  join workouts w
    on w.id = pl.workout_id
   and w.user_id = auth.uid()
  where el.exercise_id = p_exercise_id
    and pl.user_id = auth.uid()
    and pl.workout_id is not null
)
select jsonb_build_object(
  'exercise', (
    select to_jsonb(te)
    from target_exercise te
  ),
  'logs', coalesce((
    select jsonb_agg((to_jsonb(er) - 'progress_completed_at') order by er.progress_completed_at desc)
    from exercise_rows er
  ), '[]'::jsonb),
  'workouts', coalesce((
    select jsonb_agg(to_jsonb(wr) order by wr.name)
    from workout_rows wr
  ), '[]'::jsonb)
);
$$;

grant execute on function public.get_exercise_detail_payload(uuid)
  to authenticated;

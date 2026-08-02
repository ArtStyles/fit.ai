-- Preserve the immutable workout/plan/exercise context that existed when a
-- session was completed. The live workout relation remains an optional source
-- reference and is intentionally not rewritten here.

ALTER TABLE public.progress_logs
  ADD COLUMN session_context_snapshot JSONB;

ALTER TABLE public.workout_plans
  ADD COLUMN family_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN superseded_at TIMESTAMPTZ,
  ADD COLUMN retired_at TIMESTAMPTZ,
  ADD COLUMN generation_request_id UUID;

CREATE UNIQUE INDEX workout_plans_user_generation_request_unique
  ON public.workout_plans(user_id, generation_request_id)
  WHERE generation_request_id IS NOT NULL;

CREATE INDEX workout_plans_user_lifecycle_created_idx
  ON public.workout_plans(user_id, retired_at, superseded_at, created_at DESC);

CREATE INDEX workout_plans_user_family_idx
  ON public.workout_plans(user_id, family_id);

-- Backfill only sessions whose source workout still exists. Detached sessions
-- deliberately remain NULL because their immutable context cannot be inferred.
UPDATE public.progress_logs AS progress_log
SET session_context_snapshot = jsonb_build_object(
  'version', 1,
  'workout', jsonb_build_object(
    'id', workout.id,
    'name', workout.name,
    'focus', workout.focus,
    'dayOfWeek', workout.day_of_week
  ),
  'plan', CASE
    WHEN plan.id IS NULL THEN 'null'::jsonb
    ELSE jsonb_build_object(
      'id', plan.id,
      'familyId', plan.family_id,
      'name', plan.name,
      'weekNumber', plan.week_number
    )
  END,
  'exercises', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'exerciseId', exercise.id,
        'name', exercise.name,
        'nameEs', exercise.name_es,
        'muscleGroups', exercise.muscle_groups,
        'muscleGroupsEs', COALESCE(exercise.muscle_groups_es, ARRAY[]::TEXT[]),
        'isCompound', exercise.is_compound
      )
      ORDER BY workout_exercise.order_index
    )
    FROM public.workout_exercises AS workout_exercise
    JOIN public.exercises AS exercise ON exercise.id = workout_exercise.exercise_id
    WHERE workout_exercise.workout_id = workout.id
  ), '[]'::jsonb)
)
FROM public.workouts AS workout
LEFT JOIN public.workout_plans AS plan ON plan.id = workout.plan_id
WHERE progress_log.workout_id = workout.id
  AND progress_log.session_context_snapshot IS NULL;

-- Complete personal-workout permutations share one authorization, locking and
-- transaction boundary. No caller-supplied owner or prescription bypass flag.
CREATE OR REPLACE FUNCTION public.reorder_workout_exercises_atomic(
  p_plan_id UUID,
  p_workout_id UUID,
  p_ordered_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'WORKOUT_REORDER_NOT_AUTHENTICATED';
  END IF;

  -- Same parent lock boundary as apply_workout_adjustment_atomic. Concurrent
  -- permutations wait here before validating membership against fresh rows.
  PERFORM 1
  FROM public.workouts AS workout
  JOIN public.workout_plans AS plan ON plan.id = workout.plan_id
  WHERE workout.id = p_workout_id AND plan.id = p_plan_id
    AND workout.user_id = v_user_id AND plan.user_id = v_user_id
    AND plan.prescription_locked = FALSE AND plan.library_slot = 'personal'
  FOR UPDATE OF workout, plan;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKOUT_REORDER_NOT_EDITABLE';
  END IF;

  PERFORM 1 FROM public.workout_exercises
  WHERE workout_id = p_workout_id ORDER BY id FOR UPDATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF p_ordered_ids IS NULL
    OR (cardinality(p_ordered_ids) > 0 AND array_ndims(p_ordered_ids) IS DISTINCT FROM 1)
    OR cardinality(p_ordered_ids) <> v_count
    OR (SELECT count(DISTINCT id) FROM unnest(p_ordered_ids) AS ids(id)) <> v_count
    OR EXISTS (
      SELECT 1 FROM unnest(p_ordered_ids) AS ids(id)
      WHERE id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.workout_exercises AS exercise
        WHERE exercise.id = ids.id AND exercise.workout_id = p_workout_id
      )
    ) THEN
    RAISE EXCEPTION 'WORKOUT_REORDER_INVALID_PERMUTATION';
  END IF;

  UPDATE public.workout_exercises AS exercise
  SET order_index = ordered.position::integer
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS ordered(id, position)
  WHERE exercise.id = ordered.id AND exercise.workout_id = p_workout_id;

  UPDATE public.workout_plans
  SET plan_context = 'manual_update', manually_updated_at = now()
  WHERE id = p_plan_id AND user_id = v_user_id;
  RETURN v_count;
END;
$$;

ALTER FUNCTION public.reorder_workout_exercises_atomic(UUID, UUID, UUID[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reorder_workout_exercises_atomic(UUID, UUID, UUID[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reorder_workout_exercises_atomic(UUID, UUID, UUID[]) TO authenticated;

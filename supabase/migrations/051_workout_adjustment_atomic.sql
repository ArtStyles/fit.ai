-- Apply normalized workout adjustments as one authorization and transaction
-- boundary. The actor and parent plan are always derived from persisted rows.

CREATE OR REPLACE FUNCTION public.apply_workout_adjustment_atomic(
  p_workout_id UUID,
  p_changes JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_plan_id UUID;
  v_change JSONB;
  v_change_type TEXT;
  v_row_id UUID;
  v_seen_ids UUID[] := ARRAY[]::UUID[];
  v_removal_count INTEGER := 0;
  v_exercise_count INTEGER;
  v_numeric NUMERIC;
  v_applied_count INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_NOT_AUTHENTICATED';
  END IF;

  SELECT workout.plan_id
  INTO v_plan_id
  FROM public.workouts AS workout
  JOIN public.workout_plans AS plan ON plan.id = workout.plan_id
  WHERE workout.id = p_workout_id
    AND workout.user_id = v_user_id
    AND plan.user_id = v_user_id
    AND plan.is_active = TRUE
    AND plan.prescription_locked = FALSE
  FOR UPDATE OF workout, plan;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_NOT_EDITABLE';
  END IF;

  IF p_changes IS NULL
    OR jsonb_typeof(p_changes) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_changes) < 1
    OR jsonb_array_length(p_changes) > 30 THEN
    RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_PAYLOAD';
  END IF;

  PERFORM 1
  FROM public.workout_exercises AS exercise
  WHERE exercise.workout_id = p_workout_id
  FOR UPDATE;
  GET DIAGNOSTICS v_exercise_count = ROW_COUNT;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_changes)
  LOOP
    IF jsonb_typeof(v_change) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_change -> 'workoutExerciseId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_change -> 'type') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_PAYLOAD';
    END IF;

    BEGIN
      v_row_id := (v_change ->> 'workoutExerciseId')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_PAYLOAD';
    END;

    IF array_position(v_seen_ids, v_row_id) IS NOT NULL THEN
      RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_DUPLICATE_EXERCISE';
    END IF;
    v_seen_ids := array_append(v_seen_ids, v_row_id);

    PERFORM 1
    FROM public.workout_exercises AS exercise
    WHERE exercise.id = v_row_id
      AND exercise.workout_id = p_workout_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_UNKNOWN_EXERCISE';
    END IF;

    v_change_type := v_change ->> 'type';
    IF v_change_type = 'remove_exercise' THEN
      v_removal_count := v_removal_count + 1;
      CONTINUE;
    END IF;
    IF v_change_type <> 'update_exercise' THEN
      RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_OPERATION';
    END IF;
    IF NOT (v_change ?| ARRAY['sets', 'reps', 'targetRpe', 'restSeconds']) THEN
      RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_EMPTY_UPDATE';
    END IF;

    IF v_change ? 'sets' THEN
      IF jsonb_typeof(v_change -> 'sets') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_VALUE';
      END IF;
      v_numeric := (v_change ->> 'sets')::NUMERIC;
      IF v_numeric <> trunc(v_numeric) OR v_numeric NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_VALUE';
      END IF;
    END IF;
    IF v_change ? 'reps' THEN
      IF jsonb_typeof(v_change -> 'reps') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_VALUE';
      END IF;
      v_numeric := (v_change ->> 'reps')::NUMERIC;
      IF v_numeric <> trunc(v_numeric) OR v_numeric NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_VALUE';
      END IF;
    END IF;
    IF v_change ? 'targetRpe' THEN
      IF jsonb_typeof(v_change -> 'targetRpe') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_VALUE';
      END IF;
      v_numeric := (v_change ->> 'targetRpe')::NUMERIC;
      IF v_numeric <> trunc(v_numeric) OR v_numeric NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_VALUE';
      END IF;
    END IF;
    IF v_change ? 'restSeconds' THEN
      IF jsonb_typeof(v_change -> 'restSeconds') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_VALUE';
      END IF;
      v_numeric := (v_change ->> 'restSeconds')::NUMERIC;
      IF v_numeric <> trunc(v_numeric) OR v_numeric NOT BETWEEN 15 AND 600 THEN
        RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_VALUE';
      END IF;
    END IF;
  END LOOP;

  IF v_exercise_count - v_removal_count < 1 THEN
    RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_EMPTY_WORKOUT';
  END IF;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_changes)
  LOOP
    v_row_id := (v_change ->> 'workoutExerciseId')::UUID;
    IF v_change ->> 'type' = 'remove_exercise' THEN
      DELETE FROM public.workout_exercises
      WHERE id = v_row_id AND workout_id = p_workout_id;
    ELSE
      UPDATE public.workout_exercises
      SET
        sets = CASE WHEN v_change ? 'sets' THEN (v_change ->> 'sets')::INTEGER ELSE sets END,
        reps = CASE WHEN v_change ? 'reps' THEN (v_change ->> 'reps')::INTEGER ELSE reps END,
        target_rpe = CASE WHEN v_change ? 'targetRpe' THEN (v_change ->> 'targetRpe')::INTEGER ELSE target_rpe END,
        rest_seconds = CASE WHEN v_change ? 'restSeconds' THEN (v_change ->> 'restSeconds')::INTEGER ELSE rest_seconds END
      WHERE id = v_row_id AND workout_id = p_workout_id;
    END IF;
    v_applied_count := v_applied_count + 1;
  END LOOP;

  IF v_removal_count > 0 THEN
    WITH compact_order AS (
      SELECT id, row_number() OVER (ORDER BY order_index, id)::INTEGER AS next_order
      FROM public.workout_exercises
      WHERE workout_id = p_workout_id
    )
    UPDATE public.workout_exercises AS exercise
    SET order_index = compact_order.next_order
    FROM compact_order
    WHERE exercise.id = compact_order.id;
  END IF;

  UPDATE public.workout_plans
  SET plan_context = 'manual_update', manually_updated_at = NOW()
  WHERE id = v_plan_id AND user_id = v_user_id;

  RETURN v_applied_count;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_workout_adjustment_atomic(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_workout_adjustment_atomic(UUID, JSONB) TO authenticated, service_role;

COMMENT ON FUNCTION public.apply_workout_adjustment_atomic(UUID, JSONB) IS
  'Validates and applies workout exercise updates/removals, compacts order, and marks the active editable plan in one transaction.';

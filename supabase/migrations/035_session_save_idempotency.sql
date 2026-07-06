ALTER TABLE public.progress_logs
  ADD COLUMN client_session_id UUID,
  ADD COLUMN session_result_snapshot JSONB;

CREATE UNIQUE INDEX progress_logs_user_client_session_unique
  ON public.progress_logs (user_id, client_session_id)
  WHERE client_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.save_session_log_atomic(
  p_client_session_id UUID,
  p_workout_id UUID,
  p_completed_at TIMESTAMPTZ,
  p_duration_minutes INTEGER,
  p_mood_rating INTEGER,
  p_exercise_logs JSONB,
  p_result_snapshot JSONB
)
RETURNS TABLE(progress_log_id UUID, inserted BOOLEAN, result_snapshot JSONB)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_progress_log_id UUID;
  v_inserted BOOLEAN := FALSE;
  v_result_snapshot JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.progress_logs (
    user_id,
    workout_id,
    client_session_id,
    session_result_snapshot,
    completed_at,
    duration_minutes,
    mood_rating
  ) VALUES (
    v_user_id,
    p_workout_id,
    p_client_session_id,
    p_result_snapshot,
    p_completed_at,
    p_duration_minutes,
    p_mood_rating
  )
  ON CONFLICT (user_id, client_session_id)
    WHERE client_session_id IS NOT NULL
    DO NOTHING
  RETURNING id, session_result_snapshot
    INTO v_progress_log_id, v_result_snapshot;

  v_inserted := FOUND;

  IF NOT v_inserted THEN
    SELECT id, session_result_snapshot
      INTO v_progress_log_id, v_result_snapshot
      FROM public.progress_logs
     WHERE user_id = v_user_id
       AND client_session_id = p_client_session_id;
  END IF;

  IF v_inserted THEN
    INSERT INTO public.exercise_logs (
      progress_log_id,
      exercise_id,
      sets_completed,
      reps_completed,
      weights_kg,
      rpe_values,
      duration_seconds,
      notes
    )
    SELECT
      v_progress_log_id,
      item.exercise_id,
      item.sets_completed,
      item.reps_completed,
      item.weights_kg,
      item.rpe_values,
      item.duration_seconds,
      item.notes
    FROM jsonb_to_recordset(COALESCE(p_exercise_logs, '[]'::JSONB)) AS item(
      exercise_id UUID,
      sets_completed INTEGER,
      reps_completed INTEGER[],
      weights_kg NUMERIC[],
      rpe_values NUMERIC[],
      duration_seconds INTEGER,
      notes TEXT
    );
  END IF;

  RETURN QUERY SELECT v_progress_log_id, v_inserted, v_result_snapshot;
END;
$$;

REVOKE ALL ON FUNCTION public.save_session_log_atomic(UUID, UUID, TIMESTAMPTZ, INTEGER, INTEGER, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_session_log_atomic(UUID, UUID, TIMESTAMPTZ, INTEGER, INTEGER, JSONB, JSONB) TO authenticated;

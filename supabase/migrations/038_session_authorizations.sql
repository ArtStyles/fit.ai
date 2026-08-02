-- Durable, server-issued permission for a workout that was valid when its
-- client session started. Plan retirement/version switches never delete this
-- immutable context and never need to keep the source plan active afterward.

CREATE TABLE public.session_authorizations (
  client_session_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_id UUID NOT NULL REFERENCES public.workouts(id) ON DELETE RESTRICT,
  plan_id UUID NOT NULL REFERENCES public.workout_plans(id) ON DELETE RESTRICT,
  session_context_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  CONSTRAINT session_authorizations_expiry_check
    CHECK (expires_at = created_at + INTERVAL '12 hours'),
  CONSTRAINT session_authorizations_consumed_check
    CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX session_authorizations_user_expiry_idx
  ON public.session_authorizations(user_id, expires_at DESC);

ALTER TABLE public.session_authorizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_authorizations: own read"
  ON public.session_authorizations
  FOR SELECT
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.session_authorizations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.session_authorizations TO authenticated;

CREATE OR REPLACE FUNCTION public.authorize_session_start(
  p_client_session_id UUID,
  p_workout_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_created_at TIMESTAMPTZ := NOW();
  v_time_zone TEXT;
  v_today_start TIMESTAMPTZ;
  v_today_end TIMESTAMPTZ;
  v_window_start TIMESTAMPTZ;
  v_days_late INTEGER;
  v_workout public.workouts%ROWTYPE;
  v_plan public.workout_plans%ROWTYPE;
  v_existing public.session_authorizations%ROWTYPE;
  v_context JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_AUTHENTICATION_REQUIRED';
  END IF;

  IF p_client_session_id IS NULL OR p_workout_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_AUTHORIZATION_INVALID_ID';
  END IF;

  -- Uses the same per-user key as plan lifecycle RPCs. Either the workout is
  -- authorized against the current active plan, or the plan switch wins first.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));

  SELECT * INTO v_existing
  FROM public.session_authorizations
  WHERE client_session_id = p_client_session_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.user_id <> v_user_id OR v_existing.workout_id <> p_workout_id THEN
      RAISE EXCEPTION 'SESSION_AUTHORIZATION_MISMATCH';
    END IF;
    IF v_existing.consumed_at IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM public.progress_logs
        WHERE user_id = v_user_id
          AND workout_id = p_workout_id
          AND client_session_id = p_client_session_id
      ) THEN
        RETURN v_existing.session_context_snapshot;
      END IF;
      RAISE EXCEPTION 'SESSION_AUTHORIZATION_CONSUMED';
    END IF;
    IF v_existing.expires_at <= v_created_at THEN
      RAISE EXCEPTION 'SESSION_AUTHORIZATION_EXPIRED';
    END IF;
    RETURN v_existing.session_context_snapshot;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.progress_logs
    WHERE user_id = v_user_id
      AND client_session_id = p_client_session_id
  ) THEN
    RAISE EXCEPTION 'SESSION_ALREADY_SAVED';
  END IF;

  SELECT * INTO v_workout
  FROM public.workouts
  WHERE id = p_workout_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_WORKOUT_NOT_FOUND';
  END IF;

  IF v_workout.plan_id IS NULL OR v_workout.day_of_week IS NULL THEN
    RAISE EXCEPTION 'SESSION_WORKOUT_UNAVAILABLE';
  END IF;

  SELECT * INTO v_plan
  FROM public.workout_plans
  WHERE id = v_workout.plan_id
    AND user_id = v_user_id
    AND is_active = TRUE
    AND retired_at IS NULL
    AND superseded_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_PLAN_INACTIVE';
  END IF;

  SELECT CASE
    WHEN profile.timezone IS NOT NULL
      AND EXISTS (SELECT 1 FROM pg_timezone_names zone WHERE zone.name = profile.timezone)
      THEN profile.timezone
    ELSE 'America/Havana'
  END
  INTO v_time_zone
  FROM public.profiles AS profile
  WHERE profile.id = v_user_id;

  v_time_zone := COALESCE(v_time_zone, 'America/Havana');
  v_days_late := (
    EXTRACT(ISODOW FROM (v_created_at AT TIME ZONE v_time_zone))::INTEGER
    - v_workout.day_of_week + 7
  ) % 7;

  IF v_days_late > 2 THEN
    RAISE EXCEPTION 'SESSION_WORKOUT_UNAVAILABLE';
  END IF;

  v_today_start := date_trunc('day', v_created_at AT TIME ZONE v_time_zone)
    AT TIME ZONE v_time_zone;
  v_today_end := (date_trunc('day', v_created_at AT TIME ZONE v_time_zone) + INTERVAL '1 day')
    AT TIME ZONE v_time_zone;
  v_window_start := (
    date_trunc('day', v_created_at AT TIME ZONE v_time_zone)
    - make_interval(days => v_days_late)
  ) AT TIME ZONE v_time_zone;

  IF EXISTS (
    SELECT 1
    FROM public.progress_logs
    WHERE user_id = v_user_id
      AND workout_id = p_workout_id
      AND completed_at >= v_window_start
      AND completed_at < v_today_end
  ) THEN
    RAISE EXCEPTION 'SESSION_WORKOUT_ALREADY_COMPLETED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.progress_logs
    WHERE user_id = v_user_id
      AND workout_id IS NOT NULL
      AND completed_at >= v_today_start
      AND completed_at < v_today_end
  ) THEN
    RAISE EXCEPTION 'SESSION_DAILY_LIMIT_REACHED';
  END IF;

  v_context := jsonb_build_object(
    'version', 1,
    'workout', jsonb_build_object(
      'id', v_workout.id,
      'name', v_workout.name,
      'focus', v_workout.focus,
      'dayOfWeek', v_workout.day_of_week
    ),
    'plan', jsonb_build_object(
      'id', v_plan.id,
      'familyId', v_plan.family_id,
      'name', v_plan.name,
      'weekNumber', v_plan.week_number
    ),
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
      WHERE workout_exercise.workout_id = v_workout.id
    ), '[]'::JSONB)
  );

  INSERT INTO public.session_authorizations (
    client_session_id,
    user_id,
    workout_id,
    plan_id,
    session_context_snapshot,
    created_at,
    expires_at
  ) VALUES (
    p_client_session_id,
    v_user_id,
    p_workout_id,
    v_plan.id,
    v_context,
    v_created_at,
    v_created_at + INTERVAL '12 hours'
  );

  RETURN v_context;
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_session_start(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authorize_session_start(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_session_log_atomic_v2(
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
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_authorization public.session_authorizations%ROWTYPE;
  v_progress_log_id UUID;
  v_progress_workout_id UUID;
  v_inserted BOOLEAN := FALSE;
  v_result_snapshot JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_AUTHENTICATION_REQUIRED';
  END IF;

  SELECT * INTO v_authorization
  FROM public.session_authorizations
  WHERE client_session_id = p_client_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_AUTHORIZATION_REQUIRED';
  END IF;

  IF v_authorization.user_id <> v_user_id
    OR v_authorization.workout_id <> p_workout_id THEN
    RAISE EXCEPTION 'SESSION_AUTHORIZATION_MISMATCH';
  END IF;

  IF v_authorization.consumed_at IS NOT NULL THEN
    SELECT id, workout_id, session_result_snapshot
    INTO v_progress_log_id, v_progress_workout_id, v_result_snapshot
    FROM public.progress_logs
    WHERE user_id = v_user_id
      AND client_session_id = p_client_session_id;

    IF NOT FOUND OR v_progress_workout_id IS DISTINCT FROM p_workout_id THEN
      RAISE EXCEPTION 'SESSION_AUTHORIZATION_CONSUMED';
    END IF;

    RETURN QUERY SELECT v_progress_log_id, FALSE, v_result_snapshot;
    RETURN;
  END IF;

  IF v_authorization.expires_at <= NOW() THEN
    RAISE EXCEPTION 'SESSION_AUTHORIZATION_EXPIRED';
  END IF;

  INSERT INTO public.progress_logs (
    user_id,
    workout_id,
    client_session_id,
    session_result_snapshot,
    session_context_snapshot,
    completed_at,
    duration_minutes,
    mood_rating
  ) VALUES (
    v_user_id,
    p_workout_id,
    p_client_session_id,
    p_result_snapshot,
    v_authorization.session_context_snapshot,
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
    SELECT id, workout_id, session_result_snapshot
    INTO v_progress_log_id, v_progress_workout_id, v_result_snapshot
    FROM public.progress_logs
    WHERE user_id = v_user_id
      AND client_session_id = p_client_session_id;

    IF NOT FOUND OR v_progress_workout_id IS DISTINCT FROM p_workout_id THEN
      RAISE EXCEPTION 'SESSION_IDEMPOTENCY_MISMATCH';
    END IF;
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

  IF v_inserted THEN
    UPDATE public.session_authorizations
    SET consumed_at = NOW()
    WHERE client_session_id = p_client_session_id
      AND user_id = v_user_id
      AND consumed_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SESSION_AUTHORIZATION_CONSUME_FAILED';
    END IF;
  END IF;

  RETURN QUERY SELECT v_progress_log_id, v_inserted, v_result_snapshot;
END;
$$;

REVOKE ALL ON FUNCTION public.save_session_log_atomic_v2(UUID, UUID, TIMESTAMPTZ, INTEGER, INTEGER, JSONB, JSONB)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_session_log_atomic_v2(UUID, UUID, TIMESTAMPTZ, INTEGER, INTEGER, JSONB, JSONB)
  TO authenticated;

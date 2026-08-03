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

-- Migration 008 already linked regenerated versions through parent_plan_id.
-- Rebuild those legacy chains before any completed-session snapshot captures a
-- family identifier; otherwise the column default would create one family per
-- version and the free-family precheck in migration 037 could reject valid
-- accounts. A cross-account/missing parent is deliberately treated as a root.
WITH RECURSIVE legacy_plan_roots AS (
  SELECT
    plan.id AS plan_id,
    plan.user_id,
    plan.id AS root_plan_id,
    ARRAY[plan.id] AS visited_plan_ids
  FROM public.workout_plans AS plan
  WHERE plan.parent_plan_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.workout_plans AS parent
      WHERE parent.id = plan.parent_plan_id
        AND parent.user_id = plan.user_id
    )

  UNION ALL

  SELECT
    child.id,
    child.user_id,
    legacy_plan_roots.root_plan_id,
    legacy_plan_roots.visited_plan_ids || child.id
  FROM legacy_plan_roots
  JOIN public.workout_plans AS child
    ON child.parent_plan_id = legacy_plan_roots.plan_id
   AND child.user_id = legacy_plan_roots.user_id
  WHERE NOT child.id = ANY(legacy_plan_roots.visited_plan_ids)
)
UPDATE public.workout_plans AS plan
SET family_id = legacy_plan_roots.root_plan_id
FROM legacy_plan_roots
WHERE plan.id = legacy_plan_roots.plan_id
  AND plan.user_id = legacy_plan_roots.user_id;

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

-- Snapshots are write-once database evidence. Legacy rows may receive their
-- first value during a repair/save retry, but no caller (including service
-- code) can replace or clear a value once captured.
CREATE OR REPLACE FUNCTION public.enforce_completed_session_snapshot_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.session_context_snapshot IS NOT NULL
    AND NEW.session_context_snapshot IS DISTINCT FROM OLD.session_context_snapshot THEN
    RAISE EXCEPTION 'SESSION_CONTEXT_SNAPSHOT_IMMUTABLE';
  END IF;

  IF OLD.session_result_snapshot IS NOT NULL
    AND NEW.session_result_snapshot IS DISTINCT FROM OLD.session_result_snapshot THEN
    RAISE EXCEPTION 'SESSION_RESULT_SNAPSHOT_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_completed_session_snapshot_immutability() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_completed_session_snapshot_immutability ON public.progress_logs;
CREATE TRIGGER trg_completed_session_snapshot_immutability
  BEFORE UPDATE OF session_context_snapshot, session_result_snapshot
  ON public.progress_logs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_completed_session_snapshot_immutability();

-- Completed evidence remains readable/appendable and can receive the one-time
-- snapshot repair above, but authenticated REST clients cannot delete it.
DROP POLICY IF EXISTS "progress_logs: own" ON public.progress_logs;
CREATE POLICY "progress_logs: own read" ON public.progress_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "progress_logs: own insert" ON public.progress_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "progress_logs: own update" ON public.progress_logs
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "exercise_logs: own" ON public.exercise_logs;
CREATE POLICY "exercise_logs: own read" ON public.exercise_logs
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.progress_logs AS progress_log
      WHERE progress_log.id = exercise_logs.progress_log_id
        AND progress_log.user_id = auth.uid()
    )
  );
CREATE POLICY "exercise_logs: own insert" ON public.exercise_logs
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.progress_logs AS progress_log
      WHERE progress_log.id = exercise_logs.progress_log_id
        AND progress_log.user_id = auth.uid()
    )
  );
CREATE POLICY "exercise_logs: own update" ON public.exercise_logs
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.progress_logs AS progress_log
      WHERE progress_log.id = exercise_logs.progress_log_id
        AND progress_log.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.progress_logs AS progress_log
      WHERE progress_log.id = exercise_logs.progress_log_id
        AND progress_log.user_id = auth.uid()
    )
  );

REVOKE DELETE ON TABLE public.progress_logs, public.exercise_logs FROM anon, authenticated;

-- Evidence readers must preserve detached logs. A live workout is optional
-- metadata; its deletion cannot remove an already completed session.
CREATE OR REPLACE FUNCTION public.get_dashboard_payload(
  p_week_start timestamptz,
  p_recent_start timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH active_plan AS (
  SELECT wp.id, wp.name, wp.ai_notes, wp.created_at, wp.week_number, wp.plan_context,
    wp.days_per_week, wp.duration_weeks, wp.difficulty, wp.goal
  FROM workout_plans wp
  WHERE wp.user_id = auth.uid() AND wp.is_active = true
  ORDER BY wp.created_at DESC
  LIMIT 1
), plan_workouts AS (
  SELECT w.id, w.name, w.focus, w.day_of_week, w.order_in_plan, w.estimated_duration_minutes,
    COALESCE(COUNT(we.id), 0)::int AS exercise_count
  FROM workouts w
  JOIN active_plan ap ON ap.id = w.plan_id
  LEFT JOIN workout_exercises we ON we.workout_id = w.id
  GROUP BY w.id, w.name, w.focus, w.day_of_week, w.order_in_plan, w.estimated_duration_minutes
), recent_logs AS (
  SELECT pl.id, pl.workout_id, pl.completed_at, pl.duration_minutes, pl.session_context_snapshot,
    CASE WHEN w.id IS NULL THEN NULL ELSE jsonb_build_object('name', w.name, 'focus', w.focus) END AS workout
  FROM progress_logs pl
  LEFT JOIN workouts w ON w.id = pl.workout_id AND w.user_id = auth.uid()
  WHERE pl.user_id = auth.uid() AND pl.completed_at >= p_recent_start
  ORDER BY pl.completed_at DESC, pl.id DESC
), week_logs AS (
  SELECT * FROM recent_logs WHERE completed_at >= p_week_start
), week_volume AS (
  SELECT COALESCE(SUM(weight_value * rep_value), 0)::numeric AS total_kg
  FROM week_logs wl
  JOIN exercise_logs el ON el.progress_log_id = wl.id
  CROSS JOIN LATERAL unnest(
    COALESCE(el.weights_kg, ARRAY[]::numeric[]),
    COALESCE(el.reps_completed, ARRAY[]::integer[])
  ) AS set_values(weight_value, rep_value)
), has_history AS (
  SELECT EXISTS (
    SELECT 1 FROM progress_logs pl WHERE pl.user_id = auth.uid() LIMIT 1
  ) AS value
)
SELECT jsonb_build_object(
  'active_plan', (SELECT to_jsonb(ap) FROM active_plan ap),
  'workouts', COALESCE((SELECT jsonb_agg(to_jsonb(pw) ORDER BY pw.order_in_plan NULLS LAST) FROM plan_workouts pw), '[]'::jsonb),
  'recent_logs', COALESCE((SELECT jsonb_agg(to_jsonb(rl) ORDER BY rl.completed_at DESC, rl.id DESC) FROM recent_logs rl), '[]'::jsonb),
  'week_logs', COALESCE((SELECT jsonb_agg(to_jsonb(wl) ORDER BY wl.completed_at DESC, wl.id DESC) FROM week_logs wl), '[]'::jsonb),
  'week_volume_kg', COALESCE((SELECT total_kg FROM week_volume), 0),
  'has_completed_sessions', COALESCE((SELECT value FROM has_history), false)
);
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_payload(timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_calendar_payload(
  p_time_zone text DEFAULT 'America/Havana',
  p_from timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH day_sessions AS (
  SELECT (pl.completed_at AT TIME ZONE p_time_zone)::date AS day,
    COUNT(*)::int AS sessions,
    COALESCE(SUM(pl.duration_minutes), 0)::int AS duration_min,
    jsonb_agg(pl.id ORDER BY pl.completed_at DESC) AS log_ids
  FROM progress_logs pl
  LEFT JOIN workouts w ON w.id = pl.workout_id AND w.user_id = auth.uid()
  WHERE pl.user_id = auth.uid() AND (p_from IS NULL OR pl.completed_at >= p_from)
  GROUP BY 1
), day_volume AS (
  SELECT (pl.completed_at AT TIME ZONE p_time_zone)::date AS day,
    COALESCE(SUM(weight_value * rep_value), 0)::numeric AS volume_kg
  FROM progress_logs pl
  LEFT JOIN workouts w ON w.id = pl.workout_id AND w.user_id = auth.uid()
  JOIN exercise_logs el ON el.progress_log_id = pl.id
  CROSS JOIN LATERAL unnest(
    COALESCE(el.weights_kg, ARRAY[]::numeric[]),
    COALESCE(el.reps_completed, ARRAY[]::integer[])
  ) AS set_values(weight_value, rep_value)
  WHERE pl.user_id = auth.uid() AND (p_from IS NULL OR pl.completed_at >= p_from)
  GROUP BY 1
)
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'date', to_char(ds.day, 'YYYY-MM-DD'),
  'sessions', ds.sessions,
  'duration_min', ds.duration_min,
  'volume_kg', COALESCE(dv.volume_kg, 0),
  'log_ids', ds.log_ids
) ORDER BY ds.day), '[]'::jsonb)
FROM day_sessions ds
LEFT JOIN day_volume dv ON dv.day = ds.day;
$$;

GRANT EXECUTE ON FUNCTION public.get_calendar_payload(text, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_history_payload(p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH params AS (
  SELECT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100) AS row_limit
), preferred_language AS (
  SELECT COALESCE((SELECT language FROM profiles WHERE id = auth.uid()), 'es') AS value
), session_logs AS (
  SELECT pl.id, pl.workout_id, pl.completed_at, pl.duration_minutes, pl.mood_rating,
    pl.session_context_snapshot,
    CASE WHEN w.id IS NULL THEN NULL ELSE jsonb_build_object('name', w.name, 'focus', w.focus) END AS workout
  FROM progress_logs pl
  LEFT JOIN workouts w ON w.id = pl.workout_id AND w.user_id = auth.uid()
  WHERE pl.user_id = auth.uid()
  ORDER BY pl.completed_at DESC
  LIMIT (SELECT row_limit FROM params)
), exercise_rows AS (
  SELECT el.progress_log_id, el.exercise_id, el.weights_kg, el.reps_completed,
    CASE WHEN e.id IS NULL THEN NULL ELSE jsonb_build_object(
      'name', CASE WHEN (SELECT value FROM preferred_language) = 'es' THEN COALESCE(e.name_es, e.name) ELSE e.name END,
      'muscle_groups', CASE WHEN (SELECT value FROM preferred_language) = 'es' THEN COALESCE(e.muscle_groups_es, e.muscle_groups) ELSE e.muscle_groups END,
      'is_compound', e.is_compound
    ) END AS exercise,
    sl.completed_at AS progress_completed_at
  FROM exercise_logs el
  JOIN session_logs sl ON sl.id = el.progress_log_id
  LEFT JOIN exercises e ON e.id = el.exercise_id
)
SELECT jsonb_build_object(
  'session_logs', COALESCE((SELECT jsonb_agg(to_jsonb(sl) ORDER BY sl.completed_at DESC) FROM session_logs sl), '[]'::jsonb),
  'exercise_logs', COALESCE((SELECT jsonb_agg((to_jsonb(er) - 'progress_completed_at') ORDER BY er.progress_completed_at DESC) FROM exercise_rows er), '[]'::jsonb)
);
$$;

GRANT EXECUTE ON FUNCTION public.get_history_payload(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_exercise_detail_payload(p_exercise_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH preferred_language AS (
  SELECT COALESCE((SELECT language FROM profiles WHERE id = auth.uid()), 'es') AS value
), target_exercise AS (
  SELECT e.id,
    CASE WHEN (SELECT value FROM preferred_language) = 'es' THEN COALESCE(e.name_es, e.name) ELSE e.name END AS name,
    CASE WHEN (SELECT value FROM preferred_language) = 'es' THEN COALESCE(e.description_es, e.description) ELSE e.description END AS description,
    CASE WHEN (SELECT value FROM preferred_language) = 'es' THEN COALESCE(e.muscle_groups_es, e.muscle_groups) ELSE e.muscle_groups END AS muscle_groups,
    CASE WHEN (SELECT value FROM preferred_language) = 'es' THEN COALESCE(e.equipment_es, e.equipment) ELSE e.equipment END AS equipment,
    e.difficulty, e.exercise_type, e.is_compound,
    CASE WHEN (SELECT value FROM preferred_language) = 'es' THEN COALESCE(e.instructions_es, e.instructions) ELSE e.instructions END AS instructions,
    e.video_url, e.image_url
  FROM exercises e
  WHERE e.id = p_exercise_id AND e.is_public = true
  LIMIT 1
), exercise_rows AS (
  SELECT el.id, el.progress_log_id, el.sets_completed, el.reps_completed, el.weights_kg,
    el.rpe_values, el.notes,
    jsonb_build_object('id', pl.id, 'workout_id', pl.workout_id, 'completed_at', pl.completed_at,
      'duration_minutes', pl.duration_minutes, 'mood_rating', pl.mood_rating,
      'session_context_snapshot', pl.session_context_snapshot) AS progress_log,
    pl.completed_at AS progress_completed_at
  FROM exercise_logs el
  JOIN progress_logs pl ON pl.id = el.progress_log_id
  WHERE el.exercise_id = p_exercise_id AND pl.user_id = auth.uid()
  ORDER BY pl.completed_at DESC
), workout_rows AS (
  SELECT DISTINCT w.id, w.name, w.focus
  FROM exercise_logs el
  JOIN progress_logs pl ON pl.id = el.progress_log_id
  LEFT JOIN workouts w ON w.id = pl.workout_id AND w.user_id = auth.uid()
  WHERE el.exercise_id = p_exercise_id AND pl.user_id = auth.uid() AND w.id IS NOT NULL
)
SELECT jsonb_build_object(
  'exercise', (SELECT to_jsonb(te) FROM target_exercise te),
  'logs', COALESCE((SELECT jsonb_agg((to_jsonb(er) - 'progress_completed_at') ORDER BY er.progress_completed_at DESC) FROM exercise_rows er), '[]'::jsonb),
  'workouts', COALESCE((SELECT jsonb_agg(to_jsonb(wr) ORDER BY wr.name) FROM workout_rows wr), '[]'::jsonb)
);
$$;

GRANT EXECUTE ON FUNCTION public.get_exercise_detail_payload(uuid) TO authenticated;

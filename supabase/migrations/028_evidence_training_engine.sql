-- ============================================================
-- Migration 028: deterministic evidence-based training engine
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS cardio_preferences TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS activity_level TEXT NOT NULL DEFAULT 'insufficiently_active',
  ADD COLUMN IF NOT EXISTS readiness_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS readiness_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS movement_limitations JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS readiness_version TEXT,
  ADD COLUMN IF NOT EXISTS readiness_completed_at TIMESTAMPTZ;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_activity_level_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_activity_level_check
  CHECK (activity_level IN ('inactive', 'insufficiently_active', 'regularly_active'));

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_readiness_status_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_readiness_status_check
  CHECK (readiness_status IN ('pending', 'cleared', 'modified', 'professional_clearance_required'));

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_cardio_preferences_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_cardio_preferences_check
  CHECK (cardio_preferences <@ ARRAY[
    'walking', 'running', 'cycling', 'elliptical', 'rowing', 'stairs', 'jump_rope'
  ]::TEXT[]);

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS movement_patterns TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cardio_modality TEXT,
  ADD COLUMN IF NOT EXISTS impact_level TEXT,
  ADD COLUMN IF NOT EXISTS joint_stress_tags TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_cardio_modality_check;
ALTER TABLE exercises ADD CONSTRAINT exercises_cardio_modality_check
  CHECK (cardio_modality IS NULL OR cardio_modality IN (
    'walking', 'running', 'cycling', 'elliptical', 'rowing', 'stairs', 'jump_rope'
  ));

ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_impact_level_check;
ALTER TABLE exercises ADD CONSTRAINT exercises_impact_level_check
  CHECK (impact_level IS NULL OR impact_level IN ('low', 'moderate', 'high'));

-- Non-destructive metadata bootstrap. Automatic generation only consumes rows
-- with a classified movement pattern or cardio modality.
UPDATE exercises SET movement_patterns = ARRAY['core']
WHERE exercise_type = 'strength'
  AND muscle_groups && ARRAY['abdominals']::TEXT[];

UPDATE exercises SET movement_patterns = array_append(movement_patterns, 'squat')
WHERE exercise_type = 'strength'
  AND muscle_groups && ARRAY['quadriceps']::TEXT[]
  AND NOT ('squat' = ANY(movement_patterns));

UPDATE exercises SET movement_patterns = array_append(movement_patterns, 'hinge')
WHERE exercise_type = 'strength'
  AND muscle_groups && ARRAY['hamstrings', 'glutes', 'lower back']::TEXT[]
  AND NOT ('hinge' = ANY(movement_patterns));

UPDATE exercises SET movement_patterns = array_append(movement_patterns, 'horizontal_push')
WHERE exercise_type = 'strength'
  AND muscle_groups && ARRAY['chest']::TEXT[]
  AND NOT ('horizontal_push' = ANY(movement_patterns));

UPDATE exercises SET movement_patterns = array_append(movement_patterns, 'vertical_push')
WHERE exercise_type = 'strength'
  AND muscle_groups && ARRAY['shoulders']::TEXT[]
  AND NOT ('vertical_push' = ANY(movement_patterns));

UPDATE exercises SET movement_patterns = array_append(movement_patterns, 'horizontal_pull')
WHERE exercise_type = 'strength'
  AND muscle_groups && ARRAY['middle back', 'lats', 'traps']::TEXT[]
  AND NOT ('horizontal_pull' = ANY(movement_patterns));

UPDATE exercises SET movement_patterns = array_append(movement_patterns, 'vertical_pull')
WHERE exercise_type = 'strength'
  AND lower(name) ~ '(pull[- ]?up|chin[- ]?up|pulldown)'
  AND NOT ('vertical_pull' = ANY(movement_patterns));

UPDATE exercises SET movement_patterns = ARRAY['isolation']
WHERE exercise_type = 'strength' AND is_compound = FALSE AND movement_patterns = '{}';

UPDATE exercises SET
  cardio_modality = CASE
    WHEN lower(name) ~ '(walk)' THEN 'walking'
    WHEN lower(name) ~ '(run|jog|treadmill)' THEN 'running'
    WHEN lower(name) ~ '(cycl|bike|bicyc)' THEN 'cycling'
    WHEN lower(name) ~ '(elliptical)' THEN 'elliptical'
    WHEN lower(name) ~ '(row)' THEN 'rowing'
    WHEN lower(name) ~ '(stair|stepmill)' THEN 'stairs'
    WHEN lower(name) ~ '(rope)' THEN 'jump_rope'
    ELSE cardio_modality
  END
WHERE exercise_type IN ('cardio', 'hiit');

UPDATE exercises SET movement_patterns = ARRAY['locomotion']
WHERE cardio_modality IS NOT NULL AND movement_patterns = '{}';

UPDATE exercises SET impact_level = CASE
  WHEN cardio_modality IN ('running', 'jump_rope') THEN 'high'
  WHEN cardio_modality = 'stairs' THEN 'moderate'
  WHEN cardio_modality IS NOT NULL THEN 'low'
  ELSE impact_level
END
WHERE cardio_modality IS NOT NULL;

UPDATE exercises SET joint_stress_tags = movement_patterns
WHERE joint_stress_tags = '{}' AND movement_patterns <> '{}';

ALTER TABLE workout_plans
  ADD COLUMN IF NOT EXISTS generation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE workout_plans DROP CONSTRAINT IF EXISTS workout_plans_source_type_check;
ALTER TABLE workout_plans ADD CONSTRAINT workout_plans_source_type_check
  CHECK (source_type IN ('ai', 'engine', 'manual', 'imported', 'shared_post'));

CREATE OR REPLACE FUNCTION public.create_engine_plan(
  p_plan JSONB,
  p_metadata JSONB,
  p_week_number INTEGER,
  p_plan_context TEXT,
  p_parent_plan_id UUID DEFAULT NULL,
  p_profile_updates JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_plan_id UUID;
  v_workout_id UUID;
  v_day JSONB;
  v_exercise JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_plan_context NOT IN ('first_plan', 'weekly_regeneration', 'manual_update') THEN
    RAISE EXCEPTION 'Invalid plan context';
  END IF;

  IF jsonb_array_length(COALESCE(p_plan->'days', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Plan has no days';
  END IF;

  UPDATE workout_plans
  SET is_active = FALSE
  WHERE user_id = v_user_id AND is_active = TRUE;

  INSERT INTO workout_plans (
    user_id, name, goal, duration_weeks, days_per_week, difficulty,
    is_active, generated_by_ai, ai_notes, week_number, plan_context,
    parent_plan_id, source_type, generation_metadata
  ) VALUES (
    v_user_id,
    p_plan->>'display_name',
    p_plan->>'goal',
    1,
    jsonb_array_length(p_plan->'days'),
    NULLIF(p_plan->>'difficulty', ''),
    TRUE,
    FALSE,
    p_plan->>'ai_notes',
    GREATEST(1, p_week_number),
    p_plan_context,
    p_parent_plan_id,
    'engine',
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_plan_id;

  FOR v_day IN SELECT value FROM jsonb_array_elements(p_plan->'days')
  LOOP
    IF jsonb_array_length(COALESCE(v_day->'exercises', '[]'::jsonb)) = 0 THEN
      RAISE EXCEPTION 'Workout day has no exercises';
    END IF;

    INSERT INTO workouts (
      user_id, plan_id, name, focus, day_of_week, order_in_plan,
      estimated_duration_minutes
    ) VALUES (
      v_user_id,
      v_plan_id,
      v_day->>'display_name',
      v_day->>'focus',
      (v_day->>'day_of_week')::INTEGER,
      (v_day->>'day_number')::INTEGER,
      (v_day->>'estimated_duration_minutes')::INTEGER
    )
    RETURNING id INTO v_workout_id;

    FOR v_exercise IN SELECT value FROM jsonb_array_elements(v_day->'exercises')
    LOOP
      INSERT INTO workout_exercises (
        workout_id, exercise_id, order_index, sets, reps, duration_seconds,
        rest_seconds, target_rpe, weight_kg, notes, weight_suggestion_basis
      ) VALUES (
        v_workout_id,
        (v_exercise->>'exercise_id')::UUID,
        COALESCE((v_exercise->>'order_index')::INTEGER, 1),
        (v_exercise->>'sets')::INTEGER,
        NULLIF(v_exercise->>'reps', '')::INTEGER,
        NULLIF(v_exercise->>'duration_seconds', '')::INTEGER,
        (v_exercise->>'rest_seconds')::INTEGER,
        (v_exercise->>'target_rpe')::INTEGER,
        NULLIF(v_exercise->>'weight_kg', '')::NUMERIC,
        NULLIF(v_exercise->>'notes', ''),
        v_exercise->>'weight_suggestion_basis'
      );
    END LOOP;
  END LOOP;

  UPDATE profiles SET
    days_per_week = CASE WHEN p_profile_updates ? 'days_per_week'
      THEN (p_profile_updates->>'days_per_week')::INTEGER ELSE days_per_week END,
    session_duration_minutes = CASE WHEN p_profile_updates ? 'session_duration_minutes'
      THEN (p_profile_updates->>'session_duration_minutes')::INTEGER ELSE session_duration_minutes END,
    preferred_workout_days = CASE WHEN p_profile_updates ? 'preferred_workout_days'
      THEN ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_profile_updates->'preferred_workout_days', '[]'::jsonb))::INTEGER)
      ELSE preferred_workout_days END,
    available_equipment = CASE WHEN p_profile_updates ? 'available_equipment'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_profile_updates->'available_equipment'))
      ELSE available_equipment END,
    cardio_preferences = CASE WHEN p_profile_updates ? 'cardio_preferences'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_profile_updates->'cardio_preferences'))
      ELSE cardio_preferences END
  WHERE id = v_user_id;

  RETURN v_plan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_engine_plan(JSONB, JSONB, INTEGER, TEXT, UUID, JSONB)
  TO authenticated;

COMMENT ON FUNCTION public.create_engine_plan IS
  'Atomically replaces the active plan with a validated deterministic engine plan.';

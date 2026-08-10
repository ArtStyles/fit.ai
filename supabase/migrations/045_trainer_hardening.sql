-- ============================================================
-- Migration 045: trainer authorization hardening
-- ============================================================
-- Client-owned plans and evidence remain owner-only. A trainer receives
-- aggregate/detail data solely through consent-bound SECURITY DEFINER RPCs.

-- Final indexes are limited to gaps observed in the four marketplace query
-- shapes. Earlier migrations already own the request queue, relationship,
-- consent, assignment-version, notification and progress-log indexes.
CREATE INDEX IF NOT EXISTS workouts_plan_schedule_idx
  ON public.workouts (plan_id, day_of_week, order_in_plan, id);

-- trainer_profiles.user_id already has a foreign key to profiles, and the
-- is_account_active() predicate validates the same account through its primary
-- key. Remove the redundant profiles join so the directory does not hash-scan
-- every client account merely to list active trainers.
CREATE OR REPLACE VIEW public.active_trainer_directory
WITH (security_barrier = true)
AS
SELECT
  trainer_profile.user_id,
  trainer_profile.slug,
  trainer_profile.professional_name,
  trainer_profile.professional_photo_url,
  trainer_profile.bio,
  trainer_profile.specialties,
  trainer_profile.modalities,
  trainer_profile.experience_summary,
  trainer_profile.general_location,
  trainer_profile.languages,
  trainer_profile.verified_at,
  lower(concat_ws(' ',
    trainer_profile.professional_name,
    trainer_profile.bio,
    trainer_profile.experience_summary,
    trainer_profile.general_location,
    array_to_string(trainer_profile.specialties, ' '),
    array_to_string(trainer_profile.languages, ' ')
  )) AS directory_search,
  lower(array_to_string(trainer_profile.specialties, ' ')) AS specialties_search,
  lower(array_to_string(trainer_profile.languages, ' ')) AS languages_search,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'name', service.name,
        'description', service.description,
        'modality', service.modality,
        'duration_minutes', service.duration_minutes,
        'content', service.content
      )
      ORDER BY service.created_at ASC, service.id ASC
    ) FILTER (WHERE service.id IS NOT NULL),
    '[]'::jsonb
  ) AS active_services
FROM public.trainer_profiles AS trainer_profile
LEFT JOIN public.trainer_service_offerings AS service
  ON service.trainer_profile_id = trainer_profile.id
  AND service.is_active = TRUE
WHERE trainer_profile.status = 'active'
  AND public.is_account_active(trainer_profile.user_id)
GROUP BY
  trainer_profile.user_id,
  trainer_profile.slug,
  trainer_profile.professional_name,
  trainer_profile.professional_photo_url,
  trainer_profile.bio,
  trainer_profile.specialties,
  trainer_profile.modalities,
  trainer_profile.experience_summary,
  trainer_profile.general_location,
  trainer_profile.languages,
  trainer_profile.verified_at;

ALTER VIEW public.active_trainer_directory OWNER TO postgres;
REVOKE ALL ON TABLE public.active_trainer_directory FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.active_trainer_directory TO authenticated, service_role;

-- Migration 044 normalized a client's timezone through pg_timezone_names in
-- a lateral expression. PostgreSQL inlined that expression into every nested
-- adherence subplan, repeating the filesystem-backed timezone scan many times
-- per client. Materialize the validated value once per scoped relationship
-- while preserving the exact payload, fallback and authorization contract.
CREATE OR REPLACE FUNCTION public.get_coach_clients_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trainer_id UUID := auth.uid();
  v_authorized_trainer_profile_id UUID;
  v_locked_scope_count BIGINT;
  v_result JSONB;
BEGIN
  IF v_trainer_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COACH_CLIENT_INSIGHTS_UNAVAILABLE';
  END IF;

  -- Lock authority in the same account -> professional -> client account ->
  -- relationship -> consent order used by administrative suspension and
  -- consent revocation. Only this trainer's active training scopes participate;
  -- unrelated coaching relationships remain fully concurrent.
  WITH locked_trainer_account AS MATERIALIZED (
    SELECT trainer_account.id
    FROM public.profiles AS trainer_account
    WHERE trainer_account.id = v_trainer_id
      AND trainer_account.account_status = 'active'
    FOR SHARE OF trainer_account
  ), locked_trainer_authority AS MATERIALIZED (
    SELECT trainer_profile.id, trainer_profile.user_id
    FROM locked_trainer_account AS trainer_account
    JOIN public.trainer_profiles AS trainer_profile
      ON trainer_profile.user_id = trainer_account.id
    WHERE trainer_profile.status = 'active'
    FOR SHARE OF trainer_profile
  ), scope_candidates AS MATERIALIZED (
    SELECT relationship.id AS relationship_id, relationship.client_user_id,
      training_consent.id AS consent_id
    FROM locked_trainer_authority AS trainer_authority
    JOIN public.coaching_relationships AS relationship
      ON relationship.trainer_user_id = trainer_authority.user_id
     AND relationship.status = 'active'
    JOIN public.coaching_consents AS training_consent
      ON training_consent.relationship_id = relationship.id
     AND training_consent.scope = 'training_profile'
     AND training_consent.revoked_at IS NULL
  ), locked_client_accounts AS MATERIALIZED (
    SELECT scope.relationship_id, client_account.id
    FROM scope_candidates AS scope
    JOIN LATERAL (
      SELECT client_account.id
      FROM public.profiles AS client_account
      WHERE client_account.id = scope.client_user_id
        AND client_account.account_status = 'active'
      LIMIT 1
      FOR SHARE OF client_account
    ) AS client_account ON TRUE
  ), locked_client_scopes AS MATERIALIZED (
    SELECT relationship.id, training_consent.id AS consent_id
    FROM scope_candidates AS scope
    JOIN locked_client_accounts AS client_account
      ON client_account.relationship_id = scope.relationship_id
     AND client_account.id = scope.client_user_id
    JOIN public.coaching_relationships AS relationship
      ON relationship.id = scope.relationship_id
     AND relationship.trainer_user_id = v_trainer_id
     AND relationship.client_user_id = client_account.id
     AND relationship.status = 'active'
    JOIN public.coaching_consents AS training_consent
      ON training_consent.id = scope.consent_id
     AND training_consent.relationship_id = relationship.id
     AND training_consent.scope = 'training_profile'
     AND training_consent.revoked_at IS NULL
    FOR SHARE OF relationship, training_consent
  )
  SELECT trainer_authority.id, scope_locks.locked_scope_count
  INTO v_authorized_trainer_profile_id, v_locked_scope_count
  FROM locked_trainer_authority AS trainer_authority
  CROSS JOIN (
    SELECT COUNT(*) AS locked_scope_count FROM locked_client_scopes
  ) AS scope_locks;

  IF v_authorized_trainer_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COACH_CLIENT_INSIGHTS_UNAVAILABLE';
  END IF;

  WITH scoped_relationships AS MATERIALIZED (
    SELECT
      relationship.id,
      relationship.client_user_id,
      relationship.started_at,
      client_account.full_name,
      client_account.avatar_url,
      client_account.timezone AS declared_timezone
    FROM public.coaching_relationships AS relationship
    JOIN LATERAL (
      SELECT client.full_name, client.avatar_url, client.timezone
      FROM public.profiles AS client
      WHERE client.id = relationship.client_user_id
        AND client.account_status = 'active'
      LIMIT 1
    ) AS client_account ON TRUE
    JOIN LATERAL (
      SELECT training_consent.id
      FROM public.coaching_consents AS training_consent
      WHERE training_consent.relationship_id = relationship.id
        AND training_consent.scope = 'training_profile'
        AND training_consent.revoked_at IS NULL
      ORDER BY training_consent.granted_at DESC, training_consent.id DESC
      LIMIT 1
    ) AS training_consent ON TRUE
    WHERE relationship.trainer_user_id = v_trainer_id
      AND relationship.status = 'active'
  ), summary_counts AS (
    SELECT
      (SELECT COUNT(*)
       FROM public.coaching_requests AS request
       WHERE request.trainer_user_id = v_trainer_id
         AND request.status = 'pending') AS pending_requests,
      (SELECT COUNT(*) FROM scoped_relationships) AS active_clients,
      (SELECT COUNT(*)
       FROM public.coaching_relationships AS relationship
       WHERE relationship.trainer_user_id = v_trainer_id
         AND relationship.status = 'paused_by_platform') AS paused_relationships
  ), normalized_client_timezones AS MATERIALIZED (
    SELECT
      relationship.id AS relationship_id,
      CASE
        WHEN relationship.declared_timezone IS NOT NULL
          AND EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names AS zone WHERE zone.name = relationship.declared_timezone)
        THEN relationship.declared_timezone
        ELSE 'America/Havana'
      END AS timezone
    FROM scoped_relationships AS relationship
  ), client_rows AS (
    SELECT
      relationship.id AS relationship_id,
      relationship.started_at,
      relationship.client_user_id AS client_id,
      relationship.full_name,
      relationship.avatar_url,
      client_timezone.timezone AS timezone,
      (
        SELECT version.id
        FROM public.trainer_plan_assignments AS assignment
        JOIN public.trainer_assignment_versions AS version
          ON version.id = assignment.active_version_id
         AND version.status = 'active'
        WHERE assignment.relationship_id = relationship.id
          AND assignment.status = 'active'
        LIMIT 1
      ) AS active_version_id,
      (
        SELECT MAX(progress_log.completed_at)
        FROM public.progress_logs AS progress_log
        JOIN public.session_authorizations AS session_authorization
          ON session_authorization.client_session_id = progress_log.client_session_id
         AND session_authorization.user_id = progress_log.user_id
         AND session_authorization.consumed_at IS NOT NULL
         AND session_authorization.released_at IS NULL
        JOIN public.workouts AS workout ON workout.id = session_authorization.workout_id
        JOIN public.workout_plans AS plan
          ON plan.id = session_authorization.plan_id
         AND workout.plan_id = plan.id
         AND plan.prescription_locked = TRUE
        JOIN public.trainer_assignment_versions AS version
          ON version.id = plan.trainer_assignment_version_id
         AND version.materialized_plan_id = plan.id
         AND version.status IN ('active', 'superseded')
        JOIN public.trainer_plan_assignments AS assignment
          ON assignment.id = version.assignment_id
         AND assignment.id = plan.trainer_assignment_id
         AND assignment.relationship_id = plan.trainer_relationship_id
         AND assignment.status = 'active'
        WHERE progress_log.user_id = relationship.client_user_id
          AND assignment.relationship_id = relationship.id
          AND (progress_log.workout_id IS NULL OR progress_log.workout_id = session_authorization.workout_id)
      ) AS last_professional_evidence_at,
       (
         SELECT jsonb_build_object(
           'rangeStart', week_window.start_date,
           'rangeEnd', week_window.end_date,
           'versions', (
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', version.id,
               'effectiveFrom', version.effective_from,
               'effectiveTo', version.effective_to,
               'workouts', (
                 SELECT COALESCE(jsonb_agg(jsonb_build_object(
                   'id', materialized_workout.id,
                   'isoDay', NULLIF(prescribed.value->>'dayOfWeek', '')::INTEGER
                  ) ORDER BY NULLIF(prescribed.value->>'orderInPlan', '')::INTEGER), '[]'::JSONB)
                 FROM jsonb_array_elements(COALESCE(version.snapshot->'workouts', '[]'::JSONB)) AS prescribed(value)
                 LEFT JOIN public.workouts AS materialized_workout
                   ON materialized_workout.plan_id = version.materialized_plan_id
                  AND materialized_workout.day_of_week = NULLIF(prescribed.value->>'dayOfWeek', '')::INTEGER - 1
                  AND materialized_workout.order_in_plan = NULLIF(prescribed.value->>'orderInPlan', '')::INTEGER
                 )
              ) ORDER BY version.effective_from ASC, version.version_number ASC), '[]'::JSONB)
             FROM public.trainer_plan_assignments AS assignment
             JOIN public.trainer_assignment_versions AS version ON version.assignment_id = assignment.id
             WHERE assignment.relationship_id = relationship.id
               AND assignment.status = 'active'
               AND version.status IN ('active', 'superseded')
               AND version.effective_from < ((week_window.end_date + 1)::TIMESTAMP AT TIME ZONE client_timezone.timezone)
               AND COALESCE(version.effective_to, 'infinity'::TIMESTAMPTZ) > ((week_window.alert_start_date - 2)::TIMESTAMP AT TIME ZONE client_timezone.timezone)
            ),
           'sessions', COALESCE(jsonb_agg(session_row.payload ORDER BY session_row.completed_at ASC, session_row.id ASC)
             FILTER (WHERE session_row.id IS NOT NULL AND session_row.completed_date >= week_window.start_date), '[]'::JSONB),
           'alertSessions', COALESCE(jsonb_agg(session_row.payload ORDER BY session_row.completed_at ASC, session_row.id ASC)
             FILTER (WHERE session_row.id IS NOT NULL), '[]'::JSONB)
         )
         FROM LATERAL (
           SELECT
             date_trunc('week', NOW() AT TIME ZONE client_timezone.timezone)::DATE AS start_date,
             (NOW() AT TIME ZONE client_timezone.timezone)::DATE AS end_date,
             (NOW() AT TIME ZONE client_timezone.timezone)::DATE - 7 AS alert_start_date
         ) AS week_window
         LEFT JOIN LATERAL (
           SELECT
             progress_log.id,
             progress_log.completed_at,
             (progress_log.completed_at AT TIME ZONE client_timezone.timezone)::DATE AS completed_date,
             jsonb_build_object(
               'id', progress_log.id,
               'assignmentVersionId', version.id,
               'workoutId', session_authorization.workout_id,
               'completedAt', progress_log.completed_at,
               'averageRpe', (
                 SELECT AVG(rpe.value::NUMERIC)
                 FROM public.exercise_logs AS exercise_log
                 CROSS JOIN LATERAL unnest(exercise_log.rpe_values) AS rpe(value)
                 WHERE exercise_log.progress_log_id = progress_log.id
                   AND rpe.value IS NOT NULL
               )
             ) AS payload
           FROM public.progress_logs AS progress_log
           JOIN public.session_authorizations AS session_authorization
             ON session_authorization.client_session_id = progress_log.client_session_id
            AND session_authorization.user_id = progress_log.user_id
            AND session_authorization.consumed_at IS NOT NULL
            AND session_authorization.released_at IS NULL
           JOIN public.workouts AS workout ON workout.id = session_authorization.workout_id
           JOIN public.workout_plans AS plan
             ON plan.id = session_authorization.plan_id
            AND workout.plan_id = plan.id
            AND plan.prescription_locked = TRUE
           JOIN public.trainer_assignment_versions AS version
             ON version.id = plan.trainer_assignment_version_id
            AND version.materialized_plan_id = plan.id
            AND version.status IN ('active', 'superseded')
           JOIN public.trainer_plan_assignments AS assignment
             ON assignment.id = version.assignment_id
            AND assignment.id = plan.trainer_assignment_id
            AND assignment.relationship_id = plan.trainer_relationship_id
            AND assignment.status = 'active'
           WHERE progress_log.user_id = relationship.client_user_id
             AND assignment.relationship_id = relationship.id
             AND (progress_log.workout_id IS NULL OR progress_log.workout_id = session_authorization.workout_id)
             AND (progress_log.completed_at AT TIME ZONE client_timezone.timezone)::DATE BETWEEN week_window.alert_start_date AND week_window.end_date
         ) AS session_row ON TRUE
         GROUP BY week_window.start_date, week_window.end_date, week_window.alert_start_date
       ) AS adherence_input
    FROM scoped_relationships AS relationship
    JOIN normalized_client_timezones AS client_timezone
      ON client_timezone.relationship_id = relationship.id
  )
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'counts', jsonb_build_object(
      'pendingRequests', counts.pending_requests,
      'activeClients', counts.active_clients,
      'pausedRelationships', counts.paused_relationships
    ),
    'clients', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'relationshipId', row.relationship_id,
        'startedAt', row.started_at,
        'client', jsonb_build_object(
          'id', row.client_id,
          'fullName', row.full_name,
          'avatarUrl', row.avatar_url,
          'timezone', row.timezone
        ),
        'activeAssignmentVersionId', row.active_version_id,
        'lastProfessionalEvidenceAt', row.last_professional_evidence_at,
         'adherenceInput', row.adherence_input
      ) ORDER BY row.last_professional_evidence_at DESC NULLS LAST, row.started_at DESC, row.client_id), '[]'::JSONB)
      FROM client_rows AS row
    )
  ) INTO v_result
  FROM summary_counts AS counts;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.get_coach_clients_summary() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_coach_clients_summary() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_coach_clients_summary() TO authenticated;

-- The detail projection must drive its materialized-workout lookup from each
-- snapshot row. A regular LEFT JOIN estimates 100 JSON rows per version and
-- chooses a hash over the entire workouts table; the lateral LIMIT preserves
-- the one-row identity and uses workouts_plan_schedule_idx deterministically.
CREATE OR REPLACE FUNCTION public.get_coach_client_insights(
  p_client_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trainer_id UUID := auth.uid();
  v_relationship_id UUID;
  v_client_timezone TEXT;
  v_result JSONB;
BEGIN
  IF v_trainer_id IS NULL
    OR p_client_id IS NULL
    OR p_from_date IS NULL
    OR p_to_date IS NULL
    OR p_to_date < p_from_date
    OR p_to_date - p_from_date >= 180 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COACH_CLIENT_INSIGHTS_UNAVAILABLE';
  END IF;

  -- One authorization statement validates and locks every row whose mutation
  -- can revoke this projection. Under READ COMMITTED, a concurrent revoker or
  -- account suspension must commit first; EvalPlanQual then rechecks these
  -- predicates before any client-owned evidence is read.
  SELECT
    relationship.id,
    CASE
      WHEN client_account.timezone IS NOT NULL
        AND EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names AS zone WHERE zone.name = client_account.timezone)
      THEN client_account.timezone
      ELSE 'America/Havana'
    END
  INTO v_relationship_id, v_client_timezone
  FROM public.coaching_relationships AS relationship
  JOIN public.trainer_profiles AS trainer_profile
    ON trainer_profile.user_id = relationship.trainer_user_id
  JOIN public.profiles AS trainer_account
    ON trainer_account.id = trainer_profile.user_id
  JOIN public.profiles AS client_account
    ON client_account.id = relationship.client_user_id
  JOIN public.coaching_consents AS training_consent
    ON training_consent.relationship_id = relationship.id
   AND training_consent.scope = 'training_profile'
   AND training_consent.revoked_at IS NULL
  WHERE relationship.trainer_user_id = v_trainer_id
    AND relationship.client_user_id = p_client_id
    AND relationship.status = 'active'
    AND trainer_profile.status = 'active'
    AND trainer_account.account_status = 'active'
    AND client_account.account_status = 'active'
  FOR SHARE OF relationship, trainer_profile, trainer_account, client_account, training_consent;

  IF v_relationship_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COACH_CLIENT_INSIGHTS_UNAVAILABLE';
  END IF;

  WITH client_row AS (
    SELECT
      client.id,
      client.full_name,
      client.avatar_url,
      v_client_timezone AS timezone,
      client.fitness_level,
      client.primary_goal,
      client.days_per_week,
      client.session_duration_minutes,
      client.gym_type,
      COALESCE(client.available_equipment, ARRAY[]::TEXT[]) AS available_equipment,
      COALESCE(client.movement_limitations, '[]'::JSONB) AS movement_limitations
    FROM public.profiles AS client
    WHERE client.id = p_client_id
  ), relationship_row AS (
    SELECT relationship.id, relationship.started_at
    FROM public.coaching_relationships AS relationship
    WHERE relationship.id = v_relationship_id
  ), scope_rows AS (
    SELECT COALESCE(jsonb_agg(consent.scope ORDER BY consent.scope), '[]'::JSONB) AS active_scopes
    FROM public.coaching_consents AS consent
    WHERE consent.relationship_id = v_relationship_id
      AND consent.revoked_at IS NULL
      AND consent.scope IN ('training_profile', 'body_measurements')
  ), assignment_rows AS (
    SELECT assignment.id, assignment.active_version_id
    FROM public.trainer_plan_assignments AS assignment
    WHERE assignment.relationship_id = v_relationship_id
      AND assignment.status = 'active'
  ), versions AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', version.id,
      'assignmentId', version.assignment_id,
      'versionNumber', version.version_number,
      'status', version.status,
      'effectiveFrom', version.effective_from,
      'effectiveTo', version.effective_to,
      'changeSummary', version.change_summary
    ) ORDER BY version.effective_from ASC, version.version_number ASC, version.id ASC), '[]'::JSONB) AS value
    FROM public.trainer_assignment_versions AS version
    JOIN assignment_rows AS assignment ON assignment.id = version.assignment_id
    WHERE version.status IN ('active', 'superseded')
  ), prescribed_workouts AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'assignmentVersionId', version.id,
      'id', materialized_workout.id,
      'name', workout.value->>'name',
      'dayOfWeek', NULLIF(workout.value->>'dayOfWeek', '')::INTEGER,
      'orderInPlan', NULLIF(workout.value->>'orderInPlan', '')::INTEGER,
      'exercises', COALESCE(workout.value->'exercises', '[]'::JSONB)
    ) ORDER BY version.effective_from ASC, version.version_number ASC,
      NULLIF(workout.value->>'dayOfWeek', '')::INTEGER,
      NULLIF(workout.value->>'orderInPlan', '')::INTEGER), '[]'::JSONB) AS value
    FROM public.trainer_assignment_versions AS version
    JOIN assignment_rows AS assignment ON assignment.id = version.assignment_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(version.snapshot->'workouts', '[]'::JSONB)) AS workout(value)
    LEFT JOIN LATERAL (
      SELECT indexed_workout.id
      FROM public.workouts AS indexed_workout
      WHERE indexed_workout.plan_id = version.materialized_plan_id
        AND indexed_workout.day_of_week = NULLIF(workout.value->>'dayOfWeek', '')::INTEGER - 1
        AND indexed_workout.order_in_plan = NULLIF(workout.value->>'orderInPlan', '')::INTEGER
      ORDER BY indexed_workout.id
      LIMIT 1
    ) AS materialized_workout ON TRUE
    WHERE version.status IN ('active', 'superseded')
  ), trusted_sessions AS (
    SELECT
      progress_log.id,
      progress_log.completed_at,
      progress_log.duration_minutes,
      progress_log.mood_rating,
      progress_log.notes,
      session_authorization.workout_id AS trusted_workout_id,
      session_authorization.session_context_snapshot AS authorization_snapshot,
      workout.name AS live_workout_name,
      version.id AS assignment_version_id
    FROM public.progress_logs AS progress_log
    JOIN public.session_authorizations AS session_authorization
      ON session_authorization.client_session_id = progress_log.client_session_id
     AND session_authorization.user_id = progress_log.user_id
     AND session_authorization.consumed_at IS NOT NULL
     AND session_authorization.released_at IS NULL
    JOIN public.workouts AS workout ON workout.id = session_authorization.workout_id
    JOIN public.workout_plans AS plan
      ON plan.id = session_authorization.plan_id
     AND workout.plan_id = plan.id
     AND plan.prescription_locked = TRUE
    JOIN public.trainer_assignment_versions AS version
      ON version.id = plan.trainer_assignment_version_id
     AND version.materialized_plan_id = plan.id
     AND version.status IN ('active', 'superseded')
    JOIN assignment_rows AS assignment
      ON assignment.id = version.assignment_id
     AND assignment.id = plan.trainer_assignment_id
     AND plan.trainer_relationship_id = v_relationship_id
    WHERE progress_log.user_id = p_client_id
      AND (progress_log.workout_id IS NULL OR progress_log.workout_id = session_authorization.workout_id)
      AND (progress_log.completed_at AT TIME ZONE v_client_timezone)::DATE BETWEEN p_from_date AND p_to_date
  ), sessions AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', trusted_session.id,
      'assignmentVersionId', trusted_session.assignment_version_id,
      'completedAt', trusted_session.completed_at,
      'durationMinutes', trusted_session.duration_minutes,
      'moodRating', trusted_session.mood_rating,
      'notes', trusted_session.notes,
      'workout', jsonb_build_object(
        'id', trusted_session.trusted_workout_id,
        'name', COALESCE(trusted_session.authorization_snapshot->'workout'->>'name', trusted_session.live_workout_name)
      ),
      'exerciseResults', COALESCE((
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'exerciseId', exercise_log.exercise_id,
          'name', COALESCE(captured_exercise.value->>'name', catalog.name),
          'setsCompleted', exercise_log.sets_completed,
          'repsCompleted', exercise_log.reps_completed,
          'weightsKg', exercise_log.weights_kg,
          'rpeValues', exercise_log.rpe_values,
          'durationSeconds', exercise_log.duration_seconds,
          'notes', exercise_log.notes
        ) ORDER BY exercise_log.id), '[]'::JSONB)
        FROM public.exercise_logs AS exercise_log
        LEFT JOIN public.exercises AS catalog ON catalog.id = exercise_log.exercise_id
        LEFT JOIN LATERAL (
          SELECT snapshot_exercise.value
          FROM jsonb_array_elements(COALESCE(trusted_session.authorization_snapshot->'exercises', '[]'::JSONB)) AS snapshot_exercise(value)
          WHERE snapshot_exercise.value->>'exerciseId' = exercise_log.exercise_id::TEXT
          LIMIT 1
        ) AS captured_exercise ON TRUE
        WHERE exercise_log.progress_log_id = trusted_session.id
      ), '[]'::JSONB)
    ) ORDER BY trusted_session.completed_at DESC, trusted_session.id DESC), '[]'::JSONB) AS value
    FROM trusted_sessions AS trusted_session
  )
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'client', jsonb_build_object(
      'id', client.id,
      'fullName', client.full_name,
      'avatarUrl', client.avatar_url,
      'timezone', client.timezone,
      'fitnessLevel', client.fitness_level,
      'primaryGoal', client.primary_goal,
      'daysPerWeek', client.days_per_week,
      'sessionDurationMinutes', client.session_duration_minutes,
      'gymType', client.gym_type,
      'availableEquipment', client.available_equipment,
      'movementLimitations', client.movement_limitations
    ),
    'relationship', jsonb_build_object(
      'id', relationship.id,
      'startedAt', relationship.started_at,
      'activeScopes', scope.active_scopes
    ),
    'versions', versions.value,
    'prescribedWorkouts', prescribed_workouts.value,
    'sessions', sessions.value,
    'measurements', NULL
  ) INTO v_result
  FROM client_row AS client
  CROSS JOIN relationship_row AS relationship
  CROSS JOIN scope_rows AS scope
  CROSS JOIN versions
  CROSS JOIN prescribed_workouts
  CROSS JOIN sessions;

  IF v_result IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COACH_CLIENT_INSIGHTS_UNAVAILABLE';
  END IF;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.get_coach_client_insights(UUID, DATE, DATE) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_coach_client_insights(UUID, DATE, DATE) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_coach_client_insights(UUID, DATE, DATE) TO authenticated;

ALTER TABLE public.product_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_application_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_credential_storage_cleanup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_application_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_service_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_program_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_template_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_template_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_plan_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_assignment_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_authorizations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.product_push_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE public.product_notification_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.professional_audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_applications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_application_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_credential_storage_cleanup FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_application_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_interviews FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_service_offerings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_relationships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_consents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_program_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_template_workouts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_template_exercises FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_plan_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_assignment_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.workout_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.workouts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.workout_exercises FORCE ROW LEVEL SECURITY;
ALTER TABLE public.progress_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.measurements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.session_authorizations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coaching_requests: read participant" ON public.coaching_requests;
DROP POLICY IF EXISTS "coaching_requests: consent-bound participants" ON public.coaching_requests;
CREATE POLICY "coaching_requests: consent-bound participants"
  ON public.coaching_requests FOR SELECT TO authenticated
  USING (
    auth.uid() = client_user_id
    OR (
      auth.uid() = trainer_user_id
      AND (
        (
          status = 'pending'
          AND EXISTS (
            SELECT 1
            FROM public.trainer_profiles trainer_profile
            JOIN public.profiles trainer_account
              ON trainer_account.id = trainer_profile.user_id
            WHERE trainer_profile.user_id = auth.uid()
              AND trainer_profile.status = 'active'
              AND trainer_account.account_status = 'active'
          )
        )
        OR EXISTS (
          SELECT 1
          FROM public.coaching_relationships relationship
          WHERE relationship.source_request_id = coaching_requests.id
            AND public.has_active_coaching_scope(
              coaching_requests.trainer_user_id,
              coaching_requests.client_user_id,
              'training_profile'
            )
        )
      )
    )
  );

DROP POLICY IF EXISTS "coaching_relationships: read participant" ON public.coaching_relationships;
DROP POLICY IF EXISTS "coaching_relationships: consent-bound participants" ON public.coaching_relationships;
CREATE POLICY "coaching_relationships: consent-bound participants"
  ON public.coaching_relationships FOR SELECT TO authenticated
  USING (
    auth.uid() = client_user_id
    OR public.has_active_coaching_scope(trainer_user_id, client_user_id, 'training_profile')
  );

DROP POLICY IF EXISTS "coaching_consents: read participant" ON public.coaching_consents;
DROP POLICY IF EXISTS "coaching_consents: consent-bound participants" ON public.coaching_consents;
CREATE POLICY "coaching_consents: consent-bound participants"
  ON public.coaching_consents FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.coaching_relationships relationship
    WHERE relationship.id = coaching_consents.relationship_id
      AND (
        relationship.client_user_id = auth.uid()
        OR public.has_active_coaching_scope(
          relationship.trainer_user_id,
          relationship.client_user_id,
          'training_profile'
        )
      )
  ));

DROP POLICY IF EXISTS "trainer_plan_assignments: read active participants" ON public.trainer_plan_assignments;
DROP POLICY IF EXISTS "trainer_plan_assignments: consent-bound participants" ON public.trainer_plan_assignments;
CREATE POLICY "trainer_plan_assignments: consent-bound participants"
  ON public.trainer_plan_assignments FOR SELECT TO authenticated
  USING (
    auth.uid() = client_user_id
    OR public.has_active_coaching_scope(trainer_user_id, client_user_id, 'training_profile')
  );

DROP POLICY IF EXISTS "trainer_assignment_versions: read active participants" ON public.trainer_assignment_versions;
DROP POLICY IF EXISTS "trainer_assignment_versions: consent-bound participants" ON public.trainer_assignment_versions;
CREATE POLICY "trainer_assignment_versions: consent-bound participants"
  ON public.trainer_assignment_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.trainer_plan_assignments assignment
    WHERE assignment.id = trainer_assignment_versions.assignment_id
      AND (
        auth.uid() = assignment.client_user_id
        OR public.has_active_coaching_scope(
          assignment.trainer_user_id,
          assignment.client_user_id,
          'training_profile'
        )
      )
  ));

-- Rebuild the legacy API ACLs deny-first. RLS remains the per-user boundary;
-- no policy grants trainers access to client plans, evidence, or measurements.
REVOKE ALL ON TABLE public.admin_audit_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.workout_plans FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.workouts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.workout_exercises FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.progress_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.exercise_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.measurements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.session_authorizations FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workout_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.workouts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workout_exercises TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.progress_logs TO authenticated;
GRANT SELECT, INSERT ON TABLE public.exercise_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.measurements TO authenticated;
GRANT SELECT ON TABLE public.session_authorizations TO authenticated;

-- This trigger owns the protected admin/account fields. Migration 029 fixed its
-- path to trusted schemas; append pg_temp so unqualified temporary objects can
-- never enter SECURITY DEFINER resolution.
ALTER FUNCTION public.enforce_protected_profile_fields()
  SET search_path = public, auth, pg_temp;

-- This helper is internal to trusted definer functions and server-side service
-- calls. Authenticated users must never forge cross-user notifications.
REVOKE ALL ON FUNCTION public.create_product_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_product_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB)
  TO service_role;

-- Exact, reversible cleanup for opt-in trainer-security fixtures. This is not
-- a project reset: every target must be named explicitly and carry the same
-- E2E run marker in auth metadata. The service-role grant lets the server-side
-- E2E harness remove immutable professional materializations in dependency
-- order without weakening any authenticated production boundary.
CREATE OR REPLACE FUNCTION public.cleanup_trainer_security_e2e_fixture(
  p_run_id TEXT,
  p_user_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_target_ids UUID[];
  v_existing INTEGER;
  v_matched INTEGER;
  v_deleted INTEGER;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TRAINER_SECURITY_CLEANUP_SERVICE_REQUIRED';
  END IF;
  IF p_run_id IS NULL OR btrim(p_run_id) = '' OR cardinality(p_user_ids) IS NULL OR cardinality(p_user_ids) = 0 THEN
    RAISE EXCEPTION 'TRAINER_SECURITY_CLEANUP_SCOPE_REQUIRED';
  END IF;
  IF array_position(p_user_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'TRAINER_SECURITY_CLEANUP_SCOPE_MISMATCH';
  END IF;

  SELECT array_agg(target.id ORDER BY target.id), count(*),
    count(*) FILTER (WHERE target.raw_user_meta_data ->> 'e2e_run_id' = p_run_id)
  INTO v_target_ids, v_existing, v_matched
  FROM (
    SELECT target.id, target.raw_user_meta_data
    FROM auth.users target
    WHERE target.id = ANY(p_user_ids)
    FOR UPDATE
  ) target;
  IF v_existing = 0 THEN
    RETURN 0;
  END IF;
  IF v_matched <> v_existing THEN
    RAISE EXCEPTION 'TRAINER_SECURITY_CLEANUP_SCOPE_MISMATCH';
  END IF;

  SET CONSTRAINTS ALL DEFERRED;
  PERFORM set_config('app.trainer_prescription_mutation', 'authorized', TRUE);

  DELETE FROM public.session_authorizations lease WHERE lease.user_id = ANY(v_target_ids);
  DELETE FROM public.exercise_logs log USING public.progress_logs progress
    WHERE log.progress_log_id = progress.id AND progress.user_id = ANY(v_target_ids);
  DELETE FROM public.progress_logs progress WHERE progress.user_id = ANY(v_target_ids);
  DELETE FROM public.measurements measurement WHERE measurement.user_id = ANY(v_target_ids);

  UPDATE public.trainer_plan_assignments assignment
  SET active_version_id = NULL
  WHERE assignment.client_user_id = ANY(v_target_ids) OR assignment.trainer_user_id = ANY(v_target_ids);
  UPDATE public.trainer_assignment_versions version
  SET materialized_plan_id = NULL
  WHERE version.assignment_id IN (
    SELECT assignment.id FROM public.trainer_plan_assignments assignment
    WHERE assignment.client_user_id = ANY(v_target_ids) OR assignment.trainer_user_id = ANY(v_target_ids)
  );
  DELETE FROM public.workout_exercises exercise
  WHERE exercise.workout_id IN (
    SELECT workout.id FROM public.workouts workout WHERE workout.user_id = ANY(v_target_ids)
  );
  DELETE FROM public.workouts workout WHERE workout.user_id = ANY(v_target_ids);
  DELETE FROM public.workout_plans plan WHERE plan.user_id = ANY(v_target_ids);
  DELETE FROM public.trainer_assignment_versions version
  WHERE version.assignment_id IN (
    SELECT assignment.id FROM public.trainer_plan_assignments assignment
    WHERE assignment.client_user_id = ANY(v_target_ids) OR assignment.trainer_user_id = ANY(v_target_ids)
  );
  DELETE FROM public.trainer_plan_assignments assignment
  WHERE assignment.client_user_id = ANY(v_target_ids) OR assignment.trainer_user_id = ANY(v_target_ids);
  DELETE FROM public.trainer_program_templates template WHERE template.trainer_user_id = ANY(v_target_ids);

  DELETE FROM public.coaching_consents consent
  WHERE consent.relationship_id IN (
    SELECT relationship.id FROM public.coaching_relationships relationship
    WHERE relationship.client_user_id = ANY(v_target_ids) OR relationship.trainer_user_id = ANY(v_target_ids)
  );
  DELETE FROM public.coaching_relationships relationship
  WHERE relationship.client_user_id = ANY(v_target_ids) OR relationship.trainer_user_id = ANY(v_target_ids);
  DELETE FROM public.coaching_requests request
  WHERE request.client_user_id = ANY(v_target_ids) OR request.trainer_user_id = ANY(v_target_ids);

  DELETE FROM public.trainer_service_offerings service
  WHERE service.trainer_profile_id IN (
    SELECT profile.id FROM public.trainer_profiles profile WHERE profile.user_id = ANY(v_target_ids)
  );
  DELETE FROM public.trainer_profiles profile WHERE profile.user_id = ANY(v_target_ids);
  DELETE FROM public.trainer_applications application WHERE application.user_id = ANY(v_target_ids);

  DELETE FROM public.product_notifications notification WHERE notification.user_id = ANY(v_target_ids);
  DELETE FROM public.product_push_tokens token WHERE token.user_id = ANY(v_target_ids);
  DELETE FROM public.product_notification_preferences preference WHERE preference.user_id = ANY(v_target_ids);
  DELETE FROM public.professional_audit_logs audit
  WHERE audit.actor_user_id = ANY(v_target_ids) OR audit.subject_user_id = ANY(v_target_ids);
  DELETE FROM public.admin_audit_logs audit
  WHERE audit.admin_user_id = ANY(v_target_ids) OR audit.target_user_id = ANY(v_target_ids);

  DELETE FROM auth.users target WHERE target.id = ANY(v_target_ids);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> v_existing THEN RAISE EXCEPTION 'TRAINER_SECURITY_CLEANUP_INCOMPLETE'; END IF;
  RETURN v_deleted;
END;
$$;

ALTER FUNCTION public.cleanup_trainer_security_e2e_fixture(TEXT, UUID[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cleanup_trainer_security_e2e_fixture(TEXT, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_trainer_security_e2e_fixture(TEXT, UUID[]) TO service_role;

-- Read-only deployment marker used before destructive E2E fixture setup. It
-- derives readiness from the catalogs so a partial/invalid deployment cannot
-- pass merely because this marker function itself exists.
CREATE OR REPLACE FUNCTION public.trainer_security_preflight()
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF to_regprocedure('public.prepare_trainer_credential_removal(uuid,uuid)') IS NULL
    OR to_regprocedure('public.accept_coaching_request(uuid,uuid)') IS NULL
    OR to_regprocedure('public.end_coaching_relationship(uuid,text,uuid)') IS NULL
    OR to_regprocedure('public.propose_trainer_assignment(uuid,uuid,text,text)') IS NULL
    OR to_regprocedure('public.accept_trainer_assignment(uuid,text)') IS NULL
    OR to_regprocedure('public.publish_trainer_assignment_revision(uuid,uuid,text,text)') IS NULL
    OR to_regprocedure('public.get_coach_client_insights(uuid,date,date)') IS NULL
    OR to_regprocedure('public.cleanup_trainer_security_e2e_fixture(text,uuid[])') IS NULL THEN
    RAISE EXCEPTION 'TRAINER_SECURITY_SCHEMA_INCOMPLETE';
  END IF;
  RETURN 45;
END;
$$;

REVOKE ALL ON FUNCTION public.trainer_security_preflight() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trainer_security_preflight() TO authenticated, service_role;

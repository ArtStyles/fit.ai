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

-- Professional evidence accepts only the finite domain emitted by migrations
-- 041-045. Core event fields are rejected rather than truncated so neither a
-- service client nor a later feature can turn them into free-text storage.
CREATE OR REPLACE FUNCTION public.is_professional_audit_event_allowed(
  p_entity_type TEXT,
  p_action TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(CASE p_entity_type
    WHEN 'professional_audit' THEN p_action IN ('legacy_event_redacted')
    WHEN 'trainer_application' THEN p_action IN (
      'application_draft_saved', 'application_submitted', 'application_withdrawn',
      'trainer_application_under_review', 'trainer_application_changes_requested',
      'trainer_application_interview_required', 'trainer_application_approved',
      'trainer_application_rejected', 'trainer_interview_scheduled'
    )
    WHEN 'trainer_interview' THEN p_action IN ('trainer_interview_outcome_recorded')
    WHEN 'coaching_request' THEN p_action IN (
      'created', 'cancelled', 'accepted', 'declined', 'cancelled_after_acceptance'
    )
    WHEN 'coaching_relationship' THEN p_action IN (
      'relationship_created', 'training_profile_consent_granted',
      'body_measurements_consent_granted', 'body_measurements_consent_revoked',
      'training_profile_consent_revoked', 'ended', 'resumed',
      'paused_due_to_account_suspension'
    )
    WHEN 'trainer_account' THEN p_action IN ('suspended')
    WHEN 'trainer_profile' THEN p_action IN (
      'profile_created', 'profile_updated', 'profile_deleted',
      'profile_status_changed', 'reinstated'
    )
    WHEN 'trainer_service' THEN p_action IN (
      'service_created', 'service_updated', 'service_deleted',
      'service_activated', 'service_deactivated'
    )
    WHEN 'trainer_program_template' THEN p_action IN (
      'template_created', 'template_updated', 'template_deleted', 'template_archived'
    )
    WHEN 'trainer_template_workout' THEN p_action IN (
      'template_workout_insert', 'template_workout_update', 'template_workout_delete'
    )
    WHEN 'trainer_template_exercise' THEN p_action IN (
      'template_exercise_insert', 'template_exercise_update', 'template_exercise_delete'
    )
    WHEN 'trainer_application_credential' THEN p_action IN (
      'credential_added', 'credential_removed', 'credential_removal_prepared',
      'credential_removal_retried', 'credential_cleanup_failed'
    )
    WHEN 'trainer_plan_assignment' THEN p_action IN (
      'proposed', 'accepted', 'revision_published', 'assignment_frozen'
    )
    ELSE FALSE
  END, FALSE)
$$;

ALTER FUNCTION public.is_professional_audit_event_allowed(TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_professional_audit_event_allowed(TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;

-- Metadata is reduced to exact keys and value domains. This pure helper is
-- shared by the one-time legacy redaction and every future insert.
CREATE OR REPLACE FUNCTION public.sanitize_professional_audit_metadata(
  p_entity_type TEXT,
  p_action TEXT,
  p_metadata JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_safe JSONB := '{}'::JSONB;
  v_key TEXT;
  v_normalized_key TEXT;
  v_canonical_key TEXT;
  v_value JSONB;
  v_text TEXT;
  v_allowed_keys TEXT[] := '{}'::TEXT[];
  v_filtered JSONB;
  v_expected_to_status TEXT;
BEGIN
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::JSONB)) <> 'object' THEN
    RETURN '{}'::JSONB;
  END IF;

  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_metadata)
  LOOP
    v_normalized_key := lower(v_key);

    -- These names remain explicit so future changes cannot accidentally turn
    -- them into allowlisted aliases (matching is case-insensitive).
    IF v_normalized_key = ANY (ARRAY[
      'reason', 'free_reason', 'change_summary', 'email', 'contact_email',
      'phone', 'contact_phone', 'credential', 'credential_url', 'storage',
      'storage_url', 'storage_path', 'notes', 'public_note', 'internal_note',
      'measurement', 'measurements', 'body_data', 'payload', 'snapshot',
      'raw_error', 'error_payload', 'last_error'
    ]) THEN
      CONTINUE;
    END IF;

    v_text := CASE WHEN jsonb_typeof(v_value) = 'string' THEN v_value #>> '{}' ELSE NULL END;
    v_canonical_key := CASE v_normalized_key
      WHEN 'applicationid' THEN 'applicationId'
      WHEN 'interviewid' THEN 'interviewId'
      WHEN 'fromstatus' THEN 'fromStatus'
      WHEN 'tostatus' THEN 'toStatus'
      ELSE v_normalized_key
    END;

    IF v_normalized_key = ANY (ARRAY[
      'applicationid', 'interviewid', 'event_id', 'service_id',
      'relationship_id', 'accepted_request_id', 'trainer_user_id',
      'client_user_id', 'trainer_profile_id', 'idempotency_key'
    ]) THEN
      IF v_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        v_safe := v_safe || jsonb_build_object(v_canonical_key, v_text);
      END IF;
    ELSIF v_normalized_key = 'cancelled_request_ids' THEN
      IF jsonb_typeof(v_value) = 'array'
        AND jsonb_array_length(v_value) <= 1000
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(v_value) item(value)
          WHERE item.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
      THEN
        v_safe := v_safe || jsonb_build_object(v_canonical_key, v_value);
      END IF;
    ELSIF v_normalized_key = 'status' THEN
      IF v_text IN ('completed', 'cancelled') THEN
        v_safe := v_safe || jsonb_build_object(v_canonical_key, v_text);
      END IF;
    ELSIF v_normalized_key IN ('fromstatus', 'tostatus') THEN
      IF v_text IN (
        'draft', 'submitted', 'under_review', 'changes_requested',
        'interview_required', 'approved', 'rejected', 'withdrawn'
      ) THEN
        v_safe := v_safe || jsonb_build_object(v_canonical_key, v_text);
      END IF;
    ELSIF v_normalized_key = 'consent_version' THEN
      IF v_text = 'training-profile-v1' THEN
        v_safe := v_safe || jsonb_build_object(v_canonical_key, v_text);
      END IF;
    ELSIF v_normalized_key = 'text_version' THEN
      IF v_text IN ('training-profile-v1', 'body-measurements-v1') THEN
        v_safe := v_safe || jsonb_build_object(v_canonical_key, v_text);
      END IF;
    ELSIF v_normalized_key = 'scope' THEN
      IF v_text IN ('training_profile', 'body_measurements') THEN
        v_safe := v_safe || jsonb_build_object(v_canonical_key, v_text);
      END IF;
    ELSIF v_normalized_key = 'version_number' THEN
      IF jsonb_typeof(v_value) = 'number'
        AND (v_value #>> '{}') ~ '^[0-9]+$'
        AND (v_value #>> '{}')::NUMERIC BETWEEN 1 AND 100000
      THEN
        v_safe := v_safe || jsonb_build_object(v_canonical_key, v_value);
      END IF;
    ELSIF v_normalized_key = 'trainer_profile_suspended'
      AND jsonb_typeof(v_value) = 'boolean'
    THEN
      v_safe := v_safe || jsonb_build_object(v_canonical_key, v_value);
    END IF;
  END LOOP;

  IF p_entity_type = 'trainer_application' THEN
    v_expected_to_status := CASE p_action
      WHEN 'application_submitted' THEN 'submitted'
      WHEN 'application_withdrawn' THEN 'withdrawn'
      WHEN 'trainer_application_under_review' THEN 'under_review'
      WHEN 'trainer_application_changes_requested' THEN 'changes_requested'
      WHEN 'trainer_application_interview_required' THEN 'interview_required'
      WHEN 'trainer_application_approved' THEN 'approved'
      WHEN 'trainer_application_rejected' THEN 'rejected'
      ELSE NULL
    END;
    IF v_expected_to_status IS NOT NULL
      AND v_safe ->> 'toStatus' IS DISTINCT FROM v_expected_to_status
    THEN
      v_safe := v_safe - 'toStatus';
    END IF;
  END IF;

  IF p_entity_type = 'coaching_relationship'
    AND p_action = 'training_profile_consent_granted'
    AND (
      v_safe ->> 'text_version' IS DISTINCT FROM 'training-profile-v1'
      OR v_safe ->> 'scope' IS DISTINCT FROM 'training_profile'
    )
  THEN
    v_safe := v_safe - 'text_version' - 'scope';
  ELSIF p_entity_type = 'coaching_relationship'
    AND p_action = 'body_measurements_consent_granted'
    AND v_safe ->> 'text_version' IS DISTINCT FROM 'body-measurements-v1'
  THEN
    v_safe := v_safe - 'text_version';
  END IF;

  IF p_entity_type = 'trainer_application'
    AND p_action IN ('application_submitted', 'application_withdrawn')
  THEN
    v_allowed_keys := ARRAY['event_id', 'fromStatus', 'toStatus'];
  ELSIF p_entity_type = 'trainer_application'
    AND p_action IN (
      'trainer_application_under_review', 'trainer_application_changes_requested',
      'trainer_application_interview_required', 'trainer_application_approved',
      'trainer_application_rejected'
    )
  THEN
    v_allowed_keys := ARRAY['fromStatus', 'toStatus'];
  ELSIF p_entity_type = 'trainer_application'
    AND p_action = 'trainer_interview_scheduled'
  THEN
    v_allowed_keys := ARRAY['interviewId'];
  ELSIF p_entity_type = 'trainer_interview'
    AND p_action = 'trainer_interview_outcome_recorded'
  THEN
    v_allowed_keys := ARRAY['applicationId', 'status'];
  ELSIF p_entity_type = 'coaching_request' AND p_action = 'created' THEN
    v_allowed_keys := ARRAY['service_id', 'consent_version', 'idempotency_key'];
  ELSIF p_entity_type = 'coaching_request'
    AND p_action IN ('cancelled', 'declined')
  THEN
    v_allowed_keys := ARRAY['service_id'];
  ELSIF p_entity_type = 'coaching_request' AND p_action = 'accepted' THEN
    v_allowed_keys := ARRAY['relationship_id', 'service_id', 'cancelled_request_ids'];
  ELSIF p_entity_type = 'coaching_request'
    AND p_action = 'cancelled_after_acceptance'
  THEN
    v_allowed_keys := ARRAY['accepted_request_id', 'service_id'];
  ELSIF p_entity_type = 'coaching_relationship'
    AND p_action = 'relationship_created'
  THEN
    v_allowed_keys := ARRAY['service_id'];
  ELSIF p_entity_type = 'coaching_relationship'
    AND p_action = 'training_profile_consent_granted'
  THEN
    v_allowed_keys := ARRAY['text_version', 'scope'];
  ELSIF p_entity_type = 'coaching_relationship'
    AND p_action = 'body_measurements_consent_granted'
  THEN
    v_allowed_keys := ARRAY['text_version', 'idempotency_key'];
  ELSIF p_entity_type = 'coaching_relationship'
    AND p_action IN (
      'body_measurements_consent_revoked', 'training_profile_consent_revoked',
      'ended', 'resumed'
    )
  THEN
    v_allowed_keys := ARRAY['idempotency_key'];
  ELSIF p_entity_type = 'coaching_relationship'
    AND p_action = 'paused_due_to_account_suspension'
  THEN
    v_allowed_keys := ARRAY['trainer_user_id', 'client_user_id'];
  ELSIF p_entity_type = 'trainer_account' AND p_action = 'suspended' THEN
    v_allowed_keys := ARRAY['trainer_profile_suspended'];
  ELSIF p_entity_type = 'trainer_profile'
    AND p_action IN ('profile_created', 'profile_updated')
  THEN
    v_allowed_keys := ARRAY['applicationId'];
  ELSIF p_entity_type = 'trainer_plan_assignment'
    AND p_action IN ('proposed', 'accepted')
  THEN
    v_allowed_keys := ARRAY['relationship_id', 'version_number'];
  ELSIF p_entity_type = 'trainer_plan_assignment'
    AND p_action = 'revision_published'
  THEN
    v_allowed_keys := ARRAY['version_number'];
  ELSIF p_entity_type = 'trainer_plan_assignment'
    AND p_action = 'assignment_frozen'
  THEN
    v_allowed_keys := ARRAY['relationship_id'];
  END IF;

  SELECT COALESCE(jsonb_object_agg(entry.key, entry.value), '{}'::JSONB)
  INTO v_filtered
  FROM jsonb_each(v_safe) entry
  WHERE entry.key = ANY(v_allowed_keys);

  RETURN v_filtered;
END;
$$;

ALTER FUNCTION public.sanitize_professional_audit_metadata(TEXT, TEXT, JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sanitize_professional_audit_metadata(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sanitize_professional_audit_log_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_professional_audit_event_allowed(NEW.entity_type, NEW.action) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PROFESSIONAL_AUDIT_EVENT_INVALID';
  END IF;
  NEW.metadata := public.sanitize_professional_audit_metadata(
    NEW.entity_type,
    NEW.action,
    NEW.metadata
  );
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.sanitize_professional_audit_log_insert() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sanitize_professional_audit_log_insert() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS sanitize_professional_audit_log_insert ON public.professional_audit_logs;
CREATE TRIGGER sanitize_professional_audit_log_insert
  BEFORE INSERT ON public.professional_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.sanitize_professional_audit_log_insert();

-- Migration 041-043 historically stored reasons and revision summaries. Do
-- this one-time redaction before installing the mutation guard. On rerun the
-- WHERE clause is empty, so the already-installed guard remains effective.
UPDATE public.professional_audit_logs
SET entity_type = CASE
      WHEN public.is_professional_audit_event_allowed(entity_type, action)
        THEN entity_type ELSE 'professional_audit' END,
    action = CASE
      WHEN public.is_professional_audit_event_allowed(entity_type, action)
        THEN action ELSE 'legacy_event_redacted' END,
    metadata = public.sanitize_professional_audit_metadata(entity_type, action, metadata)
WHERE NOT public.is_professional_audit_event_allowed(entity_type, action)
   OR metadata IS DISTINCT FROM public.sanitize_professional_audit_metadata(entity_type, action, metadata);

CREATE OR REPLACE FUNCTION public.reject_professional_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'PROFESSIONAL_AUDIT_APPEND_ONLY';
END;
$$;

ALTER FUNCTION public.reject_professional_audit_log_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reject_professional_audit_log_mutation() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS reject_professional_audit_log_mutation ON public.professional_audit_logs;
CREATE TRIGGER reject_professional_audit_log_mutation
  BEFORE UPDATE OR DELETE ON public.professional_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.reject_professional_audit_log_mutation();

DROP TRIGGER IF EXISTS reject_professional_audit_log_truncate ON public.professional_audit_logs;
CREATE TRIGGER reject_professional_audit_log_truncate
  BEFORE TRUNCATE ON public.professional_audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_professional_audit_log_mutation();

CREATE OR REPLACE FUNCTION public.audit_applicant_trainer_application_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_subject_user_id UUID;
  v_application_kind TEXT;
  v_profile_id UUID;
BEGIN
  SELECT application.user_id, application.application_kind
  INTO v_subject_user_id, v_application_kind
  FROM public.trainer_applications application
  WHERE application.id = NEW.application_id;

  IF NEW.actor_role = 'applicant'
    AND auth.role() IS NOT DISTINCT FROM 'authenticated'
    AND auth.uid() IS NOT NULL
    AND NEW.actor_user_id = auth.uid()
    AND v_subject_user_id = auth.uid()
  THEN
    INSERT INTO public.professional_audit_logs (
      actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
    ) VALUES (
      NEW.actor_user_id, v_subject_user_id, 'trainer_application', NEW.application_id,
      'application_' || NEW.to_status,
      jsonb_strip_nulls(jsonb_build_object(
        'event_id', NEW.id,
        'fromStatus', NEW.from_status,
        'toStatus', NEW.to_status
      ))
    );
  ELSIF NEW.actor_role = 'admin'
    AND NEW.to_status = 'approved'
    AND NEW.actor_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles admin_profile
      WHERE admin_profile.id = NEW.actor_user_id
        AND admin_profile.is_admin = TRUE
        AND admin_profile.account_status = 'active'
    )
  THEN
    SELECT profile.id INTO v_profile_id
    FROM public.trainer_profiles profile
    WHERE profile.user_id = v_subject_user_id
      AND profile.source_application_id = NEW.application_id;

    IF v_profile_id IS NOT NULL THEN
      INSERT INTO public.professional_audit_logs (
        actor_user_id, subject_user_id, entity_type, entity_id, action,
        metadata
      ) VALUES (
        NEW.actor_user_id, v_subject_user_id, 'trainer_profile', v_profile_id,
        CASE WHEN v_application_kind = 'initial' THEN 'profile_created' ELSE 'profile_updated' END,
        jsonb_build_object('applicationId', NEW.application_id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.audit_applicant_trainer_application_event() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.audit_applicant_trainer_application_event() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS audit_applicant_trainer_application_event ON public.trainer_application_events;
CREATE TRIGGER audit_applicant_trainer_application_event
  AFTER INSERT ON public.trainer_application_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_applicant_trainer_application_event();

CREATE OR REPLACE FUNCTION public.audit_trainer_application_draft_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'authenticated'
    OR auth.uid() IS NULL
    OR NEW.user_id <> auth.uid()
    OR NEW.status NOT IN ('draft', 'changes_requested')
    OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status)
  THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.professional_audit_logs (
    actor_user_id, subject_user_id, entity_type, entity_id, action
  ) VALUES (
    auth.uid(), NEW.user_id, 'trainer_application', NEW.id, 'application_draft_saved'
  );
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.audit_trainer_application_draft_change() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.audit_trainer_application_draft_change() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS audit_trainer_application_draft_change ON public.trainer_applications;
CREATE TRIGGER audit_trainer_application_draft_change
  AFTER INSERT OR UPDATE ON public.trainer_applications
  FOR EACH ROW EXECUTE FUNCTION public.audit_trainer_application_draft_change();

CREATE OR REPLACE FUNCTION public.audit_trainer_owned_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_user_id UUID := auth.uid();
  v_subject_user_id UUID;
  v_entity_id UUID;
  v_entity_type TEXT;
  v_action TEXT;
  v_row JSONB;
  v_old JSONB;
BEGIN
  IF auth.role() <> 'authenticated' OR v_actor_user_id IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_old := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::JSONB END;

  IF TG_TABLE_NAME = 'trainer_profiles' THEN
    v_entity_id := (v_row ->> 'id')::UUID;
    v_subject_user_id := (v_row ->> 'user_id')::UUID;
    v_entity_type := 'trainer_profile';
    v_action := CASE
      WHEN TG_OP = 'INSERT' THEN 'profile_created'
      WHEN TG_OP = 'DELETE' THEN 'profile_deleted'
      WHEN v_old ->> 'status' IS DISTINCT FROM v_row ->> 'status' THEN 'profile_status_changed'
      ELSE 'profile_updated'
    END;
  ELSIF TG_TABLE_NAME = 'trainer_service_offerings' THEN
    v_entity_id := (v_row ->> 'id')::UUID;
    SELECT profile.user_id INTO v_subject_user_id
    FROM public.trainer_profiles profile
    WHERE profile.id = (v_row ->> 'trainer_profile_id')::UUID;
    v_entity_type := 'trainer_service';
    v_action := CASE
      WHEN TG_OP = 'INSERT' THEN 'service_created'
      WHEN TG_OP = 'DELETE' THEN 'service_deleted'
      WHEN v_old ->> 'is_active' IS DISTINCT FROM v_row ->> 'is_active'
        THEN CASE WHEN (v_row ->> 'is_active')::BOOLEAN THEN 'service_activated' ELSE 'service_deactivated' END
      ELSE 'service_updated'
    END;
  ELSIF TG_TABLE_NAME = 'trainer_program_templates' THEN
    v_entity_id := (v_row ->> 'id')::UUID;
    v_subject_user_id := (v_row ->> 'trainer_user_id')::UUID;
    v_entity_type := 'trainer_program_template';
    v_action := CASE
      WHEN TG_OP = 'INSERT' THEN 'template_created'
      WHEN TG_OP = 'DELETE' THEN 'template_deleted'
      WHEN v_old ->> 'status' IS DISTINCT FROM v_row ->> 'status' AND v_row ->> 'status' = 'archived'
        THEN 'template_archived'
      ELSE 'template_updated'
    END;
  ELSIF TG_TABLE_NAME = 'trainer_template_workouts' THEN
    v_entity_id := (v_row ->> 'id')::UUID;
    v_subject_user_id := v_actor_user_id;
    v_entity_type := 'trainer_template_workout';
    v_action := 'template_workout_' || lower(TG_OP);
  ELSIF TG_TABLE_NAME = 'trainer_template_exercises' THEN
    v_entity_id := (v_row ->> 'id')::UUID;
    v_subject_user_id := v_actor_user_id;
    v_entity_type := 'trainer_template_exercise';
    v_action := 'template_exercise_' || lower(TG_OP);
  ELSIF TG_TABLE_NAME = 'trainer_application_credentials' THEN
    IF TG_OP NOT IN ('INSERT', 'DELETE')
      OR (TG_OP = 'DELETE' AND v_row ->> 'credential_type' <> 'link')
    THEN
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    v_entity_id := (v_row ->> 'id')::UUID;
    SELECT application.user_id INTO v_subject_user_id
    FROM public.trainer_applications application
    WHERE application.id = (v_row ->> 'application_id')::UUID;
    v_entity_type := 'trainer_application_credential';
    v_action := CASE WHEN TG_OP = 'INSERT' THEN 'credential_added' ELSE 'credential_removed' END;
  ELSIF TG_TABLE_NAME = 'trainer_credential_storage_cleanup' THEN
    IF v_row ->> 'reason' <> 'user_removal' THEN
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    v_entity_id := (v_row ->> 'credential_id')::UUID;
    v_subject_user_id := (v_row ->> 'user_id')::UUID;
    v_entity_type := 'trainer_application_credential';
    v_action := CASE
      WHEN TG_OP = 'INSERT' THEN 'credential_removal_prepared'
      WHEN TG_OP = 'UPDATE'
        AND (
          v_old ->> 'attempt_count' IS DISTINCT FROM v_row ->> 'attempt_count'
          OR v_old ->> 'last_error' IS DISTINCT FROM v_row ->> 'last_error'
        )
        THEN 'credential_cleanup_failed'
      WHEN TG_OP = 'UPDATE' THEN 'credential_removal_retried'
      ELSE 'credential_removed'
    END;
  ELSE
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF v_subject_user_id = v_actor_user_id AND v_entity_id IS NOT NULL THEN
    INSERT INTO public.professional_audit_logs (
      actor_user_id, subject_user_id, entity_type, entity_id, action
    ) VALUES (
      v_actor_user_id, v_subject_user_id, v_entity_type, v_entity_id, v_action
    );
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

ALTER FUNCTION public.audit_trainer_owned_change() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.audit_trainer_owned_change() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS audit_trainer_owned_change ON public.trainer_profiles;
CREATE TRIGGER audit_trainer_owned_change
  AFTER INSERT OR UPDATE OR DELETE ON public.trainer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_trainer_owned_change();
DROP TRIGGER IF EXISTS audit_trainer_owned_change ON public.trainer_service_offerings;
CREATE TRIGGER audit_trainer_owned_change
  AFTER INSERT OR UPDATE OR DELETE ON public.trainer_service_offerings
  FOR EACH ROW EXECUTE FUNCTION public.audit_trainer_owned_change();
DROP TRIGGER IF EXISTS audit_trainer_owned_change ON public.trainer_program_templates;
CREATE TRIGGER audit_trainer_owned_change
  AFTER INSERT OR UPDATE OR DELETE ON public.trainer_program_templates
  FOR EACH ROW EXECUTE FUNCTION public.audit_trainer_owned_change();
DROP TRIGGER IF EXISTS audit_trainer_owned_change ON public.trainer_template_workouts;
CREATE TRIGGER audit_trainer_owned_change
  AFTER INSERT OR UPDATE OR DELETE ON public.trainer_template_workouts
  FOR EACH ROW EXECUTE FUNCTION public.audit_trainer_owned_change();
DROP TRIGGER IF EXISTS audit_trainer_owned_change ON public.trainer_template_exercises;
CREATE TRIGGER audit_trainer_owned_change
  AFTER INSERT OR UPDATE OR DELETE ON public.trainer_template_exercises
  FOR EACH ROW EXECUTE FUNCTION public.audit_trainer_owned_change();
DROP TRIGGER IF EXISTS audit_trainer_owned_change ON public.trainer_application_credentials;
CREATE TRIGGER audit_trainer_owned_change
  AFTER INSERT OR DELETE ON public.trainer_application_credentials
  FOR EACH ROW EXECUTE FUNCTION public.audit_trainer_owned_change();
DROP TRIGGER IF EXISTS audit_trainer_owned_change ON public.trainer_credential_storage_cleanup;
CREATE TRIGGER audit_trainer_owned_change
  AFTER INSERT OR UPDATE OR DELETE ON public.trainer_credential_storage_cleanup
  FOR EACH ROW EXECUTE FUNCTION public.audit_trainer_owned_change();

CREATE OR REPLACE FUNCTION public.audit_coaching_materialization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trainer_user_id UUID;
BEGIN
  IF auth.role() <> 'authenticated' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'coaching_relationships' THEN
    INSERT INTO public.professional_audit_logs (
      actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
    ) VALUES (
      auth.uid(), NEW.client_user_id, 'coaching_relationship', NEW.id,
      'relationship_created', jsonb_build_object('service_id', NEW.service_id)
    );
  ELSIF TG_TABLE_NAME = 'coaching_consents' AND NEW.scope = 'training_profile' THEN
    SELECT relationship.trainer_user_id INTO v_trainer_user_id
    FROM public.coaching_relationships relationship
    WHERE relationship.id = NEW.relationship_id;
    INSERT INTO public.professional_audit_logs (
      actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
    ) VALUES (
      NEW.granted_by, v_trainer_user_id, 'coaching_relationship', NEW.relationship_id,
      'training_profile_consent_granted',
      jsonb_build_object('text_version', NEW.text_version, 'scope', NEW.scope)
    );
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.audit_coaching_materialization() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.audit_coaching_materialization() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS audit_coaching_materialization ON public.coaching_relationships;
CREATE TRIGGER audit_coaching_materialization
  AFTER INSERT ON public.coaching_relationships
  FOR EACH ROW EXECUTE FUNCTION public.audit_coaching_materialization();
DROP TRIGGER IF EXISTS audit_coaching_materialization ON public.coaching_consents;
CREATE TRIGGER audit_coaching_materialization
  AFTER INSERT ON public.coaching_consents
  FOR EACH ROW EXECUTE FUNCTION public.audit_coaching_materialization();

CREATE OR REPLACE FUNCTION public.audit_trainer_assignment_freeze()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'frozen' AND NEW.status = 'frozen' THEN
    INSERT INTO public.professional_audit_logs (
      actor_user_id, subject_user_id, entity_type, entity_id, action,
      metadata
    ) VALUES (
      auth.uid(), NEW.client_user_id, 'trainer_plan_assignment', NEW.id,
      'assignment_frozen', jsonb_build_object('relationship_id', NEW.relationship_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.audit_trainer_assignment_freeze() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.audit_trainer_assignment_freeze() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS audit_trainer_assignment_freeze ON public.trainer_plan_assignments;
CREATE TRIGGER audit_trainer_assignment_freeze
  AFTER UPDATE ON public.trainer_plan_assignments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trainer_assignment_freeze();

REVOKE ALL ON TABLE public.professional_audit_logs FROM service_role;
GRANT SELECT, INSERT ON TABLE public.professional_audit_logs TO service_role;

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

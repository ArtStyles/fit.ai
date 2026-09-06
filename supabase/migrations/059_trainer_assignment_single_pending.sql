BEGIN;

-- Forward-only repair: proposals are serialized in the same client -> trainer
-- advisory-lock order as the existing relationship and suspension transitions.
-- Exact-key retries return before the client-wide proposed/active guards.
CREATE OR REPLACE FUNCTION public.propose_trainer_assignment(
  p_relationship_id UUID,
  p_template_id UUID,
  p_change_summary TEXT,
  p_idempotency_key TEXT
)
RETURNS TABLE (assignment_id UUID, assignment_version_id UUID, workout_plan_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trainer_user_id UUID := auth.uid();
  v_client_user_id UUID;
  v_relationship public.coaching_relationships%ROWTYPE;
  v_template public.trainer_program_templates%ROWTYPE;
  v_assignment_id UUID;
  v_assignment_version_id UUID;
  v_workout_plan_id UUID;
  v_snapshot JSONB;
  v_snapshot_workouts JSONB;
  v_workout JSONB;
  v_exercise JSONB;
  v_materialized_workout_id UUID;
  v_workout_count INTEGER;
  v_exercise_count INTEGER;
BEGIN
  IF v_trainer_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_relationship_id IS NULL OR p_template_id IS NULL
    OR NULLIF(BTRIM(COALESCE(p_idempotency_key, '')), '') IS NULL THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_PROPOSAL_INVALID';
  END IF;
  IF char_length(BTRIM(p_idempotency_key)) > 200
    OR (p_change_summary IS NOT NULL AND char_length(BTRIM(p_change_summary)) > 1000) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_PROPOSAL_INVALID';
  END IF;

  -- Acquire the client lock before any mutable relationship state. This is the
  -- same lock order as acceptance/end flows and serializes proposals per client.
  SELECT relationship.client_user_id INTO v_client_user_id
  FROM public.coaching_relationships relationship
  WHERE relationship.id = p_relationship_id;
  IF v_client_user_id IS NULL THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_FOUND';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_client_user_id::TEXT, 0));
  -- This is the exact administrative suspension lock. Revalidate every
  -- trainer/relationship row only after it has been acquired.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_trainer_user_id::TEXT, 0));

  SELECT * INTO v_relationship
  FROM public.coaching_relationships relationship
  WHERE relationship.id = p_relationship_id
    AND relationship.trainer_user_id = v_trainer_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_relationship.status <> 'active' THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE';
  END IF;
  IF v_relationship.client_user_id <> v_client_user_id THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_FOUND';
  END IF;

  PERFORM 1 FROM public.profiles profile
  WHERE profile.id = v_trainer_user_id AND profile.account_status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TRAINER_INACTIVE'; END IF;
  PERFORM 1 FROM public.trainer_profiles profile
  WHERE profile.user_id = v_trainer_user_id AND profile.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TRAINER_INACTIVE'; END IF;
  PERFORM 1 FROM public.profiles profile
  WHERE profile.id = v_client_user_id AND profile.account_status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_CLIENT_INACTIVE'; END IF;

  -- Return the original complete materialization for a retried request.
  SELECT assignment.id, version.id, version.materialized_plan_id
  INTO v_assignment_id, v_assignment_version_id, v_workout_plan_id
  FROM public.trainer_plan_assignments assignment
  JOIN public.trainer_assignment_versions version
    ON version.assignment_id = assignment.id AND version.version_number = 1
  WHERE assignment.trainer_user_id = v_trainer_user_id
    AND assignment.proposal_idempotency_key = BTRIM(p_idempotency_key)
  FOR UPDATE OF assignment, version;
  IF FOUND THEN
    RETURN QUERY SELECT v_assignment_id, v_assignment_version_id, v_workout_plan_id;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.coaching_consents consent
    WHERE consent.relationship_id = v_relationship.id
      AND consent.scope = 'training_profile'
      AND consent.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_CONSENT_REQUIRED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.trainer_plan_assignments assignment
    WHERE assignment.client_user_id = v_client_user_id AND assignment.status = 'active'
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_ACTIVE_EXISTS';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.trainer_plan_assignments assignment
    WHERE assignment.client_user_id = v_client_user_id AND assignment.status = 'proposed'
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_PROPOSAL_EXISTS';
  END IF;

  SELECT * INTO v_template
  FROM public.trainer_program_templates template
  WHERE template.id = p_template_id
    AND template.trainer_user_id = v_trainer_user_id
    AND template.status <> 'archived'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TEMPLATE_NOT_AVAILABLE'; END IF;

  SELECT COUNT(*)::INTEGER INTO v_workout_count
  FROM public.trainer_template_workouts workout
  WHERE workout.template_id = v_template.id;
  IF v_workout_count <> v_template.days_per_week THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TEMPLATE_INCOMPLETE';
  END IF;
  SELECT COUNT(*)::INTEGER INTO v_exercise_count
  FROM public.trainer_template_exercises exercise
  JOIN public.trainer_template_workouts workout ON workout.id = exercise.template_workout_id
  JOIN public.exercises catalog ON catalog.id = exercise.exercise_id AND catalog.is_public = TRUE
  WHERE workout.template_id = v_template.id;
  IF v_exercise_count = 0 OR EXISTS (
    SELECT 1
    FROM public.trainer_template_workouts workout
    WHERE workout.template_id = v_template.id
      AND NOT EXISTS (SELECT 1 FROM public.trainer_template_exercises exercise WHERE exercise.template_workout_id = workout.id)
  ) OR EXISTS (
    SELECT 1
    FROM public.trainer_template_exercises exercise
    JOIN public.trainer_template_workouts workout ON workout.id = exercise.template_workout_id
    LEFT JOIN public.exercises catalog ON catalog.id = exercise.exercise_id AND catalog.is_public = TRUE
    WHERE workout.template_id = v_template.id AND catalog.id IS NULL
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TEMPLATE_INCOMPLETE';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'sourceTemplateWorkoutId', row.id,
      'name', row.name,
      'dayOfWeek', row.day_of_week,
      'orderInPlan', row.order_in_plan,
      'exercises', row.exercises
    ) ORDER BY row.day_of_week, row.order_in_plan, row.id
  ) INTO v_snapshot_workouts
  FROM (
    SELECT workout.id, workout.name, workout.day_of_week, workout.order_in_plan,
      jsonb_agg(jsonb_build_object(
        'sourceTemplateExerciseId', exercise.id,
        'exerciseId', exercise.exercise_id,
        'orderIndex', exercise.order_index,
        'sets', exercise.sets,
        'reps', exercise.reps,
        'weightKg', exercise.weight_kg,
        'targetRpe', exercise.target_rpe,
        'restSeconds', exercise.rest_seconds,
        'notes', exercise.notes
      ) ORDER BY exercise.order_index, exercise.id) AS exercises
    FROM public.trainer_template_workouts workout
    JOIN public.trainer_template_exercises exercise ON exercise.template_workout_id = workout.id
    WHERE workout.template_id = v_template.id
    GROUP BY workout.id, workout.name, workout.day_of_week, workout.order_in_plan
  ) AS row;
  v_snapshot := jsonb_build_object(
    'schemaVersion', 1,
    'name', v_template.name,
    'goal', v_template.goal,
    'description', v_template.description,
    'daysPerWeek', v_template.days_per_week,
    'workouts', v_snapshot_workouts
  );

  INSERT INTO public.trainer_plan_assignments (
    relationship_id, trainer_user_id, client_user_id, source_template_id, status, proposal_idempotency_key
  ) VALUES (
    v_relationship.id, v_trainer_user_id, v_client_user_id, v_template.id, 'proposed', BTRIM(p_idempotency_key)
  ) RETURNING id INTO v_assignment_id;
  INSERT INTO public.trainer_assignment_versions (
    assignment_id, version_number, snapshot, change_summary, status
  ) VALUES (
    v_assignment_id, 1, v_snapshot, NULLIF(BTRIM(p_change_summary), ''), 'proposed'
  ) RETURNING id INTO v_assignment_version_id;
  INSERT INTO public.workout_plans (
    user_id, name, goal, duration_weeks, days_per_week, is_active,
    generated_by_ai, plan_context, source_type, family_id, library_slot,
    trainer_relationship_id, trainer_assignment_id, trainer_assignment_version_id, prescription_locked
  ) VALUES (
    v_client_user_id, v_template.name, v_template.goal, 1, v_template.days_per_week, FALSE,
    FALSE, 'first_plan', 'trainer_assigned', gen_random_uuid(), 'professional',
    v_relationship.id, v_assignment_id, v_assignment_version_id, TRUE
  ) RETURNING id INTO v_workout_plan_id;

  PERFORM set_config('app.trainer_prescription_mutation', 'authorized', TRUE);

  FOR v_workout IN SELECT value FROM jsonb_array_elements(v_snapshot->'workouts')
  LOOP
    INSERT INTO public.workouts (user_id, plan_id, name, day_of_week, order_in_plan)
    VALUES (
      v_client_user_id, v_workout_plan_id, v_workout->>'name', NULLIF(v_workout->>'dayOfWeek', '')::INTEGER,
      NULLIF(v_workout->>'orderInPlan', '')::INTEGER
    ) RETURNING id INTO v_materialized_workout_id;
    FOR v_exercise IN SELECT value FROM jsonb_array_elements(v_workout->'exercises')
    LOOP
      INSERT INTO public.workout_exercises (
        workout_id, exercise_id, order_index, sets, reps, rest_seconds, weight_kg, target_rpe, notes
      ) VALUES (
        v_materialized_workout_id, (v_exercise->>'exerciseId')::UUID,
        (v_exercise->>'orderIndex')::INTEGER, (v_exercise->>'sets')::INTEGER,
        (v_exercise->>'reps')::INTEGER, (v_exercise->>'restSeconds')::INTEGER,
        NULLIF(v_exercise->>'weightKg', '')::NUMERIC,
        NULLIF(v_exercise->>'targetRpe', '')::NUMERIC, NULLIF(v_exercise->>'notes', '')
      );
    END LOOP;
  END LOOP;
  UPDATE public.trainer_assignment_versions
  SET materialized_plan_id = v_workout_plan_id
  WHERE id = v_assignment_version_id;

  INSERT INTO public.professional_audit_logs (
    actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
  ) VALUES (
    v_trainer_user_id, v_client_user_id, 'trainer_plan_assignment', v_assignment_id,
    'proposed', jsonb_build_object('relationship_id', v_relationship.id, 'version_number', 1)
  );
  PERFORM public.create_product_notification(
    v_client_user_id, 'coaching_assignment_status', 'Nueva rutina profesional',
    'Tu entrenador te envió una rutina para revisar.', '/coaching',
    'coaching-assignment-proposed:' || v_assignment_id::TEXT,
    jsonb_build_object('assignment_id', v_assignment_id, 'version_number', 1)
  );

  RETURN QUERY SELECT v_assignment_id, v_assignment_version_id, v_workout_plan_id;
END;
$$;
ALTER FUNCTION public.propose_trainer_assignment(UUID, UUID, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.propose_trainer_assignment(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role CASCADE;
GRANT EXECUTE ON FUNCTION public.propose_trainer_assignment(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trainer_security_preflight()
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF to_regprocedure('public.prepare_trainer_credential_removal(uuid,uuid)') IS NULL
    OR to_regprocedure('public.accept_coaching_request(uuid,uuid)') IS NULL
    OR to_regprocedure('public.end_coaching_relationship(uuid,text,uuid)') IS NULL
    OR to_regprocedure('public.propose_trainer_assignment(uuid,uuid,text,text)') IS NULL
    OR to_regprocedure('public.accept_trainer_assignment(uuid,text)') IS NULL
    OR to_regprocedure('public.publish_trainer_assignment_revision(uuid,uuid,text,text)') IS NULL
    OR to_regprocedure('public.decline_trainer_assignment(uuid,text,text)') IS NULL
    OR to_regprocedure('public.grant_training_profile_consent(uuid,text,uuid)') IS NULL
    OR to_regprocedure('public.get_coach_clients_summary()') IS NULL
    OR to_regprocedure('public.get_coach_client_insights(uuid,date,date)') IS NULL
    OR to_regprocedure('public.snapshot_admin_audit_identity()') IS NULL
    OR to_regprocedure('public.reactivate_and_reinstate_trainer(uuid,uuid)') IS NULL
    OR to_regprocedure('public.cleanup_trainer_security_e2e_fixture(text,uuid[])') IS NULL
    OR to_regprocedure('public.release_session_authorization(uuid,uuid)') IS NULL
    OR to_regprocedure('public.enforce_trainer_workout_iso_schedule()') IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM pg_trigger trigger_row
      WHERE trigger_row.tgrelid = 'public.workouts'::regclass
        AND trigger_row.tgname = 'trg_enforce_trainer_workout_iso_schedule'
        AND trigger_row.tgenabled = 'O'
        AND NOT trigger_row.tgisinternal
    ) THEN
    RAISE EXCEPTION 'TRAINER_SECURITY_SCHEMA_INCOMPLETE';
  END IF;

  IF to_regprocedure('public.append_trainer_template_exercises(uuid,jsonb)') IS NULL
    OR has_function_privilege('anon', 'public.propose_trainer_assignment(uuid,uuid,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.propose_trainer_assignment(uuid,uuid,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.propose_trainer_assignment(uuid,uuid,text,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.append_trainer_template_exercises(uuid,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.append_trainer_template_exercises(uuid,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.append_trainer_template_exercises(uuid,jsonb)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.decline_trainer_assignment(uuid,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.decline_trainer_assignment(uuid,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.decline_trainer_assignment(uuid,text,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.grant_training_profile_consent(uuid,text,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.grant_training_profile_consent(uuid,text,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.grant_training_profile_consent(uuid,text,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.trainer_security_preflight()', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.trainer_security_preflight()', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.trainer_security_preflight()', 'EXECUTE')
    OR NOT public.is_professional_audit_event_allowed('trainer_plan_assignment', 'declined')
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc procedure
      JOIN pg_language procedure_language ON procedure_language.oid = procedure.prolang
      JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
      WHERE procedure.oid = 'public.is_professional_audit_event_allowed(text,text)'::REGPROCEDURE
        AND procedure_language.lanname = 'sql'
        AND procedure.prokind = 'f'
        AND procedure.provolatile = 'i'
        AND NOT procedure.prosecdef
        AND procedure.proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]
        AND owner_role.rolname = 'postgres'
        AND btrim(procedure.prosrc) = btrim($audit_event_allowlist$
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
      'proposed', 'accepted', 'revision_published', 'assignment_frozen', 'declined'
    )
    ELSE FALSE
  END, FALSE)
        $audit_event_allowlist$)
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc procedure
      JOIN pg_language procedure_language ON procedure_language.oid = procedure.prolang
      JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
      WHERE procedure.oid = 'public.propose_trainer_assignment(uuid,uuid,text,text)'::REGPROCEDURE
        AND procedure_language.lanname = 'plpgsql'
        AND procedure.prokind = 'f'
        AND procedure.provolatile = 'v'
        AND procedure.prorettype = 'record'::REGTYPE
        AND procedure.prosecdef
        AND procedure.proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]
        AND owner_role.rolname = 'postgres'
        AND procedure.proallargtypes = ARRAY[
          'uuid'::REGTYPE::OID,
          'uuid'::REGTYPE::OID,
          'text'::REGTYPE::OID,
          'text'::REGTYPE::OID,
          'uuid'::REGTYPE::OID,
          'uuid'::REGTYPE::OID,
          'uuid'::REGTYPE::OID
        ]
        AND procedure.proargmodes = ARRAY[
          'i'::"char",
          'i'::"char",
          'i'::"char",
          'i'::"char",
          't'::"char",
          't'::"char",
          't'::"char"
        ]
        AND procedure.proargnames = ARRAY[
          'p_relationship_id',
          'p_template_id',
          'p_change_summary',
          'p_idempotency_key',
          'assignment_id',
          'assignment_version_id',
          'workout_plan_id'
        ]::TEXT[]
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc procedure
      JOIN pg_language procedure_language ON procedure_language.oid = procedure.prolang
      JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
      WHERE procedure.oid = 'public.append_trainer_template_exercises(uuid,jsonb)'::REGPROCEDURE
        AND procedure_language.lanname = 'plpgsql'
        AND procedure.prokind = 'f'
        AND procedure.provolatile = 'v'
        AND procedure.prorettype = 'jsonb'::REGTYPE
        AND procedure.prosecdef
        AND procedure.proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]
        AND owner_role.rolname = 'postgres'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc procedure
      JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
      WHERE procedure.oid = 'public.decline_trainer_assignment(uuid,text,text)'::REGPROCEDURE
        AND procedure.prosecdef
        AND procedure.proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]
        AND owner_role.rolname = 'postgres'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc procedure
      JOIN pg_language procedure_language ON procedure_language.oid = procedure.prolang
      JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
      WHERE procedure.oid = 'public.grant_training_profile_consent(uuid,text,uuid)'::REGPROCEDURE
        AND procedure_language.lanname = 'plpgsql'
        AND procedure.prokind = 'f'
        AND procedure.provolatile = 'v'
        AND procedure.prorettype = 'record'::REGTYPE
        AND procedure.prosecdef
        AND procedure.proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]
        AND owner_role.rolname = 'postgres'
        AND procedure.proallargtypes = ARRAY[
          'uuid'::REGTYPE::OID,
          'text'::REGTYPE::OID,
          'uuid'::REGTYPE::OID,
          'uuid'::REGTYPE::OID,
          'boolean'::REGTYPE::OID
        ]
        AND procedure.proargmodes = ARRAY[
          'i'::"char",
          'i'::"char",
          'i'::"char",
          't'::"char",
          't'::"char"
        ]
        AND procedure.proargnames = ARRAY[
          'p_relationship_id',
          'p_consent_version',
          'p_idempotency_key',
          'relationship_id',
          'changed'
        ]::TEXT[]
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc procedure
      JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
      WHERE procedure.oid = 'public.trainer_security_preflight()'::REGPROCEDURE
        AND procedure.prosecdef
        AND procedure.proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]
        AND owner_role.rolname = 'postgres'
    )
    OR EXISTS (
      SELECT 1
      FROM pg_proc procedure
      CROSS JOIN LATERAL aclexplode(
        COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
      ) expanded_acl
      LEFT JOIN pg_roles grantee_role ON grantee_role.oid = expanded_acl.grantee
      WHERE procedure.oid IN (
          'public.is_professional_audit_event_allowed(text,text)'::REGPROCEDURE,
          'public.propose_trainer_assignment(uuid,uuid,text,text)'::REGPROCEDURE,
          'public.append_trainer_template_exercises(uuid,jsonb)'::REGPROCEDURE,
          'public.decline_trainer_assignment(uuid,text,text)'::REGPROCEDURE,
          'public.grant_training_profile_consent(uuid,text,uuid)'::REGPROCEDURE,
          'public.trainer_security_preflight()'::REGPROCEDURE
        )
        AND expanded_acl.privilege_type = 'EXECUTE'
        AND expanded_acl.grantee <> procedure.proowner
        AND (
          procedure.oid = 'public.is_professional_audit_event_allowed(text,text)'::REGPROCEDURE
          OR (
            procedure.oid IN (
              'public.propose_trainer_assignment(uuid,uuid,text,text)'::REGPROCEDURE,
              'public.append_trainer_template_exercises(uuid,jsonb)'::REGPROCEDURE,
              'public.decline_trainer_assignment(uuid,text,text)'::REGPROCEDURE,
              'public.grant_training_profile_consent(uuid,text,uuid)'::REGPROCEDURE,
              'public.trainer_security_preflight()'::REGPROCEDURE
            )
            AND (
              expanded_acl.is_grantable
              OR expanded_acl.grantee = 0
              OR grantee_role.rolname IS NULL
              OR grantee_role.rolname NOT IN ('authenticated', 'service_role')
            )
          )
        )
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_attribute column_row
      WHERE column_row.attrelid = 'public.trainer_plan_assignments'::REGCLASS
        AND column_row.attname = 'decline_idempotency_key'
        AND column_row.atttypid = 'text'::REGTYPE
        AND NOT column_row.attnotnull
        AND NOT column_row.atthasdef
        AND column_row.attidentity = ''
        AND column_row.attgenerated = ''
        AND NOT column_row.attisdropped
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint constraint_row
      WHERE constraint_row.conrelid = 'public.trainer_plan_assignments'::REGCLASS
        AND constraint_row.conname = 'trainer_plan_assignments_decline_idempotency_key_check'
        AND constraint_row.contype = 'c'
        AND constraint_row.convalidated
        AND pg_get_expr(constraint_row.conbin, constraint_row.conrelid) =
          '((decline_idempotency_key IS NULL) OR ((char_length(btrim(decline_idempotency_key)) >= 1) AND (char_length(btrim(decline_idempotency_key)) <= 200)))'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_class index_row
      JOIN pg_namespace namespace_row ON namespace_row.oid = index_row.relnamespace
      JOIN pg_index index_definition ON index_definition.indexrelid = index_row.oid
      JOIN pg_attribute client_column
        ON client_column.attrelid = index_definition.indrelid
       AND client_column.attname = 'client_user_id'
       AND NOT client_column.attisdropped
      JOIN pg_attribute decline_column
        ON decline_column.attrelid = index_definition.indrelid
       AND decline_column.attname = 'decline_idempotency_key'
       AND NOT decline_column.attisdropped
      WHERE namespace_row.nspname = 'public'
        AND index_row.relname = 'trainer_plan_assignments_decline_idempotency_unique'
        AND index_definition.indrelid = 'public.trainer_plan_assignments'::REGCLASS
        AND index_definition.indnkeyatts = 2
        AND index_definition.indnatts = 2
        AND index_definition.indexprs IS NULL
        AND index_definition.indkey[0] = client_column.attnum
        AND index_definition.indkey[1] = decline_column.attnum
        AND index_definition.indisunique
        AND index_definition.indisvalid
        AND index_definition.indisready
        AND index_definition.indislive
        AND index_definition.indpred IS NOT NULL
        AND pg_get_expr(index_definition.indpred, index_definition.indrelid) = '(decline_idempotency_key IS NOT NULL)'
    )
  THEN
    RAISE EXCEPTION 'TRAINER_SECURITY_PREFLIGHT_FAILED';
  END IF;

  RETURN 59;
END;
$$;

ALTER FUNCTION public.trainer_security_preflight() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trainer_security_preflight() FROM PUBLIC, anon, authenticated, service_role CASCADE;
GRANT EXECUTE ON FUNCTION public.trainer_security_preflight() TO authenticated, service_role;

COMMIT;

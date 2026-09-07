BEGIN;

CREATE OR REPLACE FUNCTION public.grant_training_profile_consent(
  p_relationship_id UUID,
  p_consent_version TEXT,
  p_idempotency_key UUID
)
RETURNS TABLE (relationship_id UUID, changed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_user_id UUID := auth.uid();
  v_trainer_user_id UUID;
  v_trainer_account public.profiles%ROWTYPE;
  v_trainer_profile public.trainer_profiles%ROWTYPE;
  v_client_account public.profiles%ROWTYPE;
  v_relationship public.coaching_relationships%ROWTYPE;
  v_consent public.coaching_consents%ROWTYPE;
BEGIN
  IF v_client_user_id IS NULL THEN
    RAISE EXCEPTION 'COACHING_AUTH_REQUIRED';
  END IF;
  IF p_relationship_id IS NULL
    OR p_idempotency_key IS NULL
    OR char_length(p_consent_version) NOT BETWEEN 1 AND 160
    OR p_consent_version IS DISTINCT FROM 'training-profile-v1'
  THEN
    RAISE EXCEPTION 'COACHING_CONSENT_INVALID';
  END IF;

  -- Match every client-owned relationship transition before reading account
  -- or relationship state. Administrative client suspension uses this same
  -- namespace before taking its account and relationship row locks.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_client_user_id::TEXT, 0));

  -- This scoped pre-read supplies only the trainer advisory key. All authority
  -- is re-read under the canonical locks below before a state is disclosed.
  SELECT relationship.trainer_user_id
  INTO v_trainer_user_id
  FROM public.coaching_relationships relationship
  WHERE relationship.id = p_relationship_id
    AND relationship.client_user_id = v_client_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE';
  END IF;

  -- Trainer suspension owns this namespace and then locks account, profile,
  -- and relationships in that order. Following it prevents the inverse
  -- relationship -> trainer-account cycle.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_trainer_user_id::TEXT, 0));

  SELECT *
  INTO v_trainer_account
  FROM public.profiles trainer_account
  WHERE trainer_account.id = v_trainer_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_trainer_account.account_status <> 'active' THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE';
  END IF;

  SELECT *
  INTO v_trainer_profile
  FROM public.trainer_profiles trainer_profile
  WHERE trainer_profile.user_id = v_trainer_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_trainer_profile.status <> 'active' THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE';
  END IF;

  SELECT *
  INTO v_client_account
  FROM public.profiles client_account
  WHERE client_account.id = v_client_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_client_account.account_status <> 'active' THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE';
  END IF;

  SELECT *
  INTO v_relationship
  FROM public.coaching_relationships relationship
  WHERE relationship.id = p_relationship_id
    AND relationship.client_user_id = v_client_user_id
    AND relationship.trainer_user_id = v_trainer_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_relationship.status <> 'active' THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE';
  END IF;

  -- The relationship row serializes every grant attempt before inspecting the
  -- partial unique active-scope index. A revoked grant remains immutable; a
  -- recovery always creates a new versioned row.
  SELECT *
  INTO v_consent
  FROM public.coaching_consents consent
  WHERE consent.relationship_id = v_relationship.id
    AND consent.scope = 'training_profile'
    AND consent.revoked_at IS NULL
  FOR UPDATE;
  IF FOUND THEN
    RETURN QUERY SELECT v_relationship.id, FALSE;
    RETURN;
  END IF;

  INSERT INTO public.coaching_consents (
    relationship_id, scope, text_version, granted_by
  ) VALUES (
    v_relationship.id, 'training_profile', p_consent_version, v_client_user_id
  );

  -- Migration 045's AFTER INSERT trigger owns the single
  -- training_profile_consent_granted audit event.
  PERFORM public.create_product_notification(
    v_relationship.trainer_user_id,
    'coaching_training_profile_granted',
    'Autorización confirmada',
    'La persona autorizó consultar sus datos de entrenamiento.',
    '/coach/clients/' || v_client_user_id::TEXT,
    'coaching-training-profile-granted:' || v_relationship.id::TEXT,
    jsonb_build_object(
      'relationship_id', v_relationship.id,
      'client_user_id', v_client_user_id,
      'scope', 'training_profile'
    )
  );

  RETURN QUERY SELECT v_relationship.id, TRUE;
END;
$$;

ALTER FUNCTION public.grant_training_profile_consent(UUID, TEXT, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.grant_training_profile_consent(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated, service_role CASCADE;
GRANT EXECUTE ON FUNCTION public.grant_training_profile_consent(UUID, TEXT, UUID) TO authenticated, service_role;

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

  RETURN 58;
END;
$$;

ALTER FUNCTION public.trainer_security_preflight() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trainer_security_preflight() FROM PUBLIC, anon, authenticated, service_role CASCADE;
GRANT EXECUTE ON FUNCTION public.trainer_security_preflight() TO authenticated, service_role;

COMMIT;

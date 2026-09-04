BEGIN;

ALTER TABLE public.trainer_plan_assignments
  ADD COLUMN IF NOT EXISTS decline_idempotency_key TEXT;

ALTER TABLE public.trainer_plan_assignments
  DROP CONSTRAINT IF EXISTS trainer_plan_assignments_decline_idempotency_key_check;
ALTER TABLE public.trainer_plan_assignments
  ADD CONSTRAINT trainer_plan_assignments_decline_idempotency_key_check
  CHECK (
    decline_idempotency_key IS NULL
    OR char_length(btrim(decline_idempotency_key)) BETWEEN 1 AND 200
  );

CREATE UNIQUE INDEX IF NOT EXISTS trainer_plan_assignments_decline_idempotency_unique
  ON public.trainer_plan_assignments (client_user_id, decline_idempotency_key)
  WHERE decline_idempotency_key IS NOT NULL;

-- Migration 045 deliberately closes this event domain. Extend only the final
-- assignment action list; decline metadata remains the empty object.
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
      'proposed', 'accepted', 'revision_published', 'assignment_frozen', 'declined'
    )
    ELSE FALSE
  END, FALSE)
$$;

ALTER FUNCTION public.is_professional_audit_event_allowed(TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_professional_audit_event_allowed(TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.decline_trainer_assignment(
  p_assignment_id UUID,
  p_reason TEXT,
  p_idempotency_key TEXT
)
RETURNS TABLE (assignment_id UUID, changed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_user_id UUID := auth.uid();
  v_target_client_id UUID;
  v_reason TEXT := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
  v_idempotency_key TEXT := BTRIM(COALESCE(p_idempotency_key, ''));
  v_assignment public.trainer_plan_assignments%ROWTYPE;
  v_version public.trainer_assignment_versions%ROWTYPE;
  v_plan public.workout_plans%ROWTYPE;
BEGIN
  IF v_client_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_assignment_id IS NULL
    OR v_idempotency_key = ''
    OR char_length(v_idempotency_key) > 200
    OR (v_reason IS NOT NULL AND char_length(v_reason) > 500)
  THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_DECLINE_INVALID';
  END IF;

  -- Discovery selects only the advisory-lock namespace. The owned row is
  -- re-read and locked before any state is disclosed or changed.
  SELECT candidate.client_user_id
  INTO v_target_client_id
  FROM public.trainer_plan_assignments candidate
  WHERE candidate.id = p_assignment_id;

  IF v_target_client_id IS NULL OR v_target_client_id <> v_client_user_id THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_NOT_FOUND';
  END IF;

  -- Acceptance takes this same client lock first, so accept-versus-decline has
  -- exactly one winner. Decline needs no relationship or trainer lock because
  -- it is an owning client's terminal safety action.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_client_user_id::TEXT, 0));

  SELECT *
  INTO v_assignment
  FROM public.trainer_plan_assignments candidate
  WHERE candidate.id = p_assignment_id
    AND candidate.client_user_id = v_client_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_NOT_FOUND';
  END IF;

  SELECT *
  INTO v_version
  FROM public.trainer_assignment_versions candidate
  WHERE candidate.assignment_id = v_assignment.id
    AND candidate.version_number = 1
  FOR UPDATE;
  IF NOT FOUND OR v_version.materialized_plan_id IS NULL THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_VERSION_NOT_PROPOSED';
  END IF;

  SELECT *
  INTO v_plan
  FROM public.workout_plans candidate
  WHERE candidate.id = v_version.materialized_plan_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_plan.user_id IS DISTINCT FROM v_client_user_id
    OR v_plan.trainer_relationship_id IS DISTINCT FROM v_assignment.relationship_id
    OR v_plan.trainer_assignment_id IS DISTINCT FROM v_assignment.id
    OR v_plan.trainer_assignment_version_id IS DISTINCT FROM v_version.id
    OR v_plan.source_type IS DISTINCT FROM 'trainer_assigned'
    OR v_plan.library_slot IS DISTINCT FROM 'professional'
    OR v_plan.prescription_locked IS DISTINCT FROM TRUE
  THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_PLAN_INVALID';
  END IF;

  IF v_assignment.status = 'cancelled'
    AND v_assignment.decline_idempotency_key = v_idempotency_key
  THEN
    RETURN QUERY SELECT v_assignment.id, FALSE;
    RETURN;
  END IF;

  IF v_assignment.status <> 'proposed' THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_NOT_PROPOSED';
  END IF;
  IF v_version.status <> 'proposed' THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_VERSION_NOT_PROPOSED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.trainer_plan_assignments existing
    WHERE existing.client_user_id = v_client_user_id
      AND existing.decline_idempotency_key = v_idempotency_key
      AND existing.id <> v_assignment.id
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_DECLINE_IDEMPOTENCY_CONFLICT';
  END IF;

  PERFORM set_config('app.plan_lifecycle_actor', v_client_user_id::TEXT, TRUE);
  PERFORM set_config('app.trainer_prescription_mutation', 'authorized', TRUE);

  UPDATE public.workout_plans
  SET is_active = FALSE
  WHERE id = v_plan.id;

  UPDATE public.trainer_assignment_versions
  SET status = 'cancelled'
  WHERE id = v_version.id;

  BEGIN
    UPDATE public.trainer_plan_assignments
    SET status = 'cancelled',
        decline_idempotency_key = v_idempotency_key,
        updated_at = NOW()
    WHERE id = v_assignment.id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_DECLINE_IDEMPOTENCY_CONFLICT';
  END;

  INSERT INTO public.professional_audit_logs (
    actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
  ) VALUES (
    v_client_user_id,
    v_client_user_id,
    'trainer_plan_assignment',
    v_assignment.id,
    'declined',
    '{}'::JSONB
  );

  PERFORM public.create_product_notification(
    v_assignment.trainer_user_id,
    'coaching_assignment_status',
    'Rutina profesional no aceptada',
    COALESCE(v_reason, 'Tu cliente decidió no aceptar la rutina profesional.'),
    '/coach/programs?clientId=' || v_client_user_id::TEXT,
    'coaching-assignment-declined:' || v_assignment.id::TEXT,
    jsonb_build_object(
      'assignment_id', v_assignment.id,
      'client_user_id', v_client_user_id,
      'relationship_id', v_assignment.relationship_id
    )
  );

  RETURN QUERY SELECT v_assignment.id, TRUE;
END;
$$;

ALTER FUNCTION public.decline_trainer_assignment(UUID, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.decline_trainer_assignment(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_trainer_assignment(UUID, TEXT, TEXT) TO authenticated, service_role;

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
    OR to_regprocedure('public.decline_trainer_assignment(uuid,text,text)') IS NULL
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
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc procedure
      JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
      WHERE procedure.oid = 'public.decline_trainer_assignment(uuid,text,text)'::REGPROCEDURE
        AND procedure.prosecdef
        AND procedure.proconfig @> ARRAY['search_path=public, pg_temp']::TEXT[]
        AND owner_role.rolname = 'postgres'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_attribute column_row
      WHERE column_row.attrelid = 'public.trainer_plan_assignments'::REGCLASS
        AND column_row.attname = 'decline_idempotency_key'
        AND column_row.atttypid = 'text'::REGTYPE
        AND NOT column_row.attnotnull
        AND NOT column_row.attisdropped
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint constraint_row
      WHERE constraint_row.conrelid = 'public.trainer_plan_assignments'::REGCLASS
        AND constraint_row.conname = 'trainer_plan_assignments_decline_idempotency_key_check'
        AND constraint_row.contype = 'c'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_class index_row
      JOIN pg_namespace namespace_row ON namespace_row.oid = index_row.relnamespace
      JOIN pg_index index_definition ON index_definition.indexrelid = index_row.oid
      WHERE namespace_row.nspname = 'public'
        AND index_row.relname = 'trainer_plan_assignments_decline_idempotency_unique'
        AND index_definition.indrelid = 'public.trainer_plan_assignments'::REGCLASS
        AND index_definition.indisunique
        AND index_definition.indpred IS NOT NULL
        AND pg_get_indexdef(index_row.oid) LIKE '%(client_user_id, decline_idempotency_key)%'
    )
  THEN
    RAISE EXCEPTION 'TRAINER_SECURITY_PREFLIGHT_FAILED';
  END IF;

  RETURN 57;
END;
$$;

ALTER FUNCTION public.trainer_security_preflight() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trainer_security_preflight() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trainer_security_preflight() TO authenticated, service_role;

COMMIT;

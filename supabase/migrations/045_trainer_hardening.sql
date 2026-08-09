-- ============================================================
-- Migration 045: trainer authorization hardening
-- ============================================================
-- Client-owned plans and evidence remain owner-only. A trainer receives
-- aggregate/detail data solely through consent-bound SECURITY DEFINER RPCs.

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
  v_expected INTEGER;
  v_matched INTEGER;
  v_deleted INTEGER;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TRAINER_SECURITY_CLEANUP_SERVICE_REQUIRED';
  END IF;
  IF p_run_id IS NULL OR btrim(p_run_id) = '' OR cardinality(p_user_ids) IS NULL OR cardinality(p_user_ids) = 0 THEN
    RAISE EXCEPTION 'TRAINER_SECURITY_CLEANUP_SCOPE_REQUIRED';
  END IF;

  SELECT count(*) INTO v_expected FROM (SELECT DISTINCT unnest(p_user_ids) AS id) target;
  SELECT count(*) INTO v_matched
  FROM auth.users target
  WHERE target.id = ANY(p_user_ids)
    AND target.raw_user_meta_data ->> 'e2e_run_id' = p_run_id;
  IF v_matched <> v_expected THEN
    RAISE EXCEPTION 'TRAINER_SECURITY_CLEANUP_SCOPE_MISMATCH';
  END IF;

  SET CONSTRAINTS ALL DEFERRED;
  PERFORM set_config('app.trainer_prescription_mutation', 'authorized', TRUE);

  DELETE FROM public.session_authorizations lease WHERE lease.user_id = ANY(p_user_ids);
  DELETE FROM public.exercise_logs log USING public.progress_logs progress
    WHERE log.progress_log_id = progress.id AND progress.user_id = ANY(p_user_ids);
  DELETE FROM public.progress_logs progress WHERE progress.user_id = ANY(p_user_ids);
  DELETE FROM public.measurements measurement WHERE measurement.user_id = ANY(p_user_ids);

  UPDATE public.trainer_plan_assignments assignment
  SET active_version_id = NULL
  WHERE assignment.client_user_id = ANY(p_user_ids) OR assignment.trainer_user_id = ANY(p_user_ids);
  UPDATE public.trainer_assignment_versions version
  SET materialized_plan_id = NULL
  WHERE version.assignment_id IN (
    SELECT assignment.id FROM public.trainer_plan_assignments assignment
    WHERE assignment.client_user_id = ANY(p_user_ids) OR assignment.trainer_user_id = ANY(p_user_ids)
  );
  DELETE FROM public.workout_exercises exercise
  WHERE exercise.workout_id IN (
    SELECT workout.id FROM public.workouts workout WHERE workout.user_id = ANY(p_user_ids)
  );
  DELETE FROM public.workouts workout WHERE workout.user_id = ANY(p_user_ids);
  DELETE FROM public.workout_plans plan WHERE plan.user_id = ANY(p_user_ids);
  DELETE FROM public.trainer_assignment_versions version
  WHERE version.assignment_id IN (
    SELECT assignment.id FROM public.trainer_plan_assignments assignment
    WHERE assignment.client_user_id = ANY(p_user_ids) OR assignment.trainer_user_id = ANY(p_user_ids)
  );
  DELETE FROM public.trainer_plan_assignments assignment
  WHERE assignment.client_user_id = ANY(p_user_ids) OR assignment.trainer_user_id = ANY(p_user_ids);
  DELETE FROM public.trainer_program_templates template WHERE template.trainer_user_id = ANY(p_user_ids);

  DELETE FROM public.coaching_consents consent
  WHERE consent.relationship_id IN (
    SELECT relationship.id FROM public.coaching_relationships relationship
    WHERE relationship.client_user_id = ANY(p_user_ids) OR relationship.trainer_user_id = ANY(p_user_ids)
  );
  DELETE FROM public.coaching_relationships relationship
  WHERE relationship.client_user_id = ANY(p_user_ids) OR relationship.trainer_user_id = ANY(p_user_ids);
  DELETE FROM public.coaching_requests request
  WHERE request.client_user_id = ANY(p_user_ids) OR request.trainer_user_id = ANY(p_user_ids);

  DELETE FROM public.trainer_service_offerings service
  WHERE service.trainer_profile_id IN (
    SELECT profile.id FROM public.trainer_profiles profile WHERE profile.user_id = ANY(p_user_ids)
  );
  DELETE FROM public.trainer_profiles profile WHERE profile.user_id = ANY(p_user_ids);
  DELETE FROM public.trainer_applications application WHERE application.user_id = ANY(p_user_ids);

  DELETE FROM public.product_notifications notification WHERE notification.user_id = ANY(p_user_ids);
  DELETE FROM public.product_push_tokens token WHERE token.user_id = ANY(p_user_ids);
  DELETE FROM public.product_notification_preferences preference WHERE preference.user_id = ANY(p_user_ids);
  DELETE FROM public.professional_audit_logs audit
  WHERE audit.actor_user_id = ANY(p_user_ids) OR audit.subject_user_id = ANY(p_user_ids);
  DELETE FROM public.admin_audit_logs audit
  WHERE audit.admin_user_id = ANY(p_user_ids) OR audit.target_user_id = ANY(p_user_ids);

  DELETE FROM auth.users target WHERE target.id = ANY(p_user_ids);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> v_expected THEN RAISE EXCEPTION 'TRAINER_SECURITY_CLEANUP_INCOMPLETE'; END IF;
  RETURN v_deleted;
END;
$$;

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

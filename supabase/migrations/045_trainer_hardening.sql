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

-- Read-only deployment marker used before destructive E2E fixture setup.  A
-- constant SQL function has no table or sequence side effects and distinguishes
-- a complete 045 deployment from a database that stopped at Insights (044).
CREATE OR REPLACE FUNCTION public.trainer_security_preflight()
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$ SELECT 45 $$;

REVOKE ALL ON FUNCTION public.trainer_security_preflight() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trainer_security_preflight() TO authenticated, service_role;

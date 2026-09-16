-- A deleted professional's clients retain their own completed history and exact
-- prescribed routines, archived and locked. They do not retain a live assignment.
BEGIN;

ALTER TABLE public.workout_plans ADD COLUMN IF NOT EXISTS trainer_detached_at timestamptz;
COMMENT ON COLUMN public.workout_plans.trainer_detached_at IS
  'Professional account deleted: archived, locked prescription retained by its client; no live professional relationship.';

CREATE TABLE IF NOT EXISTS private.detached_trainer_prescriptions (
  plan_id uuid PRIMARY KEY REFERENCES public.workout_plans(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object' AND snapshot->>'schemaVersion'='1'),
  detached_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (reason='professional_account_deleted')
);
ALTER TABLE private.detached_trainer_prescriptions OWNER TO postgres;
REVOKE ALL ON private.detached_trainer_prescriptions FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE private.detached_trainer_prescriptions IS
  'Exact original prescription without live trainer identity, retained for the client history until that client/plan is deleted. No direct API access.';

CREATE OR REPLACE FUNCTION public.validate_trainer_assigned_plan_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.trainer_detached_at IS NOT NULL THEN
    IF NEW.source_type <> 'trainer_assigned' OR NEW.library_slot <> 'professional'
      OR NOT NEW.prescription_locked OR NEW.is_active OR NEW.retired_at IS NULL
      OR NEW.trainer_relationship_id IS NOT NULL OR NEW.trainer_assignment_id IS NOT NULL
      OR NEW.trainer_assignment_version_id IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM private.detached_trainer_prescriptions retained
        WHERE retained.plan_id=NEW.id AND retained.detached_at=NEW.trainer_detached_at) THEN
      RAISE EXCEPTION 'TRAINER_ASSIGNED_PLAN_IDENTITY_INVALID';
    END IF;
  ELSIF NEW.source_type='trainer_assigned' THEN
    IF NEW.library_slot <> 'professional' OR NOT NEW.prescription_locked
      OR NEW.trainer_relationship_id IS NULL OR NEW.trainer_assignment_id IS NULL
      OR NEW.trainer_assignment_version_id IS NULL THEN
      RAISE EXCEPTION 'TRAINER_ASSIGNED_PLAN_IDENTITY_INVALID';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.trainer_plan_assignments assignment
      JOIN public.trainer_assignment_versions version
        ON version.id=NEW.trainer_assignment_version_id AND version.assignment_id=assignment.id
        AND version.materialized_plan_id=NEW.id
      JOIN public.coaching_relationships relationship
        ON relationship.id=NEW.trainer_relationship_id AND relationship.id=assignment.relationship_id
      WHERE assignment.id=NEW.trainer_assignment_id AND assignment.client_user_id=NEW.user_id
        AND relationship.client_user_id=NEW.user_id AND relationship.trainer_user_id=assignment.trainer_user_id
    ) THEN RAISE EXCEPTION 'TRAINER_ASSIGNED_PLAN_IDENTITY_INVALID'; END IF;
  ELSIF NEW.library_slot <> 'personal' OR NEW.prescription_locked
    OR NEW.trainer_relationship_id IS NOT NULL OR NEW.trainer_assignment_id IS NOT NULL
    OR NEW.trainer_assignment_version_id IS NOT NULL THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNED_PLAN_IDENTITY_INVALID';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.validate_trainer_assigned_plan_identity() OWNER TO postgres;
DROP TRIGGER IF EXISTS trg_validate_trainer_assigned_plan ON public.workout_plans;
CREATE CONSTRAINT TRIGGER trg_validate_trainer_assigned_plan
AFTER INSERT OR UPDATE OF source_type,library_slot,prescription_locked,trainer_relationship_id,trainer_assignment_id,trainer_assignment_version_id,user_id,trainer_detached_at,is_active,retired_at
ON public.workout_plans DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.validate_trainer_assigned_plan_identity();

CREATE OR REPLACE FUNCTION public.prepare_verified_account_deletion(p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  target_email text;
  assignment_ids uuid[];
  relationship_ids uuid[];
  detached_time timestamptz := clock_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='ACCOUNT_DELETION_SERVICE_REQUIRED';
  END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'ACCOUNT_DELETION_ID_REQUIRED'; END IF;
  -- Auth locks serialize retries; profile locks serialize new relationships and
  -- assignment RPCs. Deadlocks are transaction failures, never partial cleanup.
  SELECT email INTO target_email FROM auth.users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF lower(target_email)='fejames07@gmail.com' THEN RAISE EXCEPTION 'ACCOUNT_DELETION_OWNER_PROTECTED'; END IF;
  PERFORM 1 FROM public.profiles WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SET CONSTRAINTS ALL DEFERRED;
  PERFORM set_config('app.trainer_prescription_mutation','authorized',true);

  SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO relationship_ids FROM (
    SELECT id FROM public.coaching_relationships
    WHERE client_user_id=p_user_id OR trainer_user_id=p_user_id ORDER BY id FOR UPDATE
  ) relationships;
  SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO assignment_ids FROM (
    SELECT id FROM public.trainer_plan_assignments
    WHERE client_user_id=p_user_id OR trainer_user_id=p_user_id ORDER BY id FOR UPDATE
  ) assignments;

  INSERT INTO private.detached_trainer_prescriptions(plan_id,snapshot,detached_at,reason)
  SELECT plan.id,version.snapshot,detached_time,'professional_account_deleted'
  FROM public.workout_plans plan
  JOIN public.trainer_assignment_versions version ON version.id=plan.trainer_assignment_version_id
    AND version.assignment_id=plan.trainer_assignment_id AND version.materialized_plan_id=plan.id
  WHERE plan.trainer_assignment_id=ANY(assignment_ids) AND plan.user_id<>p_user_id;
  UPDATE public.workout_plans SET is_active=false,retired_at=coalesce(retired_at,detached_time),
    trainer_detached_at=detached_time,trainer_relationship_id=NULL,trainer_assignment_id=NULL,trainer_assignment_version_id=NULL
  WHERE trainer_assignment_id=ANY(assignment_ids) AND user_id<>p_user_id;

  DELETE FROM private.trainer_assignment_requests WHERE assignment_id=ANY(assignment_ids) OR trainer_user_id=p_user_id;
  DELETE FROM private.trainer_plan_selection_periods WHERE client_user_id=p_user_id;
  -- Leases for detached plans must not authorize a late session completion.
  DELETE FROM public.session_authorizations WHERE user_id=p_user_id
    OR plan_id IN (SELECT materialized_plan_id FROM public.trainer_assignment_versions WHERE assignment_id=ANY(assignment_ids));
  DELETE FROM public.exercise_logs WHERE progress_log_id IN (SELECT id FROM public.progress_logs WHERE user_id=p_user_id);
  DELETE FROM public.progress_logs WHERE user_id=p_user_id;
  DELETE FROM public.measurements WHERE user_id=p_user_id;
  UPDATE public.trainer_plan_assignments SET active_version_id=NULL WHERE id=ANY(assignment_ids);
  UPDATE public.trainer_assignment_versions SET materialized_plan_id=NULL WHERE assignment_id=ANY(assignment_ids);
  DELETE FROM public.workout_exercises WHERE workout_id IN (SELECT id FROM public.workouts WHERE user_id=p_user_id);
  DELETE FROM public.workouts WHERE user_id=p_user_id;
  DELETE FROM public.workout_plans WHERE user_id=p_user_id;
  DELETE FROM public.trainer_assignment_versions WHERE assignment_id=ANY(assignment_ids);
  DELETE FROM public.trainer_plan_assignments WHERE id=ANY(assignment_ids);
  DELETE FROM public.coaching_consents WHERE relationship_id=ANY(relationship_ids) OR granted_by=p_user_id OR revoked_by=p_user_id;
  DELETE FROM public.coaching_relationships WHERE id=ANY(relationship_ids);
  DELETE FROM public.coaching_requests WHERE client_user_id=p_user_id OR trainer_user_id=p_user_id;
  DELETE FROM public.trainer_program_templates WHERE trainer_user_id=p_user_id;
  DELETE FROM public.trainer_service_offerings WHERE trainer_profile_id IN (SELECT id FROM public.trainer_profiles WHERE user_id=p_user_id);
  DELETE FROM public.trainer_profiles WHERE user_id=p_user_id;
  DELETE FROM public.trainer_applications WHERE user_id=p_user_id;
  DELETE FROM public.ai_usage_logs WHERE user_id=p_user_id;
  DELETE FROM public.plan_generation_events WHERE user_id=p_user_id;
  DELETE FROM public.product_events WHERE user_id=p_user_id;
  DELETE FROM public.profiles WHERE id=p_user_id;
  -- professional_audit_logs intentionally remain immutable, including UUIDs.
  -- Their allowlisted event metadata is security evidence; never promise that
  -- every identifier is anonymized or silently relax the append-only trigger.
END;
$$;
ALTER FUNCTION public.prepare_verified_account_deletion(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prepare_verified_account_deletion(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_verified_account_deletion(uuid) TO service_role;
COMMENT ON FUNCTION public.prepare_verified_account_deletion(uuid) IS
  'Server-only, verified account deletion preparation. Transactionally removes owned data, archives counterpart prescriptions, retains immutable security audit, then caller deletes Auth and Storage separately. Safe to retry.';
COMMIT;

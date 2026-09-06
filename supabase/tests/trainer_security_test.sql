\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS dblink;

CREATE OR REPLACE FUNCTION pg_temp.wait_for_security_lock(
  p_actor_pids INTEGER[],
  p_expected INTEGER
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  FOR attempt IN 1..200 LOOP
    IF (SELECT count(*) FROM pg_stat_activity
        WHERE pid <> pg_backend_pid()
          AND pid = ANY(p_actor_pids)
          AND state = 'active'
          AND wait_event_type = 'Lock') = p_expected THEN
      RETURN;
    END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
  RAISE EXCEPTION 'expected % blocked security actors; observed %', p_expected,
    (SELECT jsonb_agg(jsonb_build_object('pid',pid,'state',state,'wait',wait_event_type,'event',wait_event))
     FROM pg_stat_activity WHERE pid = ANY(p_actor_pids));
END;
$$;

DO $$
BEGIN
  IF public.trainer_security_preflight() <> 59 THEN
    RAISE EXCEPTION 'trainer security preflight returned the wrong migration';
  END IF;
END;
$$;

-- The marker must derive readiness from the catalogs, not merely exist.
BEGIN;
ALTER FUNCTION public.get_coach_client_insights(UUID, DATE, DATE)
  RENAME TO security_missing_get_coach_client_insights;
DO $$
BEGIN
  BEGIN
    PERFORM public.trainer_security_preflight();
    RAISE EXCEPTION 'preflight accepted a missing required routine';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'TRAINER_SECURITY_SCHEMA_INCOMPLETE' THEN RAISE; END IF;
  END;
END;
$$;
ROLLBACK;

-- security_two_trainer_accept_a / security_two_trainer_accept_b are executed
-- by test-trainer-relationships-db.mjs immediately before this supplemental
-- suite. That runner uses two authenticated dblink actors and checks exactly
-- one accepted request, one active relationship, loser cancellation and retry.
-- Keep aliases here so the aggregate security contract names every race.
SELECT 'security_two_trainer_accept_a' AS completed_race_actor
UNION ALL SELECT 'security_two_trainer_accept_b';

-- Shared committed fixture for the idempotent proposal and the
-- accept/publish/suspend race. postgres seeds only the fixture/admin boundary;
-- every operation below runs as an authenticated actor, except the explicit
-- administrative suspension boundary.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('76000000-0000-4000-8000-000000000001', 'security-trainer@example.test', '{}'::jsonb),
  ('76000000-0000-4000-8000-000000000002', 'security-client@example.test', '{}'::jsonb),
  ('76000000-0000-4000-8000-000000000003', 'security-admin@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id, avatar_url, onboarding_done, account_status, is_admin) VALUES
  ('76000000-0000-4000-8000-000000000001', 'https://example.test/security-trainer.webp', TRUE, 'active', FALSE),
  ('76000000-0000-4000-8000-000000000002', 'https://example.test/security-client.webp', TRUE, 'active', FALSE),
  ('76000000-0000-4000-8000-000000000003', 'https://example.test/security-admin.webp', TRUE, 'active', TRUE);
INSERT INTO public.trainer_applications (id, user_id, status, submitted_at, decided_at) VALUES
  ('76000000-0000-4000-8000-000000000011', '76000000-0000-4000-8000-000000000001', 'approved', NOW(), NOW());
INSERT INTO public.trainer_profiles (id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary) VALUES
  ('76000000-0000-4000-8000-000000000021', '76000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000011', 'security-trainer', 'active', 'Security trainer', 'Security fixture', 'Security evidence');
INSERT INTO public.trainer_service_offerings (id, trainer_profile_id, name, modality, duration_minutes) VALUES
  ('76000000-0000-4000-8000-000000000031', '76000000-0000-4000-8000-000000000021', 'Security service', 'online', 60);
INSERT INTO public.coaching_relationships (id, service_id, trainer_user_id, client_user_id, status) VALUES
  ('76000000-0000-4000-8000-000000000041', '76000000-0000-4000-8000-000000000031', '76000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000002', 'active');
INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by) VALUES
  ('76000000-0000-4000-8000-000000000041', 'training_profile', 'training-profile-v1', '76000000-0000-4000-8000-000000000002');
INSERT INTO public.exercises (id, name, name_es, muscle_groups, muscle_groups_es, is_compound) VALUES
  ('76000000-0000-4000-8000-000000000051', 'Security squat', 'Sentadilla security', ARRAY['quadriceps'], ARRAY['cuadriceps'], TRUE);
INSERT INTO public.trainer_program_templates (id, trainer_user_id, name, days_per_week) VALUES
  ('76000000-0000-4000-8000-000000000061', '76000000-0000-4000-8000-000000000001', 'Security program', 1);
INSERT INTO public.trainer_template_workouts (id, template_id, name, day_of_week, order_in_plan) VALUES
  ('76000000-0000-4000-8000-000000000071', '76000000-0000-4000-8000-000000000061', 'Security day', 1, 1);
INSERT INTO public.trainer_template_exercises (id, template_workout_id, exercise_id, order_index, sets, reps, rest_seconds) VALUES
  ('76000000-0000-4000-8000-000000000081', '76000000-0000-4000-8000-000000000071', '76000000-0000-4000-8000-000000000051', 1, 3, 8, 60);

SELECT dblink_connect('security_idempotent_proposal_a', 'dbname=postgres user=supabase_admin');
SELECT dblink_connect('security_idempotent_proposal_b', 'dbname=postgres user=supabase_admin');
SELECT dblink_exec(name, $$SET request.jwt.claim.sub = '76000000-0000-4000-8000-000000000001'$$)
FROM (VALUES ('security_idempotent_proposal_a'), ('security_idempotent_proposal_b')) AS actor(name);
SELECT dblink_exec(name, $$SET request.jwt.claim.role = 'authenticated'$$)
FROM (VALUES ('security_idempotent_proposal_a'), ('security_idempotent_proposal_b')) AS actor(name);
SELECT dblink_exec(name, 'SET ROLE authenticated')
FROM (VALUES ('security_idempotent_proposal_a'), ('security_idempotent_proposal_b')) AS actor(name);
SELECT dblink_exec(name, format($sql$
  CREATE FUNCTION pg_temp.try_security_proposal() RETURNS JSONB LANGUAGE plpgsql AS $f$
  DECLARE row RECORD;
  BEGIN
    SELECT * INTO row FROM public.propose_trainer_assignment(
      '76000000-0000-4000-8000-000000000041',
      '76000000-0000-4000-8000-000000000061', NULL, 'security-same-proposal-key');
    RETURN jsonb_build_object('ok', true, 'assignmentId', row.assignment_id,
      'versionId', row.assignment_version_id, 'planId', row.workout_plan_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM);
  END; $f$;
$sql$)) FROM (VALUES ('security_idempotent_proposal_a'), ('security_idempotent_proposal_b')) AS actor(name);
CREATE TEMP TABLE security_proposal_pids AS
SELECT pid FROM dblink('security_idempotent_proposal_a', 'SELECT pg_backend_pid()') response(pid INTEGER)
UNION ALL
SELECT pid FROM dblink('security_idempotent_proposal_b', 'SELECT pg_backend_pid()') response(pid INTEGER);
SELECT pg_advisory_lock(hashtextextended('76000000-0000-4000-8000-000000000002', 0));
SELECT dblink_send_query('security_idempotent_proposal_a', 'SELECT pg_temp.try_security_proposal()');
SELECT dblink_send_query('security_idempotent_proposal_b', 'SELECT pg_temp.try_security_proposal()');
SELECT pg_temp.wait_for_security_lock(ARRAY(SELECT pid FROM security_proposal_pids), 2);
SELECT pg_advisory_unlock(hashtextextended('76000000-0000-4000-8000-000000000002', 0));
CREATE TEMP TABLE security_proposal_results (result JSONB NOT NULL);
INSERT INTO security_proposal_results SELECT result FROM dblink_get_result('security_idempotent_proposal_a') AS response(result JSONB);
INSERT INTO security_proposal_results SELECT result FROM dblink_get_result('security_idempotent_proposal_b') AS response(result JSONB);
DO $$
BEGIN
  IF (SELECT count(*) FROM security_proposal_results WHERE (result->>'ok')::BOOLEAN) <> 2
    OR (SELECT count(DISTINCT result->>'assignmentId') FROM security_proposal_results) <> 1
    OR (SELECT count(DISTINCT result->>'versionId') FROM security_proposal_results) <> 1
    OR (SELECT count(DISTINCT result->>'planId') FROM security_proposal_results) <> 1 THEN
    RAISE EXCEPTION 'idempotent proposal retries did not return one complete object: %',
      (SELECT string_agg(result::TEXT, ' | ') FROM security_proposal_results);
  END IF;
  IF (SELECT count(*) FROM public.trainer_plan_assignments WHERE proposal_idempotency_key = 'security-same-proposal-key') <> 1
    OR (SELECT count(*) FROM public.trainer_assignment_versions version JOIN public.trainer_plan_assignments assignment ON assignment.id = version.assignment_id WHERE assignment.proposal_idempotency_key = 'security-same-proposal-key') <> 1
    OR (SELECT count(*) FROM public.workout_plans plan JOIN public.trainer_plan_assignments assignment ON assignment.id = plan.trainer_assignment_id WHERE assignment.proposal_idempotency_key = 'security-same-proposal-key') <> 1 THEN
    RAISE EXCEPTION 'idempotent proposal left duplicate or partial rows';
  END IF;
END;
$$;
SELECT dblink_disconnect('security_idempotent_proposal_a');
SELECT dblink_disconnect('security_idempotent_proposal_b');

-- Suspend wins a forced three-way interleave. Accept and publish must recheck
-- after the administrative lock commits, fail closed, and leave no active plan.
SELECT pg_advisory_lock(hashtextextended('76000000-0000-4000-8000-000000000002', 0));
SELECT dblink_connect('security_accept_publish_suspend_a', 'dbname=postgres user=supabase_admin');
SELECT dblink_connect('security_accept_publish_suspend_b', 'dbname=postgres user=supabase_admin');
SELECT dblink_connect('security_accept_publish_suspend_db_boundary', 'dbname=postgres user=supabase_admin');
SELECT dblink_exec('security_accept_publish_suspend_a', $$SET request.jwt.claim.sub = '76000000-0000-4000-8000-000000000002'$$);
SELECT dblink_exec('security_accept_publish_suspend_a', $$SET request.jwt.claim.role = 'authenticated'$$);
SELECT dblink_exec('security_accept_publish_suspend_a', 'SET ROLE authenticated');
SELECT dblink_exec('security_accept_publish_suspend_b', $$SET request.jwt.claim.sub = '76000000-0000-4000-8000-000000000001'$$);
SELECT dblink_exec('security_accept_publish_suspend_b', $$SET request.jwt.claim.role = 'authenticated'$$);
SELECT dblink_exec('security_accept_publish_suspend_b', 'SET ROLE authenticated');
SELECT set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000003', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.suspend_account_and_professional(
      '76000000-0000-4000-8000-000000000001',
      '76000000-0000-4000-8000-000000000003',
      'Forged direct suspension', NULL);
    RAISE EXCEPTION 'authenticated admin bypassed the server boundary';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'permission denied for function suspend_account_and_professional' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;
-- SQL can prove the service-role database serialization half but cannot prove
-- bearer authentication over HTTP. The E2E route tests the preceding
-- authenticated-admin -> server-only boundary without granting this RPC to
-- authenticated. Do not describe this dblink actor as the admin itself.
SELECT dblink_exec('security_accept_publish_suspend_db_boundary', $$SET request.jwt.claim.sub = '76000000-0000-4000-8000-000000000003'$$);
SELECT dblink_exec('security_accept_publish_suspend_db_boundary', $$SET request.jwt.claim.role = 'service_role'$$);
SELECT dblink_exec('security_accept_publish_suspend_db_boundary', 'SET ROLE service_role');
SELECT dblink_exec('security_accept_publish_suspend_a', $$CREATE FUNCTION pg_temp.try_security_accept() RETURNS JSONB LANGUAGE plpgsql AS $f$ BEGIN PERFORM public.accept_trainer_assignment((SELECT id FROM public.trainer_plan_assignments WHERE proposal_idempotency_key='security-same-proposal-key'), 'security-accept-key'); RETURN '{"ok":true}'::jsonb; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'message',SQLERRM,'sqlstate',SQLSTATE); END;$f$;$$);
SELECT dblink_exec('security_accept_publish_suspend_b', $$CREATE FUNCTION pg_temp.try_security_publish() RETURNS JSONB LANGUAGE plpgsql AS $f$ BEGIN PERFORM public.publish_trainer_assignment_revision((SELECT id FROM public.trainer_plan_assignments WHERE proposal_idempotency_key='security-same-proposal-key'), '76000000-0000-4000-8000-000000000061', 'Concurrent publish', 'security-publish-key'); RETURN '{"ok":true}'::jsonb; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'message',SQLERRM,'sqlstate',SQLSTATE); END;$f$;$$);
CREATE TEMP TABLE security_accept_publish_pids AS
SELECT pid FROM dblink('security_accept_publish_suspend_a', 'SELECT pg_backend_pid()') response(pid INTEGER)
UNION ALL
SELECT pid FROM dblink('security_accept_publish_suspend_b', 'SELECT pg_backend_pid()') response(pid INTEGER);
SELECT dblink_send_query('security_accept_publish_suspend_a', 'SELECT pg_temp.try_security_accept()');
SELECT dblink_send_query('security_accept_publish_suspend_b', 'SELECT pg_temp.try_security_publish()');
SELECT pg_temp.wait_for_security_lock(ARRAY(SELECT pid FROM security_accept_publish_pids), 2);
SELECT dblink_exec('security_accept_publish_suspend_db_boundary', $$DO $f$ BEGIN PERFORM public.suspend_account_and_professional('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000003','Security race suspension',NULL); END;$f$;$$);
SELECT pg_advisory_unlock(hashtextextended('76000000-0000-4000-8000-000000000002', 0));
CREATE TEMP TABLE security_accept_results (actor TEXT, result JSONB);
INSERT INTO security_accept_results SELECT 'accept', result FROM dblink_get_result('security_accept_publish_suspend_a') AS response(result JSONB);
INSERT INTO security_accept_results SELECT 'publish', result FROM dblink_get_result('security_accept_publish_suspend_b') AS response(result JSONB);
DO $$
BEGIN
  IF (SELECT account_status FROM public.profiles WHERE id='76000000-0000-4000-8000-000000000001') <> 'suspended'
    OR EXISTS (SELECT 1 FROM public.workout_plans WHERE user_id='76000000-0000-4000-8000-000000000002' AND is_active)
    OR EXISTS (SELECT 1 FROM public.trainer_assignment_versions WHERE assignment_id=(SELECT id FROM public.trainer_plan_assignments WHERE proposal_idempotency_key='security-same-proposal-key') AND materialized_plan_id IS NULL) THEN
    RAISE EXCEPTION 'accept/publish/suspend race left active or partial state';
  END IF;
  IF EXISTS (SELECT 1 FROM security_accept_results WHERE (result->>'ok')::BOOLEAN) THEN
    RAISE EXCEPTION 'accept or publish succeeded after suspension won: %', (SELECT string_agg(result::TEXT,' | ') FROM security_accept_results);
  END IF;
END;
$$;
SELECT dblink_disconnect('security_accept_publish_suspend_a');
SELECT dblink_disconnect('security_accept_publish_suspend_b');
SELECT dblink_disconnect('security_accept_publish_suspend_db_boundary');

-- Reactivation + profile reinstatement is one fail-closed service boundary.
-- It restores only the approved professional account; client relationships and
-- revoked scopes remain paused until the client explicitly renews consent.
SELECT set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000003', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.reactivate_and_reinstate_trainer(
      '76000000-0000-4000-8000-000000000001',
      '76000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'authenticated caller reached atomic reinstatement';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'permission denied for function reactivate_and_reinstate_trainer' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT set_config('request.jwt.claim.role', 'anon', false);
SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.reactivate_and_reinstate_trainer(
      '76000000-0000-4000-8000-000000000001',
      '76000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'anonymous caller reached atomic reinstatement';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'permission denied for function reactivate_and_reinstate_trainer' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '', false);
SELECT set_config('request.jwt.claim.role', 'service_role', false);
SET ROLE service_role;
DO $$
DECLARE
  v_result RECORD;
BEGIN
  BEGIN
    PERFORM public.reactivate_and_reinstate_trainer(
      '76000000-0000-4000-8000-000000000001',
      '76000000-0000-4000-8000-000000000099');
    RAISE EXCEPTION 'invalid admin unexpectedly reinstated trainer';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ADMIN_REINSTATEMENT_UNAVAILABLE' THEN RAISE; END IF;
  END;
  IF (SELECT account_status FROM public.profiles WHERE id = '76000000-0000-4000-8000-000000000001') <> 'suspended'
    OR (SELECT status FROM public.trainer_profiles WHERE user_id = '76000000-0000-4000-8000-000000000001') <> 'suspended'
    OR EXISTS (SELECT 1 FROM public.admin_audit_logs WHERE target_user_id = '76000000-0000-4000-8000-000000000001' AND action IN ('account_reactivated', 'trainer_profile_reinstated')) THEN
    RAISE EXCEPTION 'invalid admin left a partial reinstatement';
  END IF;

  BEGIN
    PERFORM public.reactivate_and_reinstate_trainer(
      '76000000-0000-4000-8000-000000000099',
      '76000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'missing target unexpectedly reinstated';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ADMIN_REINSTATEMENT_UNAVAILABLE' THEN RAISE; END IF;
  END;

  SELECT * INTO STRICT v_result
  FROM public.reactivate_and_reinstate_trainer(
    '76000000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000003');
  IF v_result.account_reactivated IS DISTINCT FROM TRUE
    OR v_result.profile_reinstated IS DISTINCT FROM TRUE
    OR (SELECT account_status FROM public.profiles WHERE id = '76000000-0000-4000-8000-000000000001') <> 'active'
    OR (SELECT status FROM public.trainer_profiles WHERE user_id = '76000000-0000-4000-8000-000000000001') <> 'active'
    OR (SELECT status FROM public.trainer_applications WHERE id = '76000000-0000-4000-8000-000000000011') <> 'approved'
    OR (SELECT status FROM public.coaching_relationships WHERE id = '76000000-0000-4000-8000-000000000041') <> 'paused_by_platform'
    OR EXISTS (SELECT 1 FROM public.coaching_consents WHERE relationship_id = '76000000-0000-4000-8000-000000000041' AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'atomic reinstatement did not restore only the intended professional state';
  END IF;

  IF (SELECT count(*) FROM public.admin_audit_logs
      WHERE admin_user_id = '76000000-0000-4000-8000-000000000003'
        AND target_user_id = '76000000-0000-4000-8000-000000000001'
        AND action = 'account_reactivated' AND reason IS NULL AND metadata = '{}'::JSONB) <> 1
    OR (SELECT count(*) FROM public.admin_audit_logs
      WHERE admin_user_id = '76000000-0000-4000-8000-000000000003'
        AND target_user_id = '76000000-0000-4000-8000-000000000001'
        AND action = 'trainer_profile_reinstated' AND reason IS NULL
        AND metadata = jsonb_build_object('trainer_profile_id', '76000000-0000-4000-8000-000000000021'::UUID)) <> 1
    OR (SELECT count(*) FROM public.professional_audit_logs
      WHERE actor_user_id = '76000000-0000-4000-8000-000000000003'
        AND subject_user_id = '76000000-0000-4000-8000-000000000001'
        AND entity_type = 'trainer_profile'
        AND entity_id = '76000000-0000-4000-8000-000000000021'
        AND action = 'reinstated' AND metadata = '{}'::JSONB) <> 1 THEN
    RAISE EXCEPTION 'atomic reinstatement audit contract is missing, duplicated, or unsanitized';
  END IF;

  BEGIN
    PERFORM public.reactivate_and_reinstate_trainer(
      '76000000-0000-4000-8000-000000000001',
      '76000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'active target unexpectedly accepted reinstatement';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ADMIN_REINSTATEMENT_UNAVAILABLE' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.admin_audit_logs
      WHERE target_user_id = '76000000-0000-4000-8000-000000000001'
        AND action IN ('account_reactivated', 'trainer_profile_reinstated')) <> 2
    OR (SELECT account_status FROM public.profiles WHERE id = '76000000-0000-4000-8000-000000000001') <> 'active'
    OR (SELECT status FROM public.coaching_relationships WHERE id = '76000000-0000-4000-8000-000000000041') <> 'paused_by_platform' THEN
    RAISE EXCEPTION 'invalid target state duplicated audit or partially mutated state';
  END IF;
END;
$$;
RESET ROLE;

-- Two revision attempts use distinct connections for one actor. They serialize
-- in SQL and receive distinct version numbers; exactly one final version/plan
-- remains active and every version has a complete materialization.
SELECT dblink_connect('security_revision_n_plus_one_a', 'dbname=postgres user=supabase_admin');
SELECT dblink_connect('security_revision_n_plus_one_b', 'dbname=postgres user=supabase_admin');
SELECT dblink_exec(name, $$SET request.jwt.claim.sub = 'eeeeeeee-0000-4000-8000-000000000001'$$)
FROM (VALUES ('security_revision_n_plus_one_a'), ('security_revision_n_plus_one_b')) actor(name);
SELECT dblink_exec(name, $$SET request.jwt.claim.role = 'authenticated'$$)
FROM (VALUES ('security_revision_n_plus_one_a'), ('security_revision_n_plus_one_b')) actor(name);
SELECT dblink_exec(name, 'SET ROLE authenticated')
FROM (VALUES ('security_revision_n_plus_one_a'), ('security_revision_n_plus_one_b')) actor(name);
SELECT dblink_exec('security_revision_n_plus_one_a', $$CREATE FUNCTION pg_temp.try_revision() RETURNS JSONB LANGUAGE plpgsql AS $f$ DECLARE r RECORD; BEGIN SELECT * INTO r FROM public.publish_trainer_assignment_revision('eeeeeeee-0000-4000-8000-000000000091','eeeeeeee-0000-4000-8000-000000000061','Concurrent revision A','security-revision-a'); RETURN jsonb_build_object('ok',true,'versionId',r.assignment_version_id); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'message',SQLERRM,'sqlstate',SQLSTATE); END;$f$;$$);
SELECT dblink_exec('security_revision_n_plus_one_b', $$CREATE FUNCTION pg_temp.try_revision() RETURNS JSONB LANGUAGE plpgsql AS $f$ DECLARE r RECORD; BEGIN SELECT * INTO r FROM public.publish_trainer_assignment_revision('eeeeeeee-0000-4000-8000-000000000091','eeeeeeee-0000-4000-8000-000000000061','Concurrent revision B','security-revision-b'); RETURN jsonb_build_object('ok',true,'versionId',r.assignment_version_id); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'message',SQLERRM,'sqlstate',SQLSTATE); END;$f$;$$);
CREATE TEMP TABLE security_revision_pids AS
SELECT pid FROM dblink('security_revision_n_plus_one_a', 'SELECT pg_backend_pid()') response(pid INTEGER)
UNION ALL
SELECT pid FROM dblink('security_revision_n_plus_one_b', 'SELECT pg_backend_pid()') response(pid INTEGER);
SELECT pg_advisory_lock(hashtextextended('eeeeeeee-0000-4000-8000-000000000002', 0));
SELECT dblink_send_query('security_revision_n_plus_one_a', 'SELECT pg_temp.try_revision()');
SELECT dblink_send_query('security_revision_n_plus_one_b', 'SELECT pg_temp.try_revision()');
SELECT pg_temp.wait_for_security_lock(ARRAY(SELECT pid FROM security_revision_pids), 2);
SELECT pg_advisory_unlock(hashtextextended('eeeeeeee-0000-4000-8000-000000000002', 0));
CREATE TEMP TABLE security_revision_results (result JSONB);
INSERT INTO security_revision_results SELECT result FROM dblink_get_result('security_revision_n_plus_one_a') AS response(result JSONB);
INSERT INTO security_revision_results SELECT result FROM dblink_get_result('security_revision_n_plus_one_b') AS response(result JSONB);
DO $$
BEGIN
  IF (SELECT count(*) FROM security_revision_results WHERE (result->>'ok')::BOOLEAN) <> 2
    OR (SELECT count(DISTINCT version_number) FROM public.trainer_assignment_versions WHERE revision_idempotency_key IN ('security-revision-a','security-revision-b')) <> 2
    OR (SELECT count(*) FROM public.trainer_assignment_versions WHERE assignment_id='eeeeeeee-0000-4000-8000-000000000091' AND status='active') <> 1
    OR (SELECT count(*) FROM public.workout_plans WHERE user_id='eeeeeeee-0000-4000-8000-000000000002' AND is_active) <> 1
    OR EXISTS (SELECT 1 FROM public.trainer_assignment_versions WHERE revision_idempotency_key IN ('security-revision-a','security-revision-b') AND materialized_plan_id IS NULL) THEN
    RAISE EXCEPTION 'revision race violated unique/completeness invariants: %', (SELECT string_agg(result::TEXT,' | ') FROM security_revision_results);
  END IF;
END;
$$;
SELECT dblink_disconnect('security_revision_n_plus_one_a');
SELECT dblink_disconnect('security_revision_n_plus_one_b');

-- End wins the relationship lock before the evidence reader. The reader must
-- block, re-evaluate after commit, and return the same generic unavailable code.
SELECT dblink_connect('security_end_read_evidence_a', 'dbname=postgres user=supabase_admin');
SELECT dblink_connect('security_end_read_evidence_b', 'dbname=postgres user=supabase_admin');
SELECT dblink_exec(name, $$SET request.jwt.claim.sub = 'eeeeeeee-0000-4000-8000-000000000001'$$)
FROM (VALUES ('security_end_read_evidence_a'), ('security_end_read_evidence_b')) actor(name);
SELECT dblink_exec(name, $$SET request.jwt.claim.role = 'authenticated'$$)
FROM (VALUES ('security_end_read_evidence_a'), ('security_end_read_evidence_b')) actor(name);
SELECT dblink_exec('security_end_read_evidence_b', 'SET ROLE authenticated');
SELECT dblink_exec('security_end_read_evidence_b', $$CREATE FUNCTION pg_temp.try_evidence() RETURNS JSONB LANGUAGE plpgsql AS $f$ BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('eeeeeeee-0000-4000-8000-000000000002',0)); RETURN jsonb_build_object('ok',true,'payload',public.get_coach_client_insights('eeeeeeee-0000-4000-8000-000000000002',CURRENT_DATE-30,CURRENT_DATE)); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'message',SQLERRM,'sqlstate',SQLSTATE); END;$f$;$$);
CREATE TEMP TABLE security_evidence_pids AS
SELECT pid FROM dblink('security_end_read_evidence_b', 'SELECT pg_backend_pid()') response(pid INTEGER);
SELECT dblink_exec('security_end_read_evidence_a', $$BEGIN; DO $f$ BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('eeeeeeee-0000-4000-8000-000000000002',0)); PERFORM 1 FROM public.coaching_relationships WHERE id='eeeeeeee-0000-4000-8000-000000000041' FOR UPDATE; END;$f$; SET ROLE authenticated$$);
SELECT dblink_send_query('security_end_read_evidence_b', 'SELECT pg_temp.try_evidence()');
SELECT pg_temp.wait_for_security_lock(ARRAY(SELECT pid FROM security_evidence_pids), 1);
SELECT dblink_exec('security_end_read_evidence_a', $$DO $f$ BEGIN PERFORM public.end_coaching_relationship('eeeeeeee-0000-4000-8000-000000000041','Security end/read race',gen_random_uuid()); END;$f$; COMMIT$$);
CREATE TEMP TABLE security_end_read_results (result JSONB);
INSERT INTO security_end_read_results SELECT result FROM dblink_get_result('security_end_read_evidence_b') AS response(result JSONB);
DO $$
BEGIN
  IF (SELECT result->>'message' FROM security_end_read_results) <> 'COACH_CLIENT_INSIGHTS_UNAVAILABLE'
    OR (SELECT status FROM public.coaching_relationships WHERE id='eeeeeeee-0000-4000-8000-000000000041') <> 'ended' THEN
    RAISE EXCEPTION 'end/read evidence did not fail closed: %', (SELECT result FROM security_end_read_results);
  END IF;
END;
$$;
SELECT dblink_disconnect('security_end_read_evidence_a');
SELECT dblink_disconnect('security_end_read_evidence_b');

-- A committed foreign request and credential let an unrelated authenticated
-- actor compare the real applicant/request RPC response with a missing UUID.
INSERT INTO public.trainer_application_credentials (
  id, application_id, credential_type, title, external_url
) VALUES (
  'cccccccc-0000-4000-8000-000000000091',
  'cccccccc-0000-4000-8000-000000000011',
  'link', 'Foreign security credential', 'https://example.test/credential'
);
INSERT INTO public.coaching_requests (
  id, service_id, trainer_user_id, client_user_id, message,
  training_profile_consent_version, idempotency_key, status, decided_at
) VALUES (
  'cccccccc-0000-4000-8000-000000000101',
  'cccccccc-0000-4000-8000-000000000031',
  'cccccccc-0000-4000-8000-000000000001',
  'cccccccc-0000-4000-8000-000000000002',
  'Foreign completed request', 'training-profile-v1',
  'cccccccc-0000-4000-8000-000000000102', 'cancelled', NOW()
);
INSERT INTO public.progress_logs (id, user_id, completed_at, notes) VALUES (
  'cccccccc-0000-4000-8000-000000000111',
  'cccccccc-0000-4000-8000-000000000002', NOW(), 'Foreign private progress'
);

CREATE OR REPLACE FUNCTION pg_temp.security_full_snapshot()
RETURNS JSONB LANGUAGE sql STABLE AS $$
SELECT jsonb_build_object(
  'trainer_applications', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.trainer_applications row),
  'trainer_application_credentials', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.trainer_application_credentials row),
  'trainer_credential_storage_cleanup', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.trainer_credential_storage_cleanup row),
  'trainer_application_events', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.trainer_application_events row),
  'trainer_interviews', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.trainer_interviews row),
  'trainer_profiles', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.trainer_profiles row),
  'trainer_service_offerings', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.trainer_service_offerings row),
  'coaching_requests', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.coaching_requests row),
  'coaching_relationships', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.coaching_relationships row),
  'coaching_consents', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.coaching_consents row),
  'trainer_program_templates', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.trainer_program_templates row),
  'trainer_template_workouts', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.trainer_template_workouts row),
  'trainer_template_exercises', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.trainer_template_exercises row),
  'trainer_plan_assignments', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.trainer_plan_assignments row),
  'trainer_assignment_versions', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.trainer_assignment_versions row),
  'workout_plans', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.workout_plans row),
  'workouts', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.workouts row),
  'workout_exercises', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.workout_exercises row),
  'progress_logs', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.progress_logs row),
  'exercise_logs', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.exercise_logs row),
  'product_notifications', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.product_notifications row),
  'professional_audit_logs', (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.professional_audit_logs row)
);
$$;

CREATE TEMP TABLE security_idor_before AS
SELECT pg_temp.security_full_snapshot() AS snapshot;

CREATE OR REPLACE FUNCTION pg_temp.security_try(p_sql TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE value JSONB;
BEGIN
  EXECUTE 'SELECT to_jsonb(result) FROM (' || p_sql || ') result' INTO value;
  RETURN jsonb_build_object('ok', TRUE, 'data', value);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', FALSE, 'sqlstate', SQLSTATE, 'message', SQLERRM);
END;
$$;

CREATE TEMP TABLE security_idor_results (
  field TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('foreign','missing')),
  result JSONB NOT NULL,
  PRIMARY KEY (field, kind)
);
GRANT SELECT, INSERT ON security_idor_results TO authenticated;

-- IDOR:applicationId / IDOR:credentialId / IDOR:requestId /
-- IDOR:relationshipId / IDOR:clientId use their real domain RPCs.
SELECT set_config('request.jwt.claim.sub', 'eeeeeeee-0000-4000-8000-000000000001', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SET ROLE authenticated;
INSERT INTO security_idor_results VALUES
  ('applicationId','foreign',pg_temp.security_try($q$SELECT public.submit_trainer_application('cccccccc-0000-4000-8000-000000000011')$q$)),
  ('applicationId','missing',pg_temp.security_try($q$SELECT public.submit_trainer_application('ffffffff-0000-4000-8000-000000000011')$q$)),
  ('credentialId','foreign',pg_temp.security_try($q$SELECT public.prepare_trainer_credential_removal('cccccccc-0000-4000-8000-000000000011','cccccccc-0000-4000-8000-000000000091')$q$)),
  ('credentialId','missing',pg_temp.security_try($q$SELECT public.prepare_trainer_credential_removal('ffffffff-0000-4000-8000-000000000011','ffffffff-0000-4000-8000-000000000091')$q$)),
  ('requestId','foreign',pg_temp.security_try($q$SELECT public.accept_coaching_request('cccccccc-0000-4000-8000-000000000101',gen_random_uuid())$q$)),
  ('requestId','missing',pg_temp.security_try($q$SELECT public.accept_coaching_request('ffffffff-0000-4000-8000-000000000101',gen_random_uuid())$q$)),
  ('relationshipId','foreign',pg_temp.security_try($q$SELECT public.end_coaching_relationship('cccccccc-0000-4000-8000-000000000041',NULL,gen_random_uuid())$q$)),
  ('relationshipId','missing',pg_temp.security_try($q$SELECT public.end_coaching_relationship('ffffffff-0000-4000-8000-000000000041',NULL,gen_random_uuid())$q$)),
  ('clientId','foreign',pg_temp.security_try($q$SELECT public.get_coach_client_insights('cccccccc-0000-4000-8000-000000000002',CURRENT_DATE-30,CURRENT_DATE)$q$)),
  ('clientId','missing',pg_temp.security_try($q$SELECT public.get_coach_client_insights('ffffffff-0000-4000-8000-000000000002',CURRENT_DATE-30,CURRENT_DATE)$q$));
RESET ROLE;

-- IDOR:templateId reaches the template guard through the actor's own active
-- relationship. IDOR:assignmentId reaches the assignment ownership guard.
SELECT set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-000000000001', false);
SET ROLE authenticated;
INSERT INTO security_idor_results VALUES
  ('templateId','foreign',pg_temp.security_try($q$SELECT public.propose_trainer_assignment('cccccccc-0000-4000-8000-000000000041','eeeeeeee-0000-4000-8000-000000000061',NULL,'idor-template-foreign')$q$)),
  ('templateId','missing',pg_temp.security_try($q$SELECT public.propose_trainer_assignment('cccccccc-0000-4000-8000-000000000041','ffffffff-0000-4000-8000-000000000061',NULL,'idor-template-missing')$q$));
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'eeeeeeee-0000-4000-8000-000000000001', false);
SET ROLE authenticated;
INSERT INTO security_idor_results VALUES
  ('assignmentId','foreign',pg_temp.security_try($q$SELECT public.publish_trainer_assignment_revision('cccccccc-0000-4000-8000-000000000061','eeeeeeee-0000-4000-8000-000000000061','IDOR foreign','idor-assignment-foreign')$q$)),
  ('assignmentId','missing',pg_temp.security_try($q$SELECT public.publish_trainer_assignment_revision('ffffffff-0000-4000-8000-000000000061','eeeeeeee-0000-4000-8000-000000000061','IDOR missing','idor-assignment-missing')$q$)),
  -- IDOR:planId and IDOR:progressLogId exercise the real RLS DML boundary.
  ('planId','foreign',pg_temp.security_try($q$WITH changed AS (UPDATE public.workout_plans SET name='IDOR blocked' WHERE id='cccccccc-0000-4000-8000-000000000081' RETURNING id) SELECT 1 / count(*)::INTEGER AS unavailable FROM changed$q$)),
  ('planId','missing',pg_temp.security_try($q$WITH changed AS (UPDATE public.workout_plans SET name='IDOR blocked' WHERE id='ffffffff-0000-4000-8000-000000000081' RETURNING id) SELECT 1 / count(*)::INTEGER AS unavailable FROM changed$q$)),
  ('progressLogId','foreign',pg_temp.security_try($q$WITH changed AS (UPDATE public.progress_logs SET notes='IDOR blocked' WHERE id='cccccccc-0000-4000-8000-000000000111' RETURNING id) SELECT 1 / count(*)::INTEGER AS unavailable FROM changed$q$)),
  ('progressLogId','missing',pg_temp.security_try($q$WITH changed AS (UPDATE public.progress_logs SET notes='IDOR blocked' WHERE id='ffffffff-0000-4000-8000-000000000081' RETURNING id) SELECT 1 / count(*)::INTEGER AS unavailable FROM changed$q$));
RESET ROLE;

DO $$
DECLARE mismatch RECORD; after_snapshot JSONB;
BEGIN
  SELECT foreign_result.field, foreign_result.result AS foreign_result, missing_result.result AS missing_result
  INTO mismatch
  FROM security_idor_results foreign_result
  JOIN security_idor_results missing_result USING (field)
  WHERE foreign_result.kind='foreign' AND missing_result.kind='missing'
    AND foreign_result.result IS DISTINCT FROM missing_result.result
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'IDOR % distinguished foreign from missing: % <> %', mismatch.field, mismatch.foreign_result, mismatch.missing_result;
  END IF;
  IF (SELECT count(DISTINCT field) FROM security_idor_results) <> 9 THEN
    RAISE EXCEPTION 'IDOR suite did not execute all nine identifiers';
  END IF;
  IF EXISTS (SELECT 1 FROM security_idor_results WHERE (result->>'ok')::BOOLEAN) THEN
    RAISE EXCEPTION 'IDOR suite accepted an unauthorized operation';
  END IF;

  SELECT pg_temp.security_full_snapshot() INTO after_snapshot;
  IF after_snapshot IS DISTINCT FROM (SELECT snapshot FROM security_idor_before) THEN
    RAISE EXCEPTION 'IDOR attempts changed protected rows';
  END IF;
END;
$$;

SELECT field AS verified_idor, result
FROM security_idor_results
WHERE kind='foreign'
ORDER BY field;

-- Published fixture cleanup is an exact-user operation, not a project reset.
-- It rejects authenticated callers and removes an immutable materialization
-- only when every named auth user carries the requested E2E run marker. Audit
-- evidence is intentionally excluded from fixture deletion.
CREATE TEMP TABLE security_preserved_audit_count AS
SELECT count(*) AS total
FROM public.professional_audit_logs
WHERE actor_user_id::TEXT LIKE '76000000-0000-4000-8000-%'
   OR subject_user_id::TEXT LIKE '76000000-0000-4000-8000-%';
CREATE TEMP TABLE security_preserved_admin_audit AS
SELECT id, action, reason, metadata, created_at,
  admin_user_id_snapshot, target_user_id_snapshot
FROM public.admin_audit_logs
WHERE admin_user_id_snapshot::TEXT LIKE '76000000-0000-4000-8000-%'
   OR target_user_id_snapshot::TEXT LIKE '76000000-0000-4000-8000-%';
SELECT set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000003', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.cleanup_trainer_security_e2e_fixture(
      'security-sql-run',
      ARRAY['76000000-0000-4000-8000-000000000001'::UUID]
    );
    RAISE EXCEPTION 'authenticated caller reached trainer security cleanup';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

UPDATE auth.users
SET raw_user_meta_data = CASE
  WHEN id = '76000000-0000-4000-8000-000000000003' THEN '{}'::JSONB
  ELSE jsonb_build_object('e2e_run_id', 'security-sql-run')
END
WHERE id = ANY(ARRAY[
  '76000000-0000-4000-8000-000000000001'::UUID,
  '76000000-0000-4000-8000-000000000002'::UUID,
  '76000000-0000-4000-8000-000000000003'::UUID
]);
SELECT set_config('request.jwt.claim.role', 'service_role', false);
SET ROLE service_role;
DO $$
BEGIN
  BEGIN
    PERFORM public.cleanup_trainer_security_e2e_fixture(
      'security-sql-run',
      ARRAY[
        '76000000-0000-4000-8000-000000000001'::UUID,
        '76000000-0000-4000-8000-000000000002'::UUID,
        '76000000-0000-4000-8000-000000000003'::UUID
      ]
    );
    RAISE EXCEPTION 'mixed/unmarked cleanup was not rejected';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'TRAINER_SECURITY_CLEANUP_SCOPE_MISMATCH' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM auth.users WHERE id::TEXT LIKE '76000000-0000-4000-8000-%') <> 3 THEN
    RAISE EXCEPTION 'mixed/unmarked cleanup changed exact targets';
  END IF;
END;
$$;
UPDATE auth.users
SET raw_user_meta_data = jsonb_build_object('e2e_run_id', 'security-sql-run')
WHERE id = '76000000-0000-4000-8000-000000000003';
SET ROLE service_role;
DO $$
DECLARE
  first_deleted INTEGER;
  retry_deleted INTEGER;
BEGIN
  first_deleted := public.cleanup_trainer_security_e2e_fixture(
    'security-sql-run',
    ARRAY[
      '76000000-0000-4000-8000-000000000001'::UUID,
      '76000000-0000-4000-8000-000000000002'::UUID,
      '76000000-0000-4000-8000-000000000003'::UUID
    ]
  );
  IF first_deleted <> 3 THEN RAISE EXCEPTION 'first cleanup deleted %, expected 3', first_deleted; END IF;

  retry_deleted := public.cleanup_trainer_security_e2e_fixture(
    'security-sql-run',
    ARRAY[
      '76000000-0000-4000-8000-000000000001'::UUID,
      '76000000-0000-4000-8000-000000000002'::UUID,
      '76000000-0000-4000-8000-000000000003'::UUID
    ]
  );
  IF retry_deleted <> 0 THEN RAISE EXCEPTION 'cleanup retry deleted %, expected 0', retry_deleted; END IF;
END;
$$;
RESET ROLE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id::TEXT LIKE '76000000-0000-4000-8000-%')
    OR EXISTS (SELECT 1 FROM public.trainer_plan_assignments WHERE trainer_user_id::TEXT LIKE '76000000-0000-4000-8000-%')
    OR EXISTS (SELECT 1 FROM public.trainer_assignment_versions version JOIN public.trainer_plan_assignments assignment ON assignment.id=version.assignment_id WHERE assignment.trainer_user_id::TEXT LIKE '76000000-0000-4000-8000-%')
    OR EXISTS (SELECT 1 FROM public.workout_plans WHERE user_id='76000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'trainer security exact fixture cleanup left published rows or users';
  END IF;
  IF (SELECT total FROM security_preserved_audit_count) = 0
    OR (SELECT count(*) FROM public.professional_audit_logs
        WHERE actor_user_id::TEXT LIKE '76000000-0000-4000-8000-%'
           OR subject_user_id::TEXT LIKE '76000000-0000-4000-8000-%')
       <> (SELECT total FROM security_preserved_audit_count)
  THEN
    RAISE EXCEPTION 'trainer security cleanup deleted append-only audit evidence';
  END IF;
  IF (SELECT count(*) FROM security_preserved_admin_audit) = 0
    OR EXISTS (
      SELECT * FROM security_preserved_admin_audit
      EXCEPT
      SELECT id, action, reason, metadata, created_at,
        admin_user_id_snapshot, target_user_id_snapshot
      FROM public.admin_audit_logs
      WHERE id IN (SELECT id FROM security_preserved_admin_audit)
    )
    OR EXISTS (
      SELECT id, action, reason, metadata, created_at,
        admin_user_id_snapshot, target_user_id_snapshot
      FROM public.admin_audit_logs
      WHERE id IN (SELECT id FROM security_preserved_admin_audit)
      EXCEPT
      SELECT * FROM security_preserved_admin_audit
    ) THEN
    RAISE EXCEPTION 'trainer security cleanup altered retained administrative audit evidence';
  END IF;
END;
$$;

-- A partially completed retry operates only on the still-existing, correctly
-- marked target; an absent UUID never broadens the cleanup scope.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('76100000-0000-4000-8000-000000000001', 'security-cleanup-retry@example.test', '{"e2e_run_id":"security-partial-run"}'::JSONB);
SELECT set_config('request.jwt.claim.role', 'service_role', false);
SET ROLE service_role;
DO $$
DECLARE remaining_deleted INTEGER;
BEGIN
  remaining_deleted := public.cleanup_trainer_security_e2e_fixture(
    'security-partial-run',
    ARRAY[
      '76100000-0000-4000-8000-000000000001'::UUID,
      '76100000-0000-4000-8000-000000000002'::UUID
    ]
  );
  IF remaining_deleted <> 1 THEN RAISE EXCEPTION 'partial cleanup retry deleted %, expected 1', remaining_deleted; END IF;
END;
$$;
RESET ROLE;

SELECT 'trainer security supplemental races and IDOR effects passed' AS result;

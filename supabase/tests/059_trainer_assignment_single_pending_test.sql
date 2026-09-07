BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(25);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('59000000-0000-4000-8000-000000000001', 'single-pending-trainer@example.test', '{}'::JSONB),
  ('59000000-0000-4000-8000-000000000002', 'single-pending-client@example.test', '{}'::JSONB);
INSERT INTO public.profiles (id, full_name, avatar_url, onboarding_done, account_status) VALUES
  ('59000000-0000-4000-8000-000000000001', 'Single pending trainer', 'https://example.test/single-pending-trainer.webp', TRUE, 'active'),
  ('59000000-0000-4000-8000-000000000002', 'Single pending client', 'https://example.test/single-pending-client.webp', TRUE, 'active');
INSERT INTO public.trainer_applications (id, user_id, status, decided_at) VALUES
  ('59000000-0000-4000-8000-000000000011', '59000000-0000-4000-8000-000000000001', 'approved', NOW());
INSERT INTO public.trainer_profiles (
  id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary
) VALUES (
  '59000000-0000-4000-8000-000000000021',
  '59000000-0000-4000-8000-000000000001',
  '59000000-0000-4000-8000-000000000011',
  'single-pending-trainer',
  'active',
  'Single pending trainer',
  'Single pending proposal coverage',
  'Migration 059 evidence'
);
INSERT INTO public.trainer_service_offerings (
  id, trainer_profile_id, name, modality, duration_minutes
) VALUES (
  '59000000-0000-4000-8000-000000000031',
  '59000000-0000-4000-8000-000000000021',
  'Single pending service',
  'online',
  60
);
INSERT INTO public.coaching_relationships (
  id, service_id, trainer_user_id, client_user_id, status
) VALUES (
  '59000000-0000-4000-8000-000000000041',
  '59000000-0000-4000-8000-000000000031',
  '59000000-0000-4000-8000-000000000001',
  '59000000-0000-4000-8000-000000000002',
  'active'
);
INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by) VALUES (
  '59000000-0000-4000-8000-000000000041',
  'training_profile',
  'training-profile-v1',
  '59000000-0000-4000-8000-000000000002'
);
INSERT INTO public.exercises (id, name) VALUES (
  '59000000-0000-4000-8000-000000000051',
  'Single pending squat'
);
INSERT INTO public.trainer_program_templates (
  id, trainer_user_id, name, days_per_week, status
) VALUES (
  '59000000-0000-4000-8000-000000000061',
  '59000000-0000-4000-8000-000000000001',
  'Single pending template',
  1,
  'active'
);
INSERT INTO public.trainer_template_workouts (
  id, template_id, name, day_of_week, order_in_plan
) VALUES (
  '59000000-0000-4000-8000-000000000071',
  '59000000-0000-4000-8000-000000000061',
  'Single pending day',
  1,
  1
);
INSERT INTO public.trainer_template_exercises (
  id, template_workout_id, exercise_id, order_index, sets, reps, rest_seconds
) VALUES (
  '59000000-0000-4000-8000-000000000081',
  '59000000-0000-4000-8000-000000000071',
  '59000000-0000-4000-8000-000000000051',
  1,
  3,
  8,
  60
);

SELECT ok(
  (
    SELECT procedure_language.lanname = 'plpgsql'
      AND procedure.prokind = 'f'
      AND procedure.provolatile = 'v'
      AND procedure.prorettype = 'record'::REGTYPE
      AND procedure.prosecdef
      AND procedure.proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]
      AND owner_role.rolname = 'postgres'
    FROM pg_proc procedure
    JOIN pg_language procedure_language ON procedure_language.oid = procedure.prolang
    JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
    WHERE procedure.oid = 'public.propose_trainer_assignment(uuid,uuid,text,text)'::REGPROCEDURE
  ),
  'proposal RPC remains a postgres-owned volatile SECURITY DEFINER with exact search path'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.propose_trainer_assignment(uuid,uuid,text,text)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.propose_trainer_assignment(uuid,uuid,text,text)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.propose_trainer_assignment(uuid,uuid,text,text)', 'EXECUTE')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_proc procedure
      CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) expanded_acl
      LEFT JOIN pg_roles grantee_role ON grantee_role.oid = expanded_acl.grantee
      WHERE procedure.oid = 'public.propose_trainer_assignment(uuid,uuid,text,text)'::REGPROCEDURE
        AND expanded_acl.privilege_type = 'EXECUTE'
        AND expanded_acl.grantee <> procedure.proowner
        AND (
          expanded_acl.is_grantable
          OR expanded_acl.grantee = 0
          OR grantee_role.rolname IS NULL
          OR grantee_role.rolname NOT IN ('authenticated', 'service_role')
        )
    ),
  'proposal RPC keeps exact authenticated and service-role execution ACLs without grant option'
);

SELECT set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000001', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SET LOCAL ROLE authenticated;
SELECT is(public.trainer_security_preflight(), 59, 'trainer preflight marks the single-pending boundary');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '', TRUE);
SELECT set_config('request.jwt.claim.role', 'anon', TRUE);
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.propose_trainer_assignment('59000000-0000-4000-8000-000000000041', '59000000-0000-4000-8000-000000000061', NULL, 'anonymous-proposal')$$,
  '42501', 'permission denied for function propose_trainer_assignment',
  'anonymous callers cannot execute the proposal RPC'
);
SELECT throws_ok(
  $$SELECT public.trainer_security_preflight()$$,
  '42501', 'permission denied for function trainer_security_preflight',
  'anonymous callers cannot execute the professional preflight'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000001', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM public.propose_trainer_assignment(
    '59000000-0000-4000-8000-000000000041',
    '59000000-0000-4000-8000-000000000061',
    'Initial proposal',
    'single-pending-key-a'
  )),
  1::BIGINT,
  'first proposal returns exactly one complete result'
);
SELECT is(
  (
    SELECT concat_ws(':', assignment_id, assignment_version_id, workout_plan_id)
    FROM public.propose_trainer_assignment(
      '59000000-0000-4000-8000-000000000041',
      '59000000-0000-4000-8000-000000000061',
      'Ignored exact retry text',
      'single-pending-key-a'
    )
  ),
  (
    SELECT concat_ws(':', assignment.id, version.id, version.materialized_plan_id)
    FROM public.trainer_plan_assignments assignment
    JOIN public.trainer_assignment_versions version
      ON version.assignment_id = assignment.id AND version.version_number = 1
    WHERE assignment.proposal_idempotency_key = 'single-pending-key-a'
  ),
  'same-key retry returns the original assignment, version, and plan'
);
SELECT throws_ok(
  $$SELECT public.propose_trainer_assignment(
    '59000000-0000-4000-8000-000000000041',
    '59000000-0000-4000-8000-000000000061',
    'Stale different-key proposal',
    'single-pending-key-b'
  )$$,
  'P0001', 'TRAINER_ASSIGNMENT_PROPOSAL_EXISTS',
  'a stale different key cannot create a second pending proposal for the client'
);
RESET ROLE;

SELECT is(
  (SELECT count(*) FROM public.trainer_plan_assignments WHERE client_user_id = '59000000-0000-4000-8000-000000000002' AND status = 'proposed'),
  1::BIGINT,
  'one pending assignment remains'
);
SELECT is(
  (SELECT count(*) FROM public.trainer_assignment_versions version JOIN public.trainer_plan_assignments assignment ON assignment.id = version.assignment_id WHERE assignment.client_user_id = '59000000-0000-4000-8000-000000000002'),
  1::BIGINT,
  'one assignment version remains'
);
SELECT is(
  (SELECT count(*) FROM public.workout_plans WHERE user_id = '59000000-0000-4000-8000-000000000002' AND source_type = 'trainer_assigned'),
  1::BIGINT,
  'one professional plan remains'
);
SELECT is(
  (SELECT count(*) FROM public.workouts workout JOIN public.workout_plans plan ON plan.id = workout.plan_id WHERE plan.user_id = '59000000-0000-4000-8000-000000000002' AND plan.source_type = 'trainer_assigned'),
  1::BIGINT,
  'one materialized workout remains'
);
SELECT is(
  (SELECT count(*) FROM public.workout_exercises exercise JOIN public.workouts workout ON workout.id = exercise.workout_id JOIN public.workout_plans plan ON plan.id = workout.plan_id WHERE plan.user_id = '59000000-0000-4000-8000-000000000002' AND plan.source_type = 'trainer_assigned'),
  1::BIGINT,
  'one materialized exercise remains'
);
SELECT is(
  (SELECT count(*) FROM public.professional_audit_logs WHERE subject_user_id = '59000000-0000-4000-8000-000000000002' AND entity_type = 'trainer_plan_assignment' AND action = 'proposed'),
  1::BIGINT,
  'one proposed audit remains'
);
SELECT is(
  (SELECT count(*) FROM public.product_notifications WHERE user_id = '59000000-0000-4000-8000-000000000002' AND type = 'coaching_assignment_status' AND dedupe_key LIKE 'coaching-assignment-proposed:%'),
  1::BIGINT,
  'one proposed notification remains'
);

SELECT set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000002', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.accept_trainer_assignment(
    (SELECT id FROM public.trainer_plan_assignments WHERE proposal_idempotency_key = 'single-pending-key-a'),
    'single-pending-accept-a'
  )$$,
  'client can accept the only pending proposal'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000001', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.propose_trainer_assignment(
    '59000000-0000-4000-8000-000000000041',
    '59000000-0000-4000-8000-000000000061',
    'Second proposal after acceptance',
    'single-pending-key-c'
  )$$,
  'P0001', 'TRAINER_ASSIGNMENT_ACTIVE_EXISTS',
  'a different key still cannot replace an active professional routine'
);
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.trainer_plan_assignments WHERE client_user_id = '59000000-0000-4000-8000-000000000002'),
  1::BIGINT,
  'active rejection preserves one assignment'
);
SELECT is(
  (SELECT count(*) FROM public.trainer_assignment_versions version JOIN public.trainer_plan_assignments assignment ON assignment.id = version.assignment_id WHERE assignment.client_user_id = '59000000-0000-4000-8000-000000000002'),
  1::BIGINT,
  'active rejection preserves one assignment version'
);
SELECT is(
  (SELECT count(*) FROM public.workout_plans WHERE user_id = '59000000-0000-4000-8000-000000000002' AND source_type = 'trainer_assigned'),
  1::BIGINT,
  'active rejection preserves one professional plan'
);

ALTER FUNCTION public.propose_trainer_assignment(UUID, UUID, TEXT, TEXT)
  SET statement_timeout = '5s';
SELECT throws_ok(
  $$SELECT public.trainer_security_preflight()$$,
  'P0001', 'TRAINER_SECURITY_PREFLIGHT_FAILED',
  'preflight rejects extra proposal RPC configuration'
);
ALTER FUNCTION public.propose_trainer_assignment(UUID, UUID, TEXT, TEXT)
  RESET statement_timeout;
SELECT is(public.trainer_security_preflight(), 59, 'preflight recovers after restoring exact proposal RPC configuration');

CREATE ROLE trainer_proposal_extra_executor NOLOGIN;
GRANT EXECUTE ON FUNCTION public.propose_trainer_assignment(UUID, UUID, TEXT, TEXT)
  TO trainer_proposal_extra_executor;
SELECT throws_ok(
  $$SELECT public.trainer_security_preflight()$$,
  'P0001', 'TRAINER_SECURITY_PREFLIGHT_FAILED',
  'preflight rejects an extra proposal RPC executor'
);
REVOKE EXECUTE ON FUNCTION public.propose_trainer_assignment(UUID, UUID, TEXT, TEXT)
  FROM trainer_proposal_extra_executor;
DROP ROLE trainer_proposal_extra_executor;
SELECT is(public.trainer_security_preflight(), 59, 'preflight recovers after removing the extra proposal executor');

SELECT is(public.trainer_security_preflight(), 59, 'preflight remains at 59 after proposal behavior checks');

SELECT * FROM finish();
ROLLBACK;

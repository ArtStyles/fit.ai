BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(124);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-0000-4000-8000-000000000001', 'program-owner@example.test', '{}'::jsonb),
  ('22222222-0000-4000-8000-000000000002', 'program-other@example.test', '{}'::jsonb),
  ('33333333-0000-4000-8000-000000000003', 'program-client@example.test', '{}'::jsonb),
  ('44444444-0000-4000-8000-000000000004', 'program-outsider@example.test', '{}'::jsonb),
  ('55555555-0000-4000-8000-000000000005', 'engine-client@example.test', '{}'::jsonb),
  ('66666666-0000-4000-8000-000000000006', 'manual-client@example.test', '{}'::jsonb),
  ('77777777-0000-4000-8000-000000000007', 'clone-client@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id, avatar_url, onboarding_done, account_status) VALUES
  ('11111111-0000-4000-8000-000000000001', 'https://example.test/owner.webp', TRUE, 'active'),
  ('22222222-0000-4000-8000-000000000002', 'https://example.test/other.webp', TRUE, 'active'),
  ('33333333-0000-4000-8000-000000000003', 'https://example.test/client.webp', TRUE, 'active'),
  ('44444444-0000-4000-8000-000000000004', 'https://example.test/outsider.webp', TRUE, 'active'),
  ('55555555-0000-4000-8000-000000000005', 'https://example.test/engine.webp', TRUE, 'active'),
  ('66666666-0000-4000-8000-000000000006', 'https://example.test/manual.webp', TRUE, 'active'),
  ('77777777-0000-4000-8000-000000000007', 'https://example.test/clone.webp', TRUE, 'active');
INSERT INTO public.trainer_applications (id, user_id) VALUES
  ('11111111-0000-4000-8000-000000000011', '11111111-0000-4000-8000-000000000001'),
  ('22222222-0000-4000-8000-000000000012', '22222222-0000-4000-8000-000000000002');
INSERT INTO public.trainer_profiles (id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary) VALUES
  ('11111111-0000-4000-8000-000000000021', '11111111-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000011', 'program-owner', 'active', 'Owner', 'Bio', 'Experience'),
  ('22222222-0000-4000-8000-000000000022', '22222222-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000012', 'program-other', 'active', 'Other', 'Bio', 'Experience');
INSERT INTO public.trainer_service_offerings (id, trainer_profile_id, name, modality, duration_minutes) VALUES
  ('11111111-0000-4000-8000-000000000031', '11111111-0000-4000-8000-000000000021', 'Owner service', 'online', 60);
INSERT INTO public.exercises (id, name) VALUES ('11111111-0000-4000-8000-000000000041', 'Squat');

SELECT set_config('request.jwt.claim.sub', '11111111-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.trainer_program_templates (id, trainer_user_id, name, days_per_week)
    VALUES ('11111111-0000-4000-8000-000000000051', '11111111-0000-4000-8000-000000000001', 'Owner template', 2)$$,
  'active trainer can create the owned template'
);
SELECT lives_ok(
  $$UPDATE public.trainer_program_templates SET name = 'Owner template updated'
    WHERE id = '11111111-0000-4000-8000-000000000051'$$,
  'active trainer can update the owned template'
);
SELECT lives_ok(
  $$INSERT INTO public.trainer_program_templates (id, trainer_user_id, name, days_per_week)
    VALUES ('11111111-0000-4000-8000-000000000053', '11111111-0000-4000-8000-000000000001', 'Disposable template', 1)$$,
  'active trainer can create another owned template'
);
SELECT lives_ok(
  $$DELETE FROM public.trainer_program_templates WHERE id = '11111111-0000-4000-8000-000000000053'$$,
  'active trainer can delete an unassigned owned template'
);
RESET ROLE;

-- The editor reorders through locked SECURITY DEFINER RPCs: every persisted
-- row must be represented exactly once, and an outsider cannot invoke them.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
INSERT INTO public.trainer_template_workouts (id, template_id, name, day_of_week, order_in_plan) VALUES
  ('11111111-0000-4000-8000-000000000054', '11111111-0000-4000-8000-000000000051', 'Order one', 1, 1),
  ('11111111-0000-4000-8000-000000000055', '11111111-0000-4000-8000-000000000051', 'Order two', 2, 2);
INSERT INTO public.trainer_template_exercises (id, template_workout_id, exercise_id, order_index, sets, reps, rest_seconds) VALUES
  ('11111111-0000-4000-8000-000000000056', '11111111-0000-4000-8000-000000000055', '11111111-0000-4000-8000-000000000041', 1, 3, 10, 60),
  ('11111111-0000-4000-8000-000000000057', '11111111-0000-4000-8000-000000000055', '11111111-0000-4000-8000-000000000041', 2, 3, 8, 60);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '11111111-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.reorder_trainer_template_workouts('11111111-0000-4000-8000-000000000051', ARRAY['11111111-0000-4000-8000-000000000055'::uuid, '11111111-0000-4000-8000-000000000054'::uuid])$$,
  'owner reorders every workout atomically through the template RPC'
);
SELECT is((SELECT order_in_plan FROM public.trainer_template_workouts WHERE id = '11111111-0000-4000-8000-000000000055'), 1, 'atomic reorder updates the complete permutation');
SELECT throws_ok(
  $$SELECT public.reorder_trainer_template_workouts('11111111-0000-4000-8000-000000000051', ARRAY['11111111-0000-4000-8000-000000000054'::uuid])$$,
  'TRAINER_TEMPLATE_REORDER_INCOMPLETE', 'partial reorder rolls back instead of leaving duplicate or missing order values'
);
SELECT lives_ok(
  $$SELECT public.reorder_trainer_template_exercises('11111111-0000-4000-8000-000000000055', ARRAY['11111111-0000-4000-8000-000000000057'::uuid, '11111111-0000-4000-8000-000000000056'::uuid])$$,
  'owner reorders every exercise atomically through the workout RPC'
);
SELECT is((SELECT order_index FROM public.trainer_template_exercises WHERE id = '11111111-0000-4000-8000-000000000057'), 1, 'exercise reorder updates the complete permutation');
SELECT throws_ok(
  $$SELECT public.reorder_trainer_template_exercises('11111111-0000-4000-8000-000000000055', ARRAY['11111111-0000-4000-8000-000000000056'::uuid])$$,
  'TRAINER_TEMPLATE_REORDER_INCOMPLETE', 'partial exercise reorder rolls back without persisting an invalid order'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '22222222-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.trainer_program_templates), 0::bigint, 'other trainer cannot read owner templates');
SELECT is((SELECT count(*) FROM public.trainer_program_templates WHERE id = '11111111-0000-4000-8000-000000000051'), 0::bigint, 'other trainer cannot update owner templates');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
UPDATE public.trainer_profiles SET status = 'inactive' WHERE user_id = '11111111-0000-4000-8000-000000000001';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '11111111-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.trainer_program_templates (trainer_user_id, name, days_per_week) VALUES ('11111111-0000-4000-8000-000000000001', 'inactive profile', 1)$$,
  NULL, NULL, 'inactive trainer profile cannot create templates'
);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
UPDATE public.trainer_profiles SET status = 'active' WHERE user_id = '11111111-0000-4000-8000-000000000001';
UPDATE public.profiles SET account_status = 'suspended' WHERE id = '11111111-0000-4000-8000-000000000001';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '11111111-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.trainer_program_templates (trainer_user_id, name, days_per_week) VALUES ('11111111-0000-4000-8000-000000000001', 'suspended account', 1)$$,
  NULL, NULL, 'suspended trainer account cannot create templates'
);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
UPDATE public.profiles SET account_status = 'active' WHERE id = '11111111-0000-4000-8000-000000000001';
INSERT INTO public.trainer_program_templates (id, trainer_user_id, name, days_per_week)
VALUES ('22222222-0000-4000-8000-000000000052', '22222222-0000-4000-8000-000000000002', 'Other template', 1);
INSERT INTO public.coaching_relationships (id, service_id, trainer_user_id, client_user_id, status)
VALUES ('11111111-0000-4000-8000-000000000061', '11111111-0000-4000-8000-000000000031', '11111111-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003', 'active');
-- A complete owned template and the active training-profile consent are the
-- real inputs to a first proposal. Keep an active personal plan around to
-- prove proposal never replaces it before client acceptance.
INSERT INTO public.trainer_template_exercises (id, template_workout_id, exercise_id, order_index, sets, reps, rest_seconds)
VALUES ('11111111-0000-4000-8000-000000000058', '11111111-0000-4000-8000-000000000054', '11111111-0000-4000-8000-000000000041', 1, 4, 6, 90);
INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by)
VALUES ('11111111-0000-4000-8000-000000000061', 'training_profile', 'training-profile-v1', '33333333-0000-4000-8000-000000000003');
INSERT INTO public.workout_plans (id, user_id, name, family_id, is_active)
VALUES ('11111111-0000-4000-8000-000000000110', '33333333-0000-4000-8000-000000000003', 'Personal before proposal', gen_random_uuid(), TRUE);
INSERT INTO public.workouts (id, user_id, plan_id, name, day_of_week, order_in_plan)
VALUES ('11111111-0000-4000-8000-000000000111', '33333333-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000110', 'Personal destination', 1, 1);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '11111111-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.propose_trainer_assignment('11111111-0000-4000-8000-000000000061', '11111111-0000-4000-8000-000000000051', 'Primera propuesta', 'proposal-idempotency-1')$$,
  'active trainer proposes a complete immutable professional assignment'
);
SELECT is((SELECT snapshot->>'schemaVersion' FROM public.trainer_assignment_versions version JOIN public.trainer_plan_assignments assignment ON assignment.id = version.assignment_id WHERE assignment.proposal_idempotency_key = 'proposal-idempotency-1'), '1', 'proposal stores SnapshotV1');
SELECT is((SELECT jsonb_array_length(snapshot->'workouts') FROM public.trainer_assignment_versions version JOIN public.trainer_plan_assignments assignment ON assignment.id = version.assignment_id WHERE assignment.proposal_idempotency_key = 'proposal-idempotency-1'), 2, 'snapshot contains every ordered template workout');
SELECT is((SELECT user_id FROM public.workout_plans plan JOIN public.trainer_plan_assignments assignment ON assignment.id = plan.trainer_assignment_id WHERE assignment.proposal_idempotency_key = 'proposal-idempotency-1'), '33333333-0000-4000-8000-000000000003'::uuid, 'materialized plan belongs to the client');
SELECT is((SELECT is_active FROM public.workout_plans plan JOIN public.trainer_plan_assignments assignment ON assignment.id = plan.trainer_assignment_id WHERE assignment.proposal_idempotency_key = 'proposal-idempotency-1'), FALSE, 'proposal leaves professional plan inactive');
SELECT is((SELECT is_active FROM public.workout_plans WHERE id = '11111111-0000-4000-8000-000000000110'), TRUE, 'proposal does not change the current personal plan');
SELECT is((SELECT count(*) FROM public.workouts workout JOIN public.workout_plans plan ON plan.id = workout.plan_id JOIN public.trainer_plan_assignments assignment ON assignment.id = plan.trainer_assignment_id WHERE assignment.proposal_idempotency_key = 'proposal-idempotency-1'), 2::bigint, 'proposal materializes every workout');
SELECT is((SELECT count(*) FROM public.workout_exercises exercise JOIN public.workouts workout ON workout.id = exercise.workout_id JOIN public.workout_plans plan ON plan.id = workout.plan_id JOIN public.trainer_plan_assignments assignment ON assignment.id = plan.trainer_assignment_id WHERE assignment.proposal_idempotency_key = 'proposal-idempotency-1'), 3::bigint, 'proposal materializes every exercise prescription');
SELECT is(
  (SELECT workout_plan_id FROM public.propose_trainer_assignment('11111111-0000-4000-8000-000000000061', '11111111-0000-4000-8000-000000000051', 'ignored retry text', 'proposal-idempotency-1')),
  (SELECT materialized_plan_id FROM public.trainer_assignment_versions version JOIN public.trainer_plan_assignments assignment ON assignment.id = version.assignment_id WHERE assignment.proposal_idempotency_key = 'proposal-idempotency-1'),
  'proposal retry returns the original materialized plan'
);
SELECT is((SELECT count(*) FROM public.trainer_plan_assignments WHERE proposal_idempotency_key = 'proposal-idempotency-1'), 1::bigint, 'proposal retry creates no duplicate assignment');
SELECT is((SELECT count(*) FROM public.professional_audit_logs WHERE entity_type = 'trainer_plan_assignment' AND action = 'proposed'), 1::bigint, 'proposal records an audit event');
SELECT is((SELECT count(*) FROM public.product_notifications WHERE dedupe_key LIKE 'coaching-assignment-proposed:%'), 1::bigint, 'proposal notifies the client without private template data');
-- The client, never the trainer or a submitted id, accepts the immutable first
-- prescription. This is the real RPC boundary rather than an update shortcut.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '33333333-0000-4000-8000-000000000003', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.accept_trainer_assignment((SELECT id FROM public.trainer_plan_assignments WHERE proposal_idempotency_key = 'proposal-idempotency-1'), 'accept-idempotency-1')$$,
  'client accepts the proposed professional assignment atomically'
);
SELECT is((SELECT status FROM public.trainer_plan_assignments WHERE proposal_idempotency_key = 'proposal-idempotency-1'), 'active', 'acceptance activates the assignment');
SELECT ok((SELECT accepted_at IS NOT NULL FROM public.trainer_plan_assignments WHERE proposal_idempotency_key = 'proposal-idempotency-1'), 'acceptance records its timestamp');
SELECT is((SELECT version.status FROM public.trainer_assignment_versions version JOIN public.trainer_plan_assignments assignment ON assignment.id = version.assignment_id WHERE assignment.proposal_idempotency_key = 'proposal-idempotency-1'), 'active', 'acceptance activates version one');
SELECT is((SELECT is_active FROM public.workout_plans WHERE id = '11111111-0000-4000-8000-000000000110'), FALSE, 'acceptance deactivates the former personal plan');
SELECT ok((SELECT retired_at IS NULL AND superseded_at IS NULL FROM public.workout_plans WHERE id = '11111111-0000-4000-8000-000000000110'), 'acceptance preserves former plan history');
SELECT is((SELECT workout_plan_id FROM public.accept_trainer_assignment((SELECT id FROM public.trainer_plan_assignments WHERE proposal_idempotency_key = 'proposal-idempotency-1'), 'accept-idempotency-1')),
  (SELECT materialized_plan_id FROM public.trainer_assignment_versions version JOIN public.trainer_plan_assignments assignment ON assignment.id = version.assignment_id WHERE assignment.proposal_idempotency_key = 'proposal-idempotency-1'),
  'acceptance retry returns the original materialized plan');
SELECT throws_ok(
  $$SELECT public.activate_plan_version((SELECT materialized_plan_id FROM public.trainer_assignment_versions version JOIN public.trainer_plan_assignments assignment ON assignment.id = version.assignment_id WHERE assignment.proposal_idempotency_key = 'proposal-idempotency-1'))$$,
  'PROFESSIONAL_PLAN_MANUAL_ACTIVATION_FORBIDDEN', 'legacy activation cannot activate professional prescriptions directly'
);
SELECT ok(has_function_privilege('authenticated', 'public.assert_professional_plan_replaceable(uuid)', 'EXECUTE'), 'authenticated lifecycle RPCs may execute the replacement guard');
SELECT throws_ok(
  $$SELECT public.assert_professional_plan_replaceable('11111111-0000-4000-8000-000000000001')$$,
  'PROFESSIONAL_PLAN_REPLACEMENT_FORBIDDEN', 'client cannot invoke replacement guard for another user'
);
SELECT throws_ok(
  $$SELECT public.assert_professional_plan_replaceable('33333333-0000-4000-8000-000000000003')$$,
  'PROFESSIONAL_PLAN_REPLACEMENT_FORBIDDEN', 'active professional plan rejects personal replacement'
);
SELECT throws_ok(
  $$UPDATE public.workout_plans SET name = 'Client mutation' WHERE trainer_assignment_id = (SELECT id FROM public.trainer_plan_assignments WHERE proposal_idempotency_key = 'proposal-idempotency-1')$$,
  'TRAINER_PRESCRIPTION_LOCKED', 'authenticated client cannot update a locked professional plan'
);
SELECT throws_ok(
  $$DELETE FROM public.workout_plans WHERE trainer_assignment_id = (SELECT id FROM public.trainer_plan_assignments WHERE proposal_idempotency_key = 'proposal-idempotency-1')$$,
  'TRAINER_PRESCRIPTION_LOCKED', 'authenticated client cannot delete a locked professional plan'
);
SELECT throws_ok(
  $$INSERT INTO public.workouts (user_id, plan_id, name, day_of_week, order_in_plan) VALUES ('33333333-0000-4000-8000-000000000003', (SELECT materialized_plan_id FROM public.trainer_assignment_versions version JOIN public.trainer_plan_assignments assignment ON assignment.id = version.assignment_id WHERE assignment.proposal_idempotency_key = 'proposal-idempotency-1'), 'Injected workout', 7, 7)$$,
  'TRAINER_PRESCRIPTION_LOCKED', 'authenticated client cannot insert a workout into a locked professional plan'
);
SELECT throws_ok(
  $$UPDATE public.workouts SET name = 'Client mutation' WHERE id = (SELECT id FROM public.workouts WHERE plan_id = (SELECT materialized_plan_id FROM public.trainer_assignment_versions version JOIN public.trainer_plan_assignments assignment ON assignment.id = version.assignment_id WHERE assignment.proposal_idempotency_key = 'proposal-idempotency-1') LIMIT 1)$$,
  'TRAINER_PRESCRIPTION_LOCKED', 'authenticated client cannot update a locked professional workout'
);
SELECT throws_ok(
  $$DELETE FROM public.workouts WHERE id = (SELECT id FROM public.workouts WHERE plan_id = (SELECT materialized_plan_id FROM public.trainer_assignment_versions version JOIN public.trainer_plan_assignments assignment ON assignment.id = version.assignment_id WHERE assignment.proposal_idempotency_key = 'proposal-idempotency-1') LIMIT 1)$$,
  NULL, NULL, 'authenticated client cannot delete a locked professional workout'
);
SELECT throws_ok(
  $$UPDATE public.workouts SET plan_id = '11111111-0000-4000-8000-000000000110' WHERE id = (SELECT id FROM public.workouts WHERE plan_id = (SELECT materialized_plan_id FROM public.trainer_assignment_versions version JOIN public.trainer_plan_assignments assignment ON assignment.id = version.assignment_id WHERE assignment.proposal_idempotency_key = 'proposal-idempotency-1') LIMIT 1)$$,
  'TRAINER_PRESCRIPTION_LOCKED', 'authenticated client cannot move a workout out of a locked professional plan'
);
SELECT throws_ok(
  $$INSERT INTO public.workout_exercises (workout_id, exercise_id, order_index, sets, reps, rest_seconds) VALUES ((SELECT id FROM public.workouts WHERE plan_id = (SELECT materialized_plan_id FROM public.trainer_assignment_versions version JOIN public.trainer_plan_assignments assignment ON assignment.id = version.assignment_id WHERE assignment.proposal_idempotency_key = 'proposal-idempotency-1') LIMIT 1), '11111111-0000-4000-8000-000000000041', 99, 1, 1, 60)$$,
  'TRAINER_PRESCRIPTION_LOCKED', 'authenticated client cannot insert an exercise into a locked professional workout'
);
SELECT throws_ok(
  $$UPDATE public.workout_exercises SET reps = 99 WHERE id = (SELECT exercise.id FROM public.workout_exercises exercise JOIN public.workouts workout ON workout.id = exercise.workout_id WHERE workout.plan_id = (SELECT materialized_plan_id FROM public.trainer_assignment_versions version JOIN public.trainer_plan_assignments assignment ON assignment.id = version.assignment_id WHERE assignment.proposal_idempotency_key = 'proposal-idempotency-1') LIMIT 1)$$,
  'TRAINER_PRESCRIPTION_LOCKED', 'authenticated client cannot update a locked professional prescription'
);
SELECT throws_ok(
  $$UPDATE public.workout_exercises SET workout_id = '11111111-0000-4000-8000-000000000111' WHERE id = (SELECT exercise.id FROM public.workout_exercises exercise JOIN public.workouts workout ON workout.id = exercise.workout_id WHERE workout.plan_id = (SELECT materialized_plan_id FROM public.trainer_assignment_versions version JOIN public.trainer_plan_assignments assignment ON assignment.id = version.assignment_id WHERE assignment.proposal_idempotency_key = 'proposal-idempotency-1') LIMIT 1)$$,
  'TRAINER_PRESCRIPTION_LOCKED', 'authenticated client cannot move an exercise out of a locked professional workout'
);
SELECT throws_ok(
  $$DELETE FROM public.workout_exercises WHERE id = (SELECT exercise.id FROM public.workout_exercises exercise JOIN public.workouts workout ON workout.id = exercise.workout_id WHERE workout.plan_id = (SELECT materialized_plan_id FROM public.trainer_assignment_versions version JOIN public.trainer_plan_assignments assignment ON assignment.id = version.assignment_id WHERE assignment.proposal_idempotency_key = 'proposal-idempotency-1') LIMIT 1)$$,
  'TRAINER_PRESCRIPTION_LOCKED', 'authenticated client cannot delete a locked professional prescription'
);
SELECT set_config('app.trainer_prescription_mutation', 'authorized', true);
SELECT throws_ok(
  $$UPDATE public.workout_plans SET name = 'Forged GUC mutation' WHERE trainer_assignment_id = (SELECT id FROM public.trainer_plan_assignments WHERE proposal_idempotency_key = 'proposal-idempotency-1')$$,
  'TRAINER_PRESCRIPTION_LOCKED', 'authenticated client cannot forge the professional mutation bypass GUC'
);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
UPDATE public.coaching_relationships
SET status = 'ended', ended_at = NOW(), ended_by = '33333333-0000-4000-8000-000000000003', end_reason = 'Test lifecycle closure'
WHERE id = '11111111-0000-4000-8000-000000000061';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '33333333-0000-4000-8000-000000000003', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.assert_professional_plan_replaceable('33333333-0000-4000-8000-000000000003')$$, 'ended relationship permits a later personal choice');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
-- Later identity fixtures intentionally reserve the same client as their
-- active-assignment subject, so close this isolated acceptance scenario first.
UPDATE public.trainer_plan_assignments SET status = 'superseded' WHERE proposal_idempotency_key = 'proposal-idempotency-1';
UPDATE public.workout_plans SET is_active = FALSE WHERE trainer_assignment_id = (SELECT id FROM public.trainer_plan_assignments WHERE proposal_idempotency_key = 'proposal-idempotency-1');
UPDATE public.workout_plans SET is_active = FALSE, retired_at = NOW() WHERE id = '11111111-0000-4000-8000-000000000110';
-- Three isolated clients exercise the real lifecycle RPCs against a genuine
-- professional plan instead of a test-only quota shortcut.
INSERT INTO public.coaching_relationships (id, service_id, trainer_user_id, client_user_id, status) VALUES
  ('55555555-0000-4000-8000-000000000061', '11111111-0000-4000-8000-000000000031', '11111111-0000-4000-8000-000000000001', '55555555-0000-4000-8000-000000000005', 'active'),
  ('66666666-0000-4000-8000-000000000061', '11111111-0000-4000-8000-000000000031', '11111111-0000-4000-8000-000000000001', '66666666-0000-4000-8000-000000000006', 'active'),
  ('77777777-0000-4000-8000-000000000061', '11111111-0000-4000-8000-000000000031', '11111111-0000-4000-8000-000000000001', '77777777-0000-4000-8000-000000000007', 'active');
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.trainer_plan_assignments (id, relationship_id, trainer_user_id, client_user_id, source_template_id) VALUES
  ('55555555-0000-4000-8000-000000000071', '55555555-0000-4000-8000-000000000061', '11111111-0000-4000-8000-000000000001', '55555555-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000051'),
  ('66666666-0000-4000-8000-000000000071', '66666666-0000-4000-8000-000000000061', '11111111-0000-4000-8000-000000000001', '66666666-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000051'),
  ('77777777-0000-4000-8000-000000000071', '77777777-0000-4000-8000-000000000061', '11111111-0000-4000-8000-000000000001', '77777777-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000051');
INSERT INTO public.trainer_assignment_versions (id, assignment_id, version_number, snapshot, materialized_plan_id) VALUES
  ('55555555-0000-4000-8000-000000000081', '55555555-0000-4000-8000-000000000071', 1, '{"schemaVersion":1}', '55555555-0000-4000-8000-000000000091'),
  ('66666666-0000-4000-8000-000000000081', '66666666-0000-4000-8000-000000000071', 1, '{"schemaVersion":1}', '66666666-0000-4000-8000-000000000091'),
  ('77777777-0000-4000-8000-000000000081', '77777777-0000-4000-8000-000000000071', 1, '{"schemaVersion":1}', '77777777-0000-4000-8000-000000000091');
INSERT INTO public.workout_plans (id,user_id,name,family_id,source_type,library_slot,prescription_locked,trainer_relationship_id,trainer_assignment_id,trainer_assignment_version_id) VALUES
  ('55555555-0000-4000-8000-000000000091','55555555-0000-4000-8000-000000000005','Pro engine',gen_random_uuid(),'trainer_assigned','professional',TRUE,'55555555-0000-4000-8000-000000000061','55555555-0000-4000-8000-000000000071','55555555-0000-4000-8000-000000000081'),
  ('66666666-0000-4000-8000-000000000091','66666666-0000-4000-8000-000000000006','Pro manual',gen_random_uuid(),'trainer_assigned','professional',TRUE,'66666666-0000-4000-8000-000000000061','66666666-0000-4000-8000-000000000071','66666666-0000-4000-8000-000000000081'),
  ('77777777-0000-4000-8000-000000000091','77777777-0000-4000-8000-000000000007','Pro clone',gen_random_uuid(),'trainer_assigned','professional',TRUE,'77777777-0000-4000-8000-000000000061','77777777-0000-4000-8000-000000000071','77777777-0000-4000-8000-000000000081');
SET CONSTRAINTS ALL IMMEDIATE;
INSERT INTO public.workout_plans (user_id,name,family_id) VALUES
  ('55555555-0000-4000-8000-000000000005','Engine personal',gen_random_uuid()),
  ('66666666-0000-4000-8000-000000000006','Manual personal',gen_random_uuid()),
  ('77777777-0000-4000-8000-000000000007','Clone personal',gen_random_uuid());
INSERT INTO public.posts (id,user_id,routine_snapshot) VALUES ('77777777-0000-4000-8000-000000000101','11111111-0000-4000-8000-000000000001','{"name":"Shared","workouts":[{"name":"Day","exercises":[]}]}');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '55555555-0000-4000-8000-000000000005', true); SELECT set_config('request.jwt.claim.role', 'authenticated', true); SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.create_engine_plan_v2('{"display_name":"Engine","days":[{"display_name":"Day","day_of_week":1,"day_number":1,"estimated_duration_minutes":30,"exercises":[{"exercise_id":"11111111-0000-4000-8000-000000000041","sets":1,"reps":1,"rest_seconds":0}]}]}'::jsonb,'{}',1,'first_plan',NULL,'55555555-0000-4000-8000-000000000111')$$,'engine creates a second personal family beside a professional plan');
SELECT throws_ok($$SELECT public.create_engine_plan_v2('{"display_name":"Third","days":[{"display_name":"Day","day_of_week":1,"day_number":1,"estimated_duration_minutes":30,"exercises":[{"exercise_id":"11111111-0000-4000-8000-000000000041","sets":1,"reps":1,"rest_seconds":0}]}]}'::jsonb,'{}',1,'first_plan',NULL,'55555555-0000-4000-8000-000000000112')$$,'PLAN_FAMILY_LIMIT: free plan family limit reached','engine rejects a third personal family');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '66666666-0000-4000-8000-000000000006', true); SELECT set_config('request.jwt.claim.role', 'authenticated', true); SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.create_manual_plan_atomic('{"name":"Manual"}'::jsonb,'[{"name":"Day","day_of_week":1,"order_in_plan":1}]'::jsonb,FALSE)$$,'manual creates a second personal family beside a professional plan');
SELECT throws_ok($$SELECT public.create_manual_plan_atomic('{"name":"Third"}'::jsonb,'[{"name":"Day","day_of_week":1,"order_in_plan":1}]'::jsonb,FALSE)$$,'PLAN_FAMILY_LIMIT: free plan family limit reached','manual rejects a third personal family');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '77777777-0000-4000-8000-000000000007', true); SELECT set_config('request.jwt.claim.role', 'authenticated', true); SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.clone_plan_from_post_atomic('77777777-0000-4000-8000-000000000101')$$,'clone creates a second personal family beside a professional plan');
SELECT throws_ok($$SELECT public.clone_plan_from_post_atomic('77777777-0000-4000-8000-000000000101')$$,'PLAN_FAMILY_LIMIT: free plan family limit reached','clone rejects a third personal family');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT throws_ok(
  $$INSERT INTO public.trainer_plan_assignments (relationship_id, trainer_user_id, client_user_id, source_template_id)
    VALUES ('11111111-0000-4000-8000-000000000061', '11111111-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000052')$$,
  'TRAINER_ASSIGNMENT_TEMPLATE_OWNER_MISMATCH', 'assignment rejects another trainer source template'
);
SELECT throws_ok(
  $$INSERT INTO public.trainer_plan_assignments (relationship_id, trainer_user_id, client_user_id, source_template_id)
    VALUES ('11111111-0000-4000-8000-000000000061', '22222222-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000003', NULL)$$,
  'TRAINER_ASSIGNMENT_RELATIONSHIP_MISMATCH', 'assignment rejects a relationship ownership mismatch'
);
INSERT INTO public.trainer_plan_assignments (id, relationship_id, trainer_user_id, client_user_id, source_template_id, status)
VALUES ('11111111-0000-4000-8000-000000000071', '11111111-0000-4000-8000-000000000061', '11111111-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000051', 'active');
INSERT INTO public.trainer_assignment_versions (id, assignment_id, version_number, snapshot, status)
VALUES ('11111111-0000-4000-8000-000000000081', '11111111-0000-4000-8000-000000000071', 1, '{"schemaVersion":1}'::jsonb, 'active');
UPDATE public.trainer_plan_assignments SET active_version_id = '11111111-0000-4000-8000-000000000081' WHERE id = '11111111-0000-4000-8000-000000000071';
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.workout_plans (
  id, user_id, name, family_id, source_type, library_slot, prescription_locked,
  trainer_relationship_id, trainer_assignment_id, trainer_assignment_version_id
) VALUES (
  '11111111-0000-4000-8000-000000000091',
  '33333333-0000-4000-8000-000000000003', 'Professional plan',
  '11111111-0000-4000-8000-000000000092', 'trainer_assigned', 'professional', TRUE,
  '11111111-0000-4000-8000-000000000061',
  '11111111-0000-4000-8000-000000000071',
  '11111111-0000-4000-8000-000000000081'
);
UPDATE public.trainer_assignment_versions
SET materialized_plan_id = '11111111-0000-4000-8000-000000000091'
WHERE id = '11111111-0000-4000-8000-000000000081';
SELECT lives_ok(
  $$SET CONSTRAINTS ALL IMMEDIATE$$,
  'a coherent trainer plan may be finalized through its deferred circular references'
);
SELECT is(
  (SELECT library_slot FROM public.workout_plans WHERE id = '11111111-0000-4000-8000-000000000091'),
  'professional', 'trainer plans use the independent professional library slot'
);
SELECT throws_ok(
  $$UPDATE public.trainer_assignment_versions SET materialized_plan_id = NULL WHERE id = '11111111-0000-4000-8000-000000000081'$$,
  'TRAINER_ASSIGNED_PLAN_IDENTITY_INVALID', 'a materialized version cannot be detached from its professional plan'
);
SELECT throws_ok(
  $$UPDATE public.trainer_plan_assignments SET client_user_id = '44444444-0000-4000-8000-000000000004' WHERE id = '11111111-0000-4000-8000-000000000071'$$,
  'TRAINER_ASSIGNMENT_RELATIONSHIP_MISMATCH', 'a materialized assignment cannot be moved to another client'
);
SELECT throws_ok(
  $$UPDATE public.workout_plans SET trainer_assignment_version_id = NULL WHERE id = '11111111-0000-4000-8000-000000000091'$$,
  'TRAINER_ASSIGNED_PLAN_IDENTITY_INVALID', 'a materialized professional plan cannot lose its version reference'
);
SELECT throws_ok(
  $$INSERT INTO public.workout_plans (user_id, name, family_id, source_type, library_slot, prescription_locked)
    VALUES ('33333333-0000-4000-8000-000000000003', 'Incomplete trainer plan', gen_random_uuid(), 'trainer_assigned', 'professional', TRUE)$$,
  'TRAINER_ASSIGNED_PLAN_IDENTITY_INVALID', 'trainer plans require all relationship and assignment references'
);
SELECT throws_ok(
  $$INSERT INTO public.workout_plans (user_id, name, family_id, source_type, library_slot, prescription_locked)
    VALUES ('33333333-0000-4000-8000-000000000003', 'Unlocked trainer plan', gen_random_uuid(), 'trainer_assigned', 'professional', FALSE)$$,
  'TRAINER_ASSIGNED_PLAN_IDENTITY_INVALID', 'trainer plans must be prescription locked'
);
SELECT throws_ok(
  $$INSERT INTO public.workout_plans (user_id, name, family_id, source_type, library_slot, prescription_locked)
    VALUES ('33333333-0000-4000-8000-000000000003', 'Professional manual plan', gen_random_uuid(), 'manual', 'professional', FALSE)$$,
  'TRAINER_ASSIGNED_PLAN_IDENTITY_INVALID', 'only trainer-assigned plans may claim a professional slot'
);
INSERT INTO public.workout_plans (id, user_id, name, family_id)
VALUES
  ('33333333-0000-4000-8000-000000000101', '33333333-0000-4000-8000-000000000003', 'Personal A', '33333333-0000-4000-8000-000000000102'),
  ('33333333-0000-4000-8000-000000000103', '33333333-0000-4000-8000-000000000003', 'Personal B', '33333333-0000-4000-8000-000000000104');
UPDATE public.workout_plans SET is_active = TRUE WHERE id = '11111111-0000-4000-8000-000000000091';
SELECT throws_ok(
  $$UPDATE public.workout_plans SET is_active = TRUE WHERE id = '33333333-0000-4000-8000-000000000101'$$,
  '23505', NULL, 'a personal plan cannot become active alongside the professional plan'
);
SELECT throws_ok(
  $$INSERT INTO public.workout_plans (user_id, name, family_id) VALUES ('33333333-0000-4000-8000-000000000003', 'Personal C', gen_random_uuid())$$,
  'PLAN_FAMILY_LIMIT: free plan family limit reached', 'a free client cannot add a third personal family after receiving a professional plan'
);
SELECT is(
  (SELECT count(DISTINCT family_id) FROM public.workout_plans WHERE user_id = '33333333-0000-4000-8000-000000000003' AND library_slot = 'personal' AND retired_at IS NULL AND superseded_at IS NULL),
  2::bigint, 'professional plans do not expand the personal family quota'
);
SELECT is(
  (SELECT count(*) FROM public.workout_plans WHERE user_id = '33333333-0000-4000-8000-000000000003' AND source_type = 'trainer_assigned'),
  2::bigint, 'proposed and active professional plans remain independently preserved'
);
SELECT throws_ok(
  $$INSERT INTO public.trainer_assignment_versions (assignment_id, version_number, snapshot, effective_from, effective_to)
    VALUES ('11111111-0000-4000-8000-000000000071', 2, '{"schemaVersion":1}'::jsonb, NOW(), NOW() - INTERVAL '1 minute')$$,
  NULL, NULL, 'version effective range rejects a non-forward interval'
);
SELECT throws_ok(
  $$INSERT INTO public.trainer_plan_assignments (relationship_id, trainer_user_id, client_user_id, source_template_id, status)
    VALUES ('11111111-0000-4000-8000-000000000061', '11111111-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000051', 'active')$$,
  NULL, NULL, 'only one active professional assignment can exist per client'
);
SELECT throws_ok(
  $$UPDATE public.trainer_assignment_versions SET snapshot = '{"schemaVersion":1,"changed":true}'::jsonb WHERE id = '11111111-0000-4000-8000-000000000081'$$,
  'TRAINER_ASSIGNMENT_SNAPSHOT_IMMUTABLE', 'published snapshot cannot change'
);
SELECT throws_ok(
  $$UPDATE public.trainer_assignment_versions SET version_number = 2 WHERE id = '11111111-0000-4000-8000-000000000081'$$,
  'TRAINER_ASSIGNMENT_VERSION_IDENTITY_IMMUTABLE', 'published version identity cannot change'
);
SELECT throws_ok(
  $$DELETE FROM public.trainer_assignment_versions WHERE id = '11111111-0000-4000-8000-000000000081'$$,
  'TRAINER_ASSIGNMENT_VERSION_REFERENCED', 'referenced version cannot be deleted'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '11111111-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.trainer_plan_assignments), 5::bigint, 'trainer participant can read every assigned client');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '33333333-0000-4000-8000-000000000003', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.trainer_plan_assignments), 2::bigint, 'client participant can read assignments');
SELECT is((SELECT count(*) FROM public.trainer_assignment_versions), 2::bigint, 'client participant can read versions');
SELECT throws_ok(
  $$INSERT INTO public.trainer_plan_assignments (relationship_id, trainer_user_id, client_user_id) VALUES ('11111111-0000-4000-8000-000000000061', '11111111-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003')$$,
  '42501', 'permission denied for table trainer_plan_assignments', 'participants have no direct assignment writes'
);
SELECT throws_ok(
  $$INSERT INTO public.trainer_assignment_versions (assignment_id, version_number, snapshot) VALUES ('11111111-0000-4000-8000-000000000071', 3, '{"schemaVersion":1}'::jsonb)$$,
  '42501', 'permission denied for table trainer_assignment_versions', 'participants have no direct version writes'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '44444444-0000-4000-8000-000000000004', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.trainer_plan_assignments), 0::bigint, 'nonparticipant cannot read assignment');
SELECT is((SELECT count(*) FROM public.trainer_assignment_versions), 0::bigint, 'nonparticipant cannot read version');
RESET ROLE;

-- Both operations acquire the trainer advisory lock before account/profile rows.
-- A session-level guard makes both remote transactions demonstrably contend on
-- that same lock; the pg_stat_activity checks are condition based (no sleeps).
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
-- dblink sessions cannot see this test transaction's fixture rows, so prepare
-- a dedicated, committed race fixture in a third connection.
SELECT dblink_connect('program_race_setup', 'dbname=postgres user=supabase_admin');
SELECT dblink_exec('program_race_setup', $dblink$
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    ('99999999-0000-4000-8000-000000000009', 'program-race-trainer@example.test', '{}'::jsonb),
    ('aaaaaaaa-0000-4000-8000-000000000010', 'program-race-admin@example.test', '{}'::jsonb);
  INSERT INTO public.profiles (id, avatar_url, onboarding_done, account_status, is_admin) VALUES
    ('99999999-0000-4000-8000-000000000009', 'https://example.test/race-trainer.webp', TRUE, 'active', FALSE),
    ('aaaaaaaa-0000-4000-8000-000000000010', 'https://example.test/race-admin.webp', TRUE, 'active', TRUE);
  INSERT INTO public.trainer_applications (id, user_id) VALUES
    ('99999999-0000-4000-8000-000000000011', '99999999-0000-4000-8000-000000000009');
  INSERT INTO public.trainer_profiles (id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary) VALUES
    ('99999999-0000-4000-8000-000000000021', '99999999-0000-4000-8000-000000000009', '99999999-0000-4000-8000-000000000011', 'program-race-trainer', 'active', 'Race trainer', 'Race profile', 'Race evidence');
  INSERT INTO public.trainer_program_templates (id, trainer_user_id, name, days_per_week) VALUES
    ('99999999-0000-4000-8000-000000000051', '99999999-0000-4000-8000-000000000009', 'Race template', 2);
  INSERT INTO public.trainer_template_workouts (id, template_id, name, day_of_week, order_in_plan) VALUES
    ('99999999-0000-4000-8000-000000000054', '99999999-0000-4000-8000-000000000051', 'Race order one', 1, 1),
    ('99999999-0000-4000-8000-000000000055', '99999999-0000-4000-8000-000000000051', 'Race order two', 2, 2);
$dblink$);
SELECT dblink_disconnect('program_race_setup');
SELECT pg_advisory_lock(hashtextextended('99999999-0000-4000-8000-000000000009', 0));
SELECT dblink_connect('program_reorder_race', 'dbname=postgres user=supabase_admin');
SELECT dblink_connect('program_suspend_race', 'dbname=postgres user=supabase_admin');
SELECT dblink_exec('program_reorder_race', $$SET request.jwt.claim.sub = '99999999-0000-4000-8000-000000000009'$$);
SELECT dblink_exec('program_reorder_race', $$SET request.jwt.claim.role = 'authenticated'$$);
SELECT dblink_exec('program_reorder_race', 'SET ROLE authenticated');
SELECT dblink_exec('program_reorder_race', $dblink$
  CREATE OR REPLACE FUNCTION pg_temp.try_reorder_program() RETURNS JSONB LANGUAGE plpgsql AS $fn$
  BEGIN
    RETURN jsonb_build_object('ok', TRUE, 'completed_at', clock_timestamp(),
      'result', public.reorder_trainer_template_workouts(
        '99999999-0000-4000-8000-000000000051',
        ARRAY['99999999-0000-4000-8000-000000000054'::uuid, '99999999-0000-4000-8000-000000000055'::uuid]
      ));
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'completed_at', clock_timestamp(), 'sqlstate', SQLSTATE, 'message', SQLERRM);
  END;
  $fn$;
$dblink$);
SELECT dblink_exec('program_suspend_race', 'SET request.jwt.claim.role = ''service_role''');
SELECT dblink_exec('program_suspend_race', 'SET ROLE service_role');
SELECT dblink_exec('program_suspend_race', $dblink$
  CREATE OR REPLACE FUNCTION pg_temp.try_suspend_program() RETURNS JSONB LANGUAGE plpgsql AS $fn$
  BEGIN
    PERFORM public.suspend_account_and_professional(
      '99999999-0000-4000-8000-000000000009',
      'aaaaaaaa-0000-4000-8000-000000000010',
      'Programming race suspension', NULL
    );
    RETURN jsonb_build_object('ok', TRUE, 'completed_at', clock_timestamp());
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'completed_at', clock_timestamp(), 'sqlstate', SQLSTATE, 'message', SQLERRM);
  END;
  $fn$;
$dblink$);
CREATE TEMP TABLE program_race_pids (operation TEXT PRIMARY KEY, pid INTEGER NOT NULL);
INSERT INTO program_race_pids SELECT 'reorder', pid FROM dblink('program_reorder_race', 'SELECT pg_backend_pid()') AS response(pid INTEGER);
INSERT INTO program_race_pids SELECT 'suspend', pid FROM dblink('program_suspend_race', 'SELECT pg_backend_pid()') AS response(pid INTEGER);
SELECT dblink_send_query('program_reorder_race', 'SELECT pg_temp.try_reorder_program()');
DO $$
DECLARE deadline TIMESTAMPTZ := clock_timestamp() + interval '5 seconds';
BEGIN
  LOOP
    EXIT WHEN EXISTS (
      SELECT 1 FROM pg_stat_activity activity JOIN program_race_pids race ON race.pid = activity.pid
      WHERE race.operation = 'reorder' AND activity.wait_event_type = 'Lock'
    );
    IF clock_timestamp() >= deadline THEN RAISE EXCEPTION 'program reorder did not reach trainer lock guard'; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END;
$$;
SELECT dblink_send_query('program_suspend_race', 'SELECT pg_temp.try_suspend_program()');
DO $$
DECLARE deadline TIMESTAMPTZ := clock_timestamp() + interval '5 seconds';
BEGIN
  LOOP
    EXIT WHEN EXISTS (
      SELECT 1 FROM pg_stat_activity activity JOIN program_race_pids race ON race.pid = activity.pid
      WHERE race.operation = 'suspend' AND activity.wait_event_type = 'Lock'
    );
    IF clock_timestamp() >= deadline THEN RAISE EXCEPTION 'program suspension did not reach trainer lock guard'; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END;
$$;
SELECT pg_advisory_unlock(hashtextextended('99999999-0000-4000-8000-000000000009', 0));
CREATE TEMP TABLE program_race_results (operation TEXT PRIMARY KEY, result JSONB NOT NULL);
INSERT INTO program_race_results SELECT 'reorder', result FROM dblink_get_result('program_reorder_race') AS response(result JSONB);
INSERT INTO program_race_results SELECT 'suspend', result FROM dblink_get_result('program_suspend_race') AS response(result JSONB);
SELECT is((SELECT count(*) FROM program_race_results WHERE result->>'sqlstate' = '40P01'), 0::bigint, 'reorder and suspension never deadlock');
SELECT ok((SELECT (result->>'ok')::boolean FROM program_race_results WHERE operation = 'suspend'), 'administrative suspension completes in the real lock race');
SELECT ok((SELECT (result->>'ok')::boolean FROM program_race_results WHERE operation = 'reorder')
  OR (SELECT result->>'message' LIKE '%TRAINER_TEMPLATE_OWNER_REQUIRED%' FROM program_race_results WHERE operation = 'reorder'),
  'reorder either commits before suspension or rejects the inactive trainer');
SELECT ok(NOT (SELECT (result->>'ok')::boolean FROM program_race_results WHERE operation = 'reorder')
  OR (SELECT (result->>'completed_at')::timestamptz <= (SELECT result->>'completed_at' FROM program_race_results WHERE operation = 'suspend')::timestamptz FROM program_race_results WHERE operation = 'reorder'),
  'a successful reorder completes before the suspension transaction');
SELECT is((SELECT account_status FROM public.profiles WHERE id = '99999999-0000-4000-8000-000000000009'), 'suspended', 'race leaves the trainer account suspended');
SELECT is((SELECT status FROM public.trainer_profiles WHERE user_id = '99999999-0000-4000-8000-000000000009'), 'suspended', 'race leaves the professional profile suspended');
SELECT dblink_disconnect('program_reorder_race');
SELECT dblink_disconnect('program_suspend_race');

-- Proposal and administrative suspension share the exact trainer lock. The
-- externally held lock creates a deterministic contention point; waits below
-- are condition-based and never use arbitrary sleeps.
SELECT dblink_connect('proposal_race_setup', 'dbname=postgres user=supabase_admin');
SELECT dblink_exec('proposal_race_setup', $dblink$
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    ('88888888-0000-4000-8000-000000000009', 'proposal-race-trainer@example.test', '{}'::jsonb),
    ('bbbbbbbb-0000-4000-8000-000000000010', 'proposal-race-client@example.test', '{}'::jsonb);
  INSERT INTO public.profiles (id, avatar_url, onboarding_done, account_status) VALUES
    ('88888888-0000-4000-8000-000000000009', 'https://example.test/proposal-trainer.webp', TRUE, 'active'),
    ('bbbbbbbb-0000-4000-8000-000000000010', 'https://example.test/proposal-client.webp', TRUE, 'active');
  INSERT INTO public.trainer_applications (id, user_id) VALUES ('88888888-0000-4000-8000-000000000011', '88888888-0000-4000-8000-000000000009');
  INSERT INTO public.trainer_profiles (id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary) VALUES
    ('88888888-0000-4000-8000-000000000021', '88888888-0000-4000-8000-000000000009', '88888888-0000-4000-8000-000000000011', 'proposal-race-trainer', 'active', 'Proposal trainer', 'Race profile', 'Race evidence');
  INSERT INTO public.trainer_service_offerings (id, trainer_profile_id, name, modality, duration_minutes) VALUES
    ('88888888-0000-4000-8000-000000000031', '88888888-0000-4000-8000-000000000021', 'Proposal service', 'online', 60);
  INSERT INTO public.exercises (id, name) VALUES ('88888888-0000-4000-8000-000000000041', 'Race squat');
  INSERT INTO public.trainer_program_templates (id, trainer_user_id, name, days_per_week) VALUES
    ('88888888-0000-4000-8000-000000000051', '88888888-0000-4000-8000-000000000009', 'Proposal race template', 1);
  INSERT INTO public.trainer_template_workouts (id, template_id, name, day_of_week, order_in_plan) VALUES
    ('88888888-0000-4000-8000-000000000054', '88888888-0000-4000-8000-000000000051', 'Proposal race day', 1, 1);
  INSERT INTO public.trainer_template_exercises (id, template_workout_id, exercise_id, order_index, sets, reps, rest_seconds) VALUES
    ('88888888-0000-4000-8000-000000000056', '88888888-0000-4000-8000-000000000054', '88888888-0000-4000-8000-000000000041', 1, 3, 8, 60);
  INSERT INTO public.coaching_relationships (id, service_id, trainer_user_id, client_user_id, status) VALUES
    ('88888888-0000-4000-8000-000000000061', '88888888-0000-4000-8000-000000000031', '88888888-0000-4000-8000-000000000009', 'bbbbbbbb-0000-4000-8000-000000000010', 'active');
  INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by) VALUES
    ('88888888-0000-4000-8000-000000000061', 'training_profile', 'training-profile-v1', 'bbbbbbbb-0000-4000-8000-000000000010');
$dblink$);
SELECT dblink_disconnect('proposal_race_setup');
SELECT pg_advisory_lock(hashtextextended('88888888-0000-4000-8000-000000000009', 0));
SELECT dblink_connect('proposal_race_propose', 'dbname=postgres user=supabase_admin');
SELECT dblink_connect('proposal_race_suspend', 'dbname=postgres user=supabase_admin');
SELECT dblink_exec('proposal_race_propose', $$SET request.jwt.claim.sub = '88888888-0000-4000-8000-000000000009'$$);
SELECT dblink_exec('proposal_race_propose', $$SET request.jwt.claim.role = 'authenticated'$$);
SELECT dblink_exec('proposal_race_propose', 'SET ROLE authenticated');
SELECT dblink_exec('proposal_race_propose', $dblink$
  CREATE OR REPLACE FUNCTION pg_temp.try_propose_assignment() RETURNS JSONB LANGUAGE plpgsql AS $fn$
  DECLARE v_result JSONB;
  BEGIN
    SELECT jsonb_build_object('assignment_id', proposal.assignment_id, 'assignment_version_id', proposal.assignment_version_id, 'workout_plan_id', proposal.workout_plan_id)
    INTO v_result
    FROM public.propose_trainer_assignment(
      '88888888-0000-4000-8000-000000000061', '88888888-0000-4000-8000-000000000051', NULL, 'proposal-race-key'
    ) AS proposal;
    RETURN jsonb_build_object('ok', TRUE, 'completed_at', clock_timestamp(), 'result', v_result);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'completed_at', clock_timestamp(), 'sqlstate', SQLSTATE, 'message', SQLERRM);
  END;
  $fn$;
$dblink$);
SELECT dblink_exec('proposal_race_suspend', 'SET request.jwt.claim.role = ''service_role''');
SELECT dblink_exec('proposal_race_suspend', 'SET ROLE service_role');
SELECT dblink_exec('proposal_race_suspend', $dblink$
  CREATE OR REPLACE FUNCTION pg_temp.try_suspend_proposal_trainer() RETURNS JSONB LANGUAGE plpgsql AS $fn$
  BEGIN
    PERFORM public.suspend_account_and_professional('88888888-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-000000000010', 'Proposal race suspension', NULL);
    RETURN jsonb_build_object('ok', TRUE, 'completed_at', clock_timestamp());
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'completed_at', clock_timestamp(), 'sqlstate', SQLSTATE, 'message', SQLERRM);
  END;
  $fn$;
$dblink$);
SELECT dblink_send_query('proposal_race_propose', 'SELECT pg_temp.try_propose_assignment()');
DO $$ DECLARE deadline TIMESTAMPTZ := clock_timestamp() + interval '5 seconds'; BEGIN LOOP EXIT WHEN dblink_is_busy('proposal_race_propose') = 1; IF clock_timestamp() >= deadline THEN RAISE EXCEPTION 'proposal race query was not dispatched'; END IF; PERFORM pg_sleep(0.01); END LOOP; END; $$;
SELECT dblink_send_query('proposal_race_suspend', 'SELECT pg_temp.try_suspend_proposal_trainer()');
DO $$ DECLARE deadline TIMESTAMPTZ := clock_timestamp() + interval '5 seconds'; BEGIN LOOP EXIT WHEN dblink_is_busy('proposal_race_suspend') = 1; IF clock_timestamp() >= deadline THEN RAISE EXCEPTION 'proposal suspension race query was not dispatched'; END IF; PERFORM pg_sleep(0.01); END LOOP; END; $$;
SELECT pg_advisory_unlock(hashtextextended('88888888-0000-4000-8000-000000000009', 0));
CREATE TEMP TABLE proposal_race_results (operation TEXT PRIMARY KEY, result JSONB NOT NULL);
INSERT INTO proposal_race_results SELECT 'propose', result FROM dblink_get_result('proposal_race_propose') AS response(result JSONB);
INSERT INTO proposal_race_results SELECT 'suspend', result FROM dblink_get_result('proposal_race_suspend') AS response(result JSONB);
SELECT is((SELECT count(*) FROM proposal_race_results WHERE result->>'sqlstate' = '40P01'), 0::bigint, 'proposal and suspension never deadlock');
SELECT ok((SELECT (result->>'ok')::boolean FROM proposal_race_results WHERE operation = 'suspend'), 'administrative suspension completes in the proposal race');
SELECT ok((SELECT (result->>'ok')::boolean FROM proposal_race_results WHERE operation = 'propose') OR (SELECT result->>'message' LIKE '%COACHING_RELATIONSHIP_NOT_ACTIVE%' OR result->>'message' LIKE '%TRAINER_ASSIGNMENT_TRAINER_INACTIVE%' FROM proposal_race_results WHERE operation = 'propose'), 'proposal either completes before suspension or rejects the now inactive relationship');
SELECT ok(NOT (SELECT (result->>'ok')::boolean FROM proposal_race_results WHERE operation = 'propose') OR (SELECT (result->>'completed_at')::timestamptz <= (SELECT result->>'completed_at' FROM proposal_race_results WHERE operation = 'suspend')::timestamptz FROM proposal_race_results WHERE operation = 'propose'), 'proposal never succeeds after suspension validation completes');
SELECT ok(NOT (SELECT (result->>'ok')::boolean FROM proposal_race_results WHERE operation = 'propose') OR ((SELECT status FROM public.coaching_relationships WHERE id = '88888888-0000-4000-8000-000000000061') = 'paused_by_platform' AND NOT EXISTS (SELECT 1 FROM public.coaching_consents WHERE relationship_id = '88888888-0000-4000-8000-000000000061' AND revoked_at IS NULL)), 'a winning proposal is immediately suspension-consistent');
SELECT dblink_disconnect('proposal_race_propose');
SELECT dblink_disconnect('proposal_race_suspend');

-- Fixture for the notification-failure rollback test below. The real dblink
-- acceptance race is run after this pgTAP transaction rolls back, so both
-- independent sessions observe committed state.
RESET ROLE;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('99999999-0000-4000-8000-000000000001', 'accept-race-trainer@example.test', '{}'::jsonb),
  ('99999999-0000-4000-8000-000000000003', 'accept-failure-client@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id, avatar_url, onboarding_done, account_status) VALUES
  ('99999999-0000-4000-8000-000000000001', 'https://example.test/race-trainer.webp', TRUE, 'active'),
  ('99999999-0000-4000-8000-000000000003', 'https://example.test/failure-client.webp', TRUE, 'active');
INSERT INTO public.trainer_applications (id, user_id) VALUES ('99999999-0000-4000-8000-000000000111', '99999999-0000-4000-8000-000000000001');
INSERT INTO public.trainer_profiles (id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary) VALUES
  ('99999999-0000-4000-8000-000000000121', '99999999-0000-4000-8000-000000000001', '99999999-0000-4000-8000-000000000111', 'accept-race-trainer', 'active', 'Acceptance trainer', 'Race', 'Evidence');
INSERT INTO public.trainer_service_offerings (id, trainer_profile_id, name, modality, duration_minutes) VALUES
  ('99999999-0000-4000-8000-000000000131', '99999999-0000-4000-8000-000000000121', 'Acceptance service', 'online', 60);
INSERT INTO public.coaching_relationships (id, service_id, trainer_user_id, client_user_id, status) VALUES
  ('99999999-0000-4000-8000-000000000142', '99999999-0000-4000-8000-000000000131', '99999999-0000-4000-8000-000000000001', '99999999-0000-4000-8000-000000000003', 'active');
INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by) VALUES
  ('99999999-0000-4000-8000-000000000142', 'training_profile', 'training-profile-v1', '99999999-0000-4000-8000-000000000003');
INSERT INTO public.workout_plans (id, user_id, name, family_id, is_active) VALUES
  ('99999999-0000-4000-8000-000000000052', '99999999-0000-4000-8000-000000000003', 'Failure personal', gen_random_uuid(), TRUE);
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.trainer_plan_assignments (id, relationship_id, trainer_user_id, client_user_id, status) VALUES
  ('99999999-0000-4000-8000-000000000063', '99999999-0000-4000-8000-000000000142', '99999999-0000-4000-8000-000000000001', '99999999-0000-4000-8000-000000000003', 'proposed');
INSERT INTO public.trainer_assignment_versions (id, assignment_id, version_number, snapshot, status, materialized_plan_id) VALUES
  ('99999999-0000-4000-8000-000000000073', '99999999-0000-4000-8000-000000000063', 1, '{"schemaVersion":1}'::jsonb, 'proposed', '99999999-0000-4000-8000-000000000083');
INSERT INTO public.workout_plans (id, user_id, name, family_id, source_type, library_slot, prescription_locked, trainer_relationship_id, trainer_assignment_id, trainer_assignment_version_id) VALUES
  ('99999999-0000-4000-8000-000000000083', '99999999-0000-4000-8000-000000000003', 'Failure pro', gen_random_uuid(), 'trainer_assigned', 'professional', TRUE, '99999999-0000-4000-8000-000000000142', '99999999-0000-4000-8000-000000000063', '99999999-0000-4000-8000-000000000073');
SET CONSTRAINTS ALL IMMEDIATE;

-- A notification failure happens after the old plan would normally be
-- deactivated. The transaction must roll every preceding mutation back.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '99999999-0000-4000-8000-000000000003', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT set_config('app.test_fail_acceptance_notification', 'on', true);
SELECT throws_ok(
  $$SELECT public.accept_trainer_assignment('99999999-0000-4000-8000-000000000063', 'accept-failure-key')$$,
  'TEST_ACCEPTANCE_NOTIFICATION_FAILURE', 'notification failure aborts acceptance after activation work begins'
);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT ok((SELECT is_active FROM public.workout_plans WHERE id = '99999999-0000-4000-8000-000000000052'), 'rollback restores the previous personal plan as active');
SELECT ok(NOT (SELECT is_active FROM public.workout_plans WHERE id = '99999999-0000-4000-8000-000000000083'), 'rollback keeps the professional plan inactive');
SELECT ok((SELECT status = 'proposed' AND accepted_at IS NULL AND acceptance_idempotency_key IS NULL FROM public.trainer_plan_assignments WHERE id = '99999999-0000-4000-8000-000000000063') AND (SELECT status = 'proposed' FROM public.trainer_assignment_versions WHERE id = '99999999-0000-4000-8000-000000000073'), 'rollback leaves assignment and version proposed without acceptance state');
SELECT is((SELECT count(*) FROM public.professional_audit_logs WHERE entity_id = '99999999-0000-4000-8000-000000000063') + (SELECT count(*) FROM public.product_notifications WHERE dedupe_key = 'coaching-assignment-accepted:99999999-0000-4000-8000-000000000063'), 0::bigint, 'rollback writes no partial audit or notification');

-- A later revision is a new immutable snapshot: it switches only the current
-- plan/version while the previous materialization remains historical data.
RESET ROLE;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('dddddddd-0000-4000-8000-000000000001', 'revision-client@example.test', '{}'::jsonb);
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
INSERT INTO public.profiles (id, avatar_url, onboarding_done, account_status) VALUES
  ('dddddddd-0000-4000-8000-000000000001', 'https://example.test/revision-client.webp', TRUE, 'active');
INSERT INTO public.coaching_relationships (id, service_id, trainer_user_id, client_user_id, status) VALUES
  ('dddddddd-0000-4000-8000-000000000011', '11111111-0000-4000-8000-000000000031', '11111111-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 'active');
INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by) VALUES
  ('dddddddd-0000-4000-8000-000000000011', 'training_profile', 'training-profile-v1', 'dddddddd-0000-4000-8000-000000000001');
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.trainer_plan_assignments (id, relationship_id, trainer_user_id, client_user_id, source_template_id, status)
VALUES ('dddddddd-0000-4000-8000-000000000021', 'dddddddd-0000-4000-8000-000000000011', '11111111-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000051', 'active');
INSERT INTO public.trainer_assignment_versions (id, assignment_id, version_number, snapshot, status, materialized_plan_id)
VALUES ('dddddddd-0000-4000-8000-000000000031', 'dddddddd-0000-4000-8000-000000000021', 1, '{"schemaVersion":1}'::jsonb, 'active', 'dddddddd-0000-4000-8000-000000000041');
INSERT INTO public.workout_plans (id, user_id, name, family_id, is_active, source_type, library_slot, prescription_locked, trainer_relationship_id, trainer_assignment_id, trainer_assignment_version_id)
VALUES ('dddddddd-0000-4000-8000-000000000041', 'dddddddd-0000-4000-8000-000000000001', 'Revision v1', gen_random_uuid(), TRUE, 'trainer_assigned', 'professional', TRUE, 'dddddddd-0000-4000-8000-000000000011', 'dddddddd-0000-4000-8000-000000000021', 'dddddddd-0000-4000-8000-000000000031');
UPDATE public.trainer_plan_assignments SET active_version_id = 'dddddddd-0000-4000-8000-000000000031' WHERE id = 'dddddddd-0000-4000-8000-000000000021';
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '11111111-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '11111111-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.publish_trainer_assignment_revision('dddddddd-0000-4000-8000-000000000021', '11111111-0000-4000-8000-000000000051', 'Aumentamos una repetición.', 'revision-publish-key')$$,
  'trainer publishes a complete future-only revision atomically'
);
SELECT is((SELECT count(*) FROM public.trainer_assignment_versions WHERE assignment_id = 'dddddddd-0000-4000-8000-000000000021'), 2::bigint, 'revision creates exactly version N plus one');
SELECT is((SELECT version.status FROM public.trainer_assignment_versions version WHERE version.id = 'dddddddd-0000-4000-8000-000000000031'), 'superseded', 'previous immutable version is superseded');
SELECT ok((SELECT effective_to IS NOT NULL FROM public.trainer_assignment_versions WHERE id = 'dddddddd-0000-4000-8000-000000000031'), 'previous version receives an effective end');
SELECT is((SELECT version_number FROM public.trainer_assignment_versions version JOIN public.trainer_plan_assignments assignment ON assignment.active_version_id = version.id WHERE assignment.id = 'dddddddd-0000-4000-8000-000000000021'), 2, 'assignment atomically points at the new active version');
SELECT is((SELECT count(*) FROM public.workouts workout JOIN public.workout_plans plan ON plan.id = workout.plan_id WHERE plan.trainer_assignment_id = 'dddddddd-0000-4000-8000-000000000021' AND plan.is_active), 2::bigint, 'revision fully materializes every template workout before activation');
SELECT is((SELECT count(*) FROM public.workout_exercises exercise JOIN public.workouts workout ON workout.id = exercise.workout_id JOIN public.workout_plans plan ON plan.id = workout.plan_id WHERE plan.trainer_assignment_id = 'dddddddd-0000-4000-8000-000000000021' AND plan.is_active), 3::bigint, 'revision fully materializes every template exercise before activation');
SELECT is((SELECT count(*) FROM public.workout_plans WHERE trainer_assignment_id = 'dddddddd-0000-4000-8000-000000000021' AND is_active), 1::bigint, 'revision leaves one current professional materialization');
SELECT is((SELECT workout_plan_id FROM public.publish_trainer_assignment_revision('dddddddd-0000-4000-8000-000000000021', '11111111-0000-4000-8000-000000000051', 'Ignored retry summary', 'revision-publish-key')),
  (SELECT materialized_plan_id FROM public.trainer_assignment_versions WHERE revision_idempotency_key = 'revision-publish-key'), 'revision retry returns its original materialization');
SELECT is((SELECT count(*) FROM public.trainer_assignment_versions WHERE revision_idempotency_key = 'revision-publish-key'), 1::bigint, 'revision retry creates no duplicate version');
SELECT throws_ok(
  $$SELECT public.publish_trainer_assignment_revision('dddddddd-0000-4000-8000-000000000021', '11111111-0000-4000-8000-000000000051', '   ', 'revision-empty-summary')$$,
  'TRAINER_ASSIGNMENT_REVISION_INVALID', 'revision requires a non-blank change summary'
);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
UPDATE public.coaching_relationships SET status = 'paused_by_platform', paused_at = NOW() WHERE id = 'dddddddd-0000-4000-8000-000000000011';
SELECT is((SELECT status FROM public.trainer_plan_assignments WHERE id = 'dddddddd-0000-4000-8000-000000000021'), 'frozen', 'platform pause freezes the active assignment without deleting its plan');
SELECT set_config('app.plan_lifecycle_actor', 'dddddddd-0000-4000-8000-000000000001', true);
UPDATE public.workout_plans SET is_active = FALSE WHERE id = (SELECT materialized_plan_id FROM public.trainer_assignment_versions WHERE id = (SELECT active_version_id FROM public.trainer_plan_assignments WHERE id = 'dddddddd-0000-4000-8000-000000000021'));
INSERT INTO public.workout_plans (id, user_id, name, family_id, is_active) VALUES ('dddddddd-0000-4000-8000-000000000051', 'dddddddd-0000-4000-8000-000000000001', 'Temporary personal resume choice', gen_random_uuid(), TRUE);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'dddddddd-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.resume_paused_coaching_relationship('dddddddd-0000-4000-8000-000000000011', 'dddddddd-0000-4000-8000-000000000012')$$, 'client confirmation resumes the paused relationship');
SELECT is((SELECT status FROM public.trainer_plan_assignments WHERE id = 'dddddddd-0000-4000-8000-000000000021'), 'active', 'resume restores the last frozen assignment only after client confirmation');
SELECT ok(NOT (SELECT is_active FROM public.workout_plans WHERE id = 'dddddddd-0000-4000-8000-000000000051') AND (SELECT is_active FROM public.workout_plans WHERE trainer_assignment_version_id = (SELECT active_version_id FROM public.trainer_plan_assignments WHERE id = 'dddddddd-0000-4000-8000-000000000021')), 'resume deactivates the alternate personal plan and restores the frozen professional plan');
SELECT is((SELECT count(*) FROM public.workout_plans WHERE user_id = 'dddddddd-0000-4000-8000-000000000001' AND is_active), 1::bigint, 'resume leaves exactly one active plan');

-- v3 uses immutable authorization evidence and validates server-side plan
-- identities, never mutable client ids.
-- This fixture is inserted through the protected authorization table to
-- exercise real persistence and rejection paths under an authenticated user.
RESET ROLE;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('f1111111-0000-4000-8000-000000000001', 'locked-session@example.test', '{}'::jsonb),
  ('f1111111-0000-4000-8000-000000000002', 'locked-skip@example.test', '{}'::jsonb);
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
INSERT INTO public.profiles (id, avatar_url, onboarding_done, account_status) VALUES
  ('f1111111-0000-4000-8000-000000000001', 'https://example.test/locked-session.webp', TRUE, 'active'),
  ('f1111111-0000-4000-8000-000000000002', 'https://example.test/locked-skip.webp', TRUE, 'active');
INSERT INTO public.exercises (id, name) VALUES
  ('f1111111-0000-4000-8000-000000000011', 'Locked extra exercise');
INSERT INTO public.coaching_relationships (id, service_id, trainer_user_id, client_user_id, status) VALUES
  ('f1111111-0000-4000-8000-000000000051', '11111111-0000-4000-8000-000000000031', '11111111-0000-4000-8000-000000000001', 'f1111111-0000-4000-8000-000000000001', 'active'),
  ('f1111111-0000-4000-8000-000000000052', '11111111-0000-4000-8000-000000000031', '11111111-0000-4000-8000-000000000001', 'f1111111-0000-4000-8000-000000000002', 'active');
INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by) VALUES
  ('f1111111-0000-4000-8000-000000000051', 'training_profile', 'training-profile-v1', 'f1111111-0000-4000-8000-000000000001'),
  ('f1111111-0000-4000-8000-000000000052', 'training_profile', 'training-profile-v1', 'f1111111-0000-4000-8000-000000000002');
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.trainer_plan_assignments (id, relationship_id, trainer_user_id, client_user_id, status, accepted_at, active_version_id) VALUES
  ('f1111111-0000-4000-8000-000000000061', 'f1111111-0000-4000-8000-000000000051', '11111111-0000-4000-8000-000000000001', 'f1111111-0000-4000-8000-000000000001', 'active', NOW(), 'f1111111-0000-4000-8000-000000000071'),
  ('f1111111-0000-4000-8000-000000000062', 'f1111111-0000-4000-8000-000000000052', '11111111-0000-4000-8000-000000000001', 'f1111111-0000-4000-8000-000000000002', 'active', NOW(), 'f1111111-0000-4000-8000-000000000072');
INSERT INTO public.trainer_assignment_versions (id, assignment_id, version_number, snapshot, status, materialized_plan_id) VALUES
  ('f1111111-0000-4000-8000-000000000071', 'f1111111-0000-4000-8000-000000000061', 1, '{"schemaVersion":1}'::jsonb, 'active', 'f1111111-0000-4000-8000-000000000021'),
  ('f1111111-0000-4000-8000-000000000072', 'f1111111-0000-4000-8000-000000000062', 1, '{"schemaVersion":1}'::jsonb, 'active', 'f1111111-0000-4000-8000-000000000022');
INSERT INTO public.workout_plans (id, user_id, name, family_id, is_active, source_type, library_slot, prescription_locked, trainer_relationship_id, trainer_assignment_id, trainer_assignment_version_id) VALUES
  ('f1111111-0000-4000-8000-000000000021', 'f1111111-0000-4000-8000-000000000001', 'Authorization fixture', gen_random_uuid(), TRUE, 'trainer_assigned', 'professional', TRUE, 'f1111111-0000-4000-8000-000000000051', 'f1111111-0000-4000-8000-000000000061', 'f1111111-0000-4000-8000-000000000071'),
  ('f1111111-0000-4000-8000-000000000022', 'f1111111-0000-4000-8000-000000000002', 'Skip fixture', gen_random_uuid(), TRUE, 'trainer_assigned', 'professional', TRUE, 'f1111111-0000-4000-8000-000000000052', 'f1111111-0000-4000-8000-000000000062', 'f1111111-0000-4000-8000-000000000072');
SET CONSTRAINTS ALL IMMEDIATE;
INSERT INTO public.workouts (id, user_id, plan_id, name, day_of_week, order_in_plan) VALUES
  ('f1111111-0000-4000-8000-000000000031', 'f1111111-0000-4000-8000-000000000001', 'f1111111-0000-4000-8000-000000000021', 'Locked day', 1, 1),
  ('f1111111-0000-4000-8000-000000000032', 'f1111111-0000-4000-8000-000000000002', 'f1111111-0000-4000-8000-000000000022', 'Skip day', 1, 1);
INSERT INTO public.workout_exercises (workout_id, exercise_id, order_index, sets, reps, rest_seconds) VALUES
  ('f1111111-0000-4000-8000-000000000031', '11111111-0000-4000-8000-000000000041', 1, 3, 8, 60),
  ('f1111111-0000-4000-8000-000000000032', '11111111-0000-4000-8000-000000000041', 1, 3, 8, 60);

CREATE OR REPLACE FUNCTION pg_temp.seed_locked_session(p_client_session_id UUID, p_user_id UUID, p_plan_id UUID, p_workout_id UUID, p_assignment_id UUID, p_version_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_start TIMESTAMPTZ := date_trunc('day', NOW());
BEGIN
  INSERT INTO public.session_authorizations (
    client_session_id, user_id, workout_id, plan_id, session_context_snapshot,
    policy_timezone, policy_date, policy_day_start, policy_day_end,
    workout_window_start, created_at, expires_at
  ) VALUES (
    p_client_session_id,
    p_user_id,
    p_workout_id,
    p_plan_id,
    jsonb_build_object(
      'version', 1,
      'workout', jsonb_build_object('id', p_workout_id, 'name', 'Locked day', 'focus', NULL, 'dayOfWeek', 1),
      'plan', jsonb_build_object('id', p_plan_id, 'familyId', gen_random_uuid(), 'name', 'Professional snapshot', 'weekNumber', 1, 'prescriptionLocked', TRUE, 'trainerAssignmentId', p_assignment_id, 'trainerAssignmentVersionId', p_version_id),
      'exercises', jsonb_build_array(jsonb_build_object('exerciseId', '11111111-0000-4000-8000-000000000041', 'name', 'Squat', 'nameEs', NULL, 'muscleGroups', jsonb_build_array(), 'muscleGroupsEs', jsonb_build_array(), 'isCompound', FALSE))
    ),
    'UTC', v_start::DATE, v_start, v_start + INTERVAL '1 day', v_start,
    NOW(), NOW() + INTERVAL '12 hours'
  );
END;
$$;
SELECT pg_temp.seed_locked_session('f1111111-0000-4000-8000-000000000041', 'f1111111-0000-4000-8000-000000000001', 'f1111111-0000-4000-8000-000000000021', 'f1111111-0000-4000-8000-000000000031', 'f1111111-0000-4000-8000-000000000061', 'f1111111-0000-4000-8000-000000000071');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'f1111111-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.save_session_log_atomic_v3('f1111111-0000-4000-8000-000000000041', 'f1111111-0000-4000-8000-000000000031', NOW(), 40, 8, '[{"exercise_id":"11111111-0000-4000-8000-000000000041","sets_completed":2,"reps_completed":[8,9],"weights_kg":[80,82.5],"rpe_values":[7,8],"duration_seconds":null,"notes":"Real result","skip_reason":null}]'::jsonb, '{"version":1,"prs":[],"progressions":[]}'::jsonb)$$,
  'locked session saves real prescribed weights, reps and RPE through v3'
);
SELECT is((SELECT sets_completed FROM public.exercise_logs WHERE progress_log_id = (SELECT id FROM public.progress_logs WHERE client_session_id = 'f1111111-0000-4000-8000-000000000041')), 2, 'v3 persists real completed-set evidence');
SELECT is((SELECT session_context_snapshot->'plan'->>'prescriptionLocked' FROM public.progress_logs WHERE client_session_id = 'f1111111-0000-4000-8000-000000000041'), 'true', 'v3 persists the locked authorization snapshot');
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.save_session_log_atomic_v2(uuid,uuid,timestamptz,integer,integer,jsonb,jsonb)'::regprocedure,
    'EXECUTE'
  ),
  'authenticated clients cannot bypass v3 locked-plan validation through v2'
);
SELECT is(
  (
    SELECT inserted
    FROM public.save_session_log_atomic_v3(
      'f1111111-0000-4000-8000-000000000041',
      'f1111111-0000-4000-8000-000000000031',
      NOW(), 40, 8,
      '[{"exercise_id":"11111111-0000-4000-8000-000000000041","sets_completed":2,"reps_completed":[8,9],"weights_kg":[80,82.5],"rpe_values":[7,8],"duration_seconds":null,"notes":"Retry","skip_reason":null}]'::jsonb,
      '{"version":1,"prs":[],"progressions":[]}'::jsonb
    )
  ),
  FALSE,
  'locked v3 retries preserve v2 idempotency after the authorization is consumed'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.seed_locked_session('f1111111-0000-4000-8000-000000000045', 'f1111111-0000-4000-8000-000000000002', 'f1111111-0000-4000-8000-000000000022', 'f1111111-0000-4000-8000-000000000032', 'f1111111-0000-4000-8000-000000000062', 'f1111111-0000-4000-8000-000000000072');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'f1111111-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.save_session_log_atomic_v3('f1111111-0000-4000-8000-000000000045', 'f1111111-0000-4000-8000-000000000032', NOW(), 20, NULL, '[{"exercise_id":"11111111-0000-4000-8000-000000000041","sets_completed":0,"reps_completed":[],"weights_kg":[],"rpe_values":[],"duration_seconds":null,"notes":null,"skip_reason":"Dolor de rodilla"}]'::jsonb, '{"version":1,"prs":[],"progressions":[]}'::jsonb)$$,
  'locked session accepts an explicit skipped prescribed exercise'
);
SELECT is((SELECT sets_completed FROM public.exercise_logs WHERE progress_log_id = (SELECT id FROM public.progress_logs WHERE client_session_id = 'f1111111-0000-4000-8000-000000000045')), 0, 'v3 persists the skipped zero-set result');
SELECT is((SELECT notes FROM public.exercise_logs WHERE progress_log_id = (SELECT id FROM public.progress_logs WHERE client_session_id = 'f1111111-0000-4000-8000-000000000045')), 'Saltado: Dolor de rodilla.', 'v3 normalizes and preserves the explicit skip reason');

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.seed_locked_session('f1111111-0000-4000-8000-000000000042', 'f1111111-0000-4000-8000-000000000001', 'f1111111-0000-4000-8000-000000000021', 'f1111111-0000-4000-8000-000000000031', 'f1111111-0000-4000-8000-000000000061', 'f1111111-0000-4000-8000-000000000071');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'f1111111-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.save_session_log_atomic_v3('f1111111-0000-4000-8000-000000000042', 'f1111111-0000-4000-8000-000000000031', NOW(), 40, NULL, '[{"exercise_id":"11111111-0000-4000-8000-000000000041","sets_completed":0,"reps_completed":[],"weights_kg":[],"rpe_values":[],"duration_seconds":null,"notes":null,"skip_reason":""}]'::jsonb, '{"version":1,"prs":[],"progressions":[]}'::jsonb)$$,
  'SESSION_PROFESSIONAL_SKIP_REASON_REQUIRED', 'locked omission without an explicit reason is rejected'
);
RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE public.session_authorizations SET released_at = NOW() WHERE client_session_id = 'f1111111-0000-4000-8000-000000000042';
SELECT pg_temp.seed_locked_session('f1111111-0000-4000-8000-000000000043', 'f1111111-0000-4000-8000-000000000001', 'f1111111-0000-4000-8000-000000000021', 'f1111111-0000-4000-8000-000000000031', 'f1111111-0000-4000-8000-000000000061', 'f1111111-0000-4000-8000-000000000071');
UPDATE public.session_authorizations
SET session_context_snapshot = jsonb_set(
  session_context_snapshot,
  '{plan}',
  (session_context_snapshot->'plan') - 'prescriptionLocked'
)
WHERE client_session_id = 'f1111111-0000-4000-8000-000000000043';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'f1111111-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.save_session_log_atomic_v3('f1111111-0000-4000-8000-000000000043', 'f1111111-0000-4000-8000-000000000031', NOW(), 40, NULL, '[{"exercise_id":"f1111111-0000-4000-8000-000000000011","sets_completed":1,"reps_completed":[8],"weights_kg":[10],"rpe_values":[7],"duration_seconds":null,"notes":null,"skip_reason":null}]'::jsonb, '{"version":1,"prs":[],"progressions":[]}'::jsonb)$$,
  'SESSION_PROFESSIONAL_EXERCISE_FORBIDDEN', 'legacy authorization without a lock flag still rejects an extra or substituted exercise id from the locked database plan'
);
RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE public.session_authorizations SET released_at = NOW() WHERE client_session_id = 'f1111111-0000-4000-8000-000000000043';
SELECT pg_temp.seed_locked_session('f1111111-0000-4000-8000-000000000044', 'f1111111-0000-4000-8000-000000000001', 'f1111111-0000-4000-8000-000000000021', 'f1111111-0000-4000-8000-000000000031', 'f1111111-0000-4000-8000-000000000061', 'f1111111-0000-4000-8000-000000000071');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'f1111111-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.save_session_log_atomic_v3('f1111111-0000-4000-8000-000000000044', 'f1111111-0000-4000-8000-000000000031', NOW(), 40, NULL, '[{"exercise_id":"11111111-0000-4000-8000-000000000041","sets_completed":1,"reps_completed":[8],"weights_kg":[10],"rpe_values":[7],"duration_seconds":null,"notes":null,"skip_reason":null},{"exercise_id":"11111111-0000-4000-8000-000000000041","sets_completed":1,"reps_completed":[8],"weights_kg":[10],"rpe_values":[7],"duration_seconds":null,"notes":null,"skip_reason":null}]'::jsonb, '{"version":1,"prs":[],"progressions":[]}'::jsonb)$$,
  'SESSION_PROFESSIONAL_EXERCISE_DUPLICATE', 'locked session rejects duplicate exercise evidence'
);

SELECT * FROM finish();
ROLLBACK;

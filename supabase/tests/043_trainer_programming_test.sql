BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(40);

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
  1::bigint, 'the professional plan remains independently preserved'
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
SELECT is((SELECT count(*) FROM public.trainer_plan_assignments), 4::bigint, 'trainer participant can read every assigned client');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '33333333-0000-4000-8000-000000000003', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.trainer_plan_assignments), 1::bigint, 'client participant can read assignment');
SELECT is((SELECT count(*) FROM public.trainer_assignment_versions), 1::bigint, 'client participant can read versions');
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

SELECT * FROM finish();
ROLLBACK;

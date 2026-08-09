BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(22);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-0000-4000-8000-000000000001', 'program-owner@example.test', '{}'::jsonb),
  ('22222222-0000-4000-8000-000000000002', 'program-other@example.test', '{}'::jsonb),
  ('33333333-0000-4000-8000-000000000003', 'program-client@example.test', '{}'::jsonb),
  ('44444444-0000-4000-8000-000000000004', 'program-outsider@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id, avatar_url, onboarding_done, account_status) VALUES
  ('11111111-0000-4000-8000-000000000001', 'https://example.test/owner.webp', TRUE, 'active'),
  ('22222222-0000-4000-8000-000000000002', 'https://example.test/other.webp', TRUE, 'active'),
  ('33333333-0000-4000-8000-000000000003', 'https://example.test/client.webp', TRUE, 'active'),
  ('44444444-0000-4000-8000-000000000004', 'https://example.test/outsider.webp', TRUE, 'active');
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
SELECT is((SELECT count(*) FROM public.trainer_plan_assignments), 1::bigint, 'trainer participant can read assignment');
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

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(178);

CREATE TEMP TABLE expected_trainer_sensitive_tables (table_name TEXT PRIMARY KEY) ON COMMIT DROP;
INSERT INTO expected_trainer_sensitive_tables (table_name) VALUES
  ('admin_audit_logs'), ('coaching_consents'), ('coaching_relationships'), ('coaching_requests'),
  ('exercise_logs'), ('measurements'), ('product_notification_preferences'), ('product_notifications'),
  ('product_push_tokens'), ('professional_audit_logs'), ('profiles'), ('progress_logs'),
  ('session_authorizations'), ('trainer_application_credentials'), ('trainer_application_events'),
  ('trainer_applications'), ('trainer_assignment_versions'), ('trainer_credential_storage_cleanup'),
  ('trainer_interviews'), ('trainer_plan_assignments'), ('trainer_profiles'), ('trainer_program_templates'),
  ('trainer_service_offerings'), ('trainer_template_exercises'), ('trainer_template_workouts'),
  ('workout_exercises'), ('workout_plans'), ('workouts');

SELECT is((SELECT count(*) FROM expected_trainer_sensitive_tables), 28::BIGINT, 'sensitive-table inventory is exact and exhaustive');
SELECT is(
  (SELECT count(*) FROM expected_trainer_sensitive_tables expected JOIN pg_class relation ON relation.relname = expected.table_name JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace AND namespace.nspname = 'public'),
  28::BIGINT,
  'every sensitive table exists in the effective schema'
);
SELECT ok(NOT EXISTS (
  SELECT 1 FROM expected_trainer_sensitive_tables expected
  JOIN pg_class relation ON relation.relname = expected.table_name
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace AND namespace.nspname = 'public'
  WHERE NOT relation.relrowsecurity
), 'every sensitive table has effective RLS enabled');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM expected_trainer_sensitive_tables expected
  JOIN pg_class relation ON relation.relname = expected.table_name
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace AND namespace.nspname = 'public'
  WHERE NOT relation.relforcerowsecurity
), 'every sensitive table has effective FORCE RLS');
SELECT set_eq(
  $$SELECT tablename || '|' || policyname || '|' || cmd || '|' || array_to_string(roles, ',') FROM pg_policies WHERE schemaname = 'public' AND tablename IN (SELECT table_name FROM expected_trainer_sensitive_tables)$$,
  $$VALUES
    ('coaching_consents|coaching_consents: consent-bound participants|SELECT|authenticated'),
    ('coaching_relationships|coaching_relationships: consent-bound participants|SELECT|authenticated'),
    ('coaching_requests|coaching_requests: consent-bound participants|SELECT|authenticated'),
    ('exercise_logs|exercise_logs: own|ALL|public'), ('measurements|measurements: own|ALL|public'),
    ('product_notification_preferences|product_notification_preferences: read own|SELECT|authenticated'),
    ('product_notification_preferences|product_notification_preferences: update own|UPDATE|authenticated'),
    ('product_notifications|product_notifications: read own|SELECT|authenticated'),
    ('product_notifications|product_notifications: update own read state|UPDATE|authenticated'),
    ('product_push_tokens|product_push_tokens: insert own|INSERT|authenticated'),
    ('product_push_tokens|product_push_tokens: read own|SELECT|authenticated'),
    ('product_push_tokens|product_push_tokens: update own|UPDATE|authenticated'),
    ('profiles|profiles: own row|ALL|public'), ('progress_logs|progress_logs: own|ALL|public'),
    ('session_authorizations|session_authorizations: own read|SELECT|public'),
    ('trainer_application_credentials|trainer_application_credentials: active account|ALL|authenticated'),
    ('trainer_application_credentials|trainer_application_credentials: delete own editable|DELETE|authenticated'),
    ('trainer_application_credentials|trainer_application_credentials: insert own editable|INSERT|authenticated'),
    ('trainer_application_credentials|trainer_application_credentials: select own|SELECT|authenticated'),
    ('trainer_application_credentials|trainer_application_credentials: update own editable|UPDATE|authenticated'),
    ('trainer_applications|trainer_applications: active account|ALL|authenticated'),
    ('trainer_applications|trainer_applications: delete own editable|DELETE|authenticated'),
    ('trainer_applications|trainer_applications: insert own draft|INSERT|authenticated'),
    ('trainer_applications|trainer_applications: read own|SELECT|authenticated'),
    ('trainer_applications|trainer_applications: update own editable|UPDATE|authenticated'),
    ('trainer_assignment_versions|trainer_assignment_versions: consent-bound participants|SELECT|authenticated'),
    ('trainer_plan_assignments|trainer_plan_assignments: consent-bound participants|SELECT|authenticated'),
    ('trainer_profiles|trainer_profiles: active account|SELECT|authenticated'),
    ('trainer_profiles|trainer_profiles: read own|SELECT|authenticated'),
    ('trainer_program_templates|trainer_program_templates: manage active owner|ALL|authenticated'),
    ('trainer_service_offerings|trainer_service_offerings: manage own active profile|ALL|authenticated'),
    ('trainer_template_exercises|trainer_template_exercises: manage template owner|ALL|authenticated'),
    ('trainer_template_workouts|trainer_template_workouts: manage template owner|ALL|authenticated'),
    ('workout_exercises|workout_exercises: own|ALL|public'), ('workout_plans|workout_plans: own|ALL|public'),
    ('workouts|workouts: own|ALL|public')$$,
  'effective policy catalog exactly matches the reviewed allowlist'
);
SELECT is(
  (SELECT md5(string_agg(tablename || '|' || policyname || '|' || permissive || '|' || cmd || '|' || array_to_string(roles, ',') || '|' || COALESCE(qual, '') || '|' || COALESCE(with_check, ''), E'\x1e' ORDER BY tablename, policyname)) FROM pg_policies WHERE schemaname = 'public' AND tablename IN (SELECT table_name FROM expected_trainer_sensitive_tables)),
  'f648eba33360f0d273e3b425e493aed6',
  'effective policy definitions match the reviewed production digest'
);
SELECT is(
  (SELECT md5(string_agg(expected.table_name || '|' || grant_row.role_name || '|' || grant_row.privilege_type, E'\x1e' ORDER BY expected.table_name, grant_row.role_name, grant_row.privilege_type))
   FROM expected_trainer_sensitive_tables expected
   JOIN pg_class relation ON relation.relname = expected.table_name
   JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace AND namespace.nspname = 'public'
   CROSS JOIN LATERAL aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) privilege
   LEFT JOIN pg_roles role ON role.oid = privilege.grantee
   CROSS JOIN LATERAL (VALUES (COALESCE(role.rolname, 'PUBLIC'), privilege.privilege_type)) grant_row(role_name, privilege_type)
   WHERE grant_row.role_name IN ('PUBLIC', 'anon', 'authenticated', 'service_role')),
  '4d0325198c340803225de3b045c1366e',
  'effective public/anon/authenticated/service table ACLs match the reviewed allowlist'
);
SELECT is(
  (SELECT md5(string_agg(expected.table_name || '.' || attribute.attname || '|' || role.rolname || '|' || privilege.privilege_type, E'\x1e' ORDER BY expected.table_name, attribute.attname, role.rolname, privilege.privilege_type))
   FROM expected_trainer_sensitive_tables expected
   JOIN pg_class relation ON relation.relname = expected.table_name
   JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace AND namespace.nspname = 'public'
   JOIN pg_attribute attribute ON attribute.attrelid = relation.oid AND attribute.attnum > 0 AND NOT attribute.attisdropped AND attribute.attacl IS NOT NULL
   CROSS JOIN LATERAL aclexplode(attribute.attacl) privilege
   JOIN pg_roles role ON role.oid = privilege.grantee
   WHERE role.rolname IN ('anon', 'authenticated')),
  '75705cba20975d9c9cab7ae8d7994268',
  'effective anon/authenticated column ACLs match the reviewed allowlist'
);
SELECT is(
  (SELECT owner.rolname
   FROM pg_proc function
   JOIN pg_roles owner ON owner.oid = function.proowner
   WHERE function.oid = 'public.cleanup_trainer_security_e2e_fixture(text,uuid[])'::regprocedure),
  'postgres',
  'trainer security fixture cleanup remains postgres-owned after migration rerun'
);
SELECT is(
  (SELECT md5(string_agg(function.oid::regprocedure::TEXT || '|' || owner.rolname, E'\x1e' ORDER BY function.oid::regprocedure::TEXT))
   FROM pg_proc function JOIN pg_namespace namespace ON namespace.oid = function.pronamespace JOIN pg_roles owner ON owner.oid = function.proowner
   WHERE namespace.nspname = 'public' AND function.prosecdef),
  'e49a9463eb9f9ee5d1a3733167a4b6b2',
  'every effective public SECURITY DEFINER function has the reviewed owner'
);
SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_proc function JOIN pg_namespace namespace ON namespace.oid = function.pronamespace
  WHERE namespace.nspname = 'public' AND function.prosecdef
    AND (function.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(function.proconfig) setting WHERE setting ~ '^search_path=(public|storage|auth)(, (public|storage|auth))*, pg_temp$'))
), 'every effective public SECURITY DEFINER function pins a trusted search_path');
SELECT ok(
  has_function_privilege('service_role', 'public.suspend_account_and_professional(uuid,uuid,text,timestamptz)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.suspend_account_and_professional(uuid,uuid,text,timestamptz)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.cleanup_trainer_security_e2e_fixture(text,uuid[])', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.cleanup_trainer_security_e2e_fixture(text,uuid[])', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.require_active_coaching_admin(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.get_coach_clients_summary()', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.get_coach_clients_summary()', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.authorize_session_start(uuid,uuid)', 'EXECUTE'),
  'effective function ACLs expose only the reviewed authenticated/service entry points'
);
SELECT is(
  (SELECT md5(string_agg(function.oid::regprocedure::TEXT || '|' || COALESCE(role.rolname, 'PUBLIC') || '|' || privilege.privilege_type, E'\x1e' ORDER BY function.oid::regprocedure::TEXT, COALESCE(role.rolname, 'PUBLIC'), privilege.privilege_type))
   FROM pg_proc function
   JOIN pg_namespace namespace ON namespace.oid = function.pronamespace
   CROSS JOIN LATERAL aclexplode(COALESCE(function.proacl, acldefault('f', function.proowner))) privilege
   LEFT JOIN pg_roles role ON role.oid = privilege.grantee
   WHERE namespace.nspname = 'public' AND function.prosecdef
     AND COALESCE(role.rolname, 'PUBLIC') IN ('PUBLIC', 'anon', 'authenticated', 'service_role')),
  'ca5fd1fb5de789d16af77d89118b55f8',
  'all effective SECURITY DEFINER execute grants match the reviewed role allowlist'
);

-- Stable actor matrix. These identifiers are deliberately distinct from every
-- phase-specific fixture so failures always name the authorization actor.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'client-a@example.test', '{}'::JSONB),
  ('a2000000-0000-4000-8000-000000000002', 'client-b@example.test', '{}'::JSONB),
  ('a3000000-0000-4000-8000-000000000003', 'coach-a@example.test', '{}'::JSONB),
  ('a4000000-0000-4000-8000-000000000004', 'coach-b@example.test', '{}'::JSONB),
  ('a5000000-0000-4000-8000-000000000005', 'pending-coach@example.test', '{}'::JSONB),
  ('a6000000-0000-4000-8000-000000000006', 'suspended-coach@example.test', '{}'::JSONB),
  ('a7000000-0000-4000-8000-000000000007', 'admin@example.test', '{}'::JSONB);

INSERT INTO public.profiles (
  id, full_name, avatar_url, timezone, onboarding_done, is_admin, account_status,
  fitness_level, primary_goal, days_per_week, session_duration_minutes, gym_type,
  available_equipment, movement_limitations
) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'Client A', 'https://example.test/client-a.webp', 'UTC', TRUE, FALSE, 'active', 'beginner', 'build_muscle', 3, 45, 'home_basic', ARRAY['dumbbells'], '[]'::JSONB),
  ('a2000000-0000-4000-8000-000000000002', 'Client B', 'https://example.test/client-b.webp', 'UTC', TRUE, FALSE, 'active', 'intermediate', 'gain_strength', 4, 60, 'full_gym', ARRAY['barbell'], '[]'::JSONB),
  ('a3000000-0000-4000-8000-000000000003', 'Coach A', 'https://example.test/coach-a.webp', 'UTC', TRUE, FALSE, 'active', NULL, NULL, NULL, NULL, NULL, ARRAY[]::TEXT[], '[]'::JSONB),
  ('a4000000-0000-4000-8000-000000000004', 'Coach B', 'https://example.test/coach-b.webp', 'UTC', TRUE, FALSE, 'active', NULL, NULL, NULL, NULL, NULL, ARRAY[]::TEXT[], '[]'::JSONB),
  ('a5000000-0000-4000-8000-000000000005', 'Pending Coach', 'https://example.test/pending.webp', 'UTC', TRUE, FALSE, 'active', NULL, NULL, NULL, NULL, NULL, ARRAY[]::TEXT[], '[]'::JSONB),
  ('a6000000-0000-4000-8000-000000000006', 'Suspended Coach', 'https://example.test/suspended.webp', 'UTC', TRUE, FALSE, 'suspended', NULL, NULL, NULL, NULL, NULL, ARRAY[]::TEXT[], '[]'::JSONB),
  ('a7000000-0000-4000-8000-000000000007', 'Administrator', 'https://example.test/admin.webp', 'UTC', TRUE, TRUE, 'active', NULL, NULL, NULL, NULL, NULL, ARRAY[]::TEXT[], '[]'::JSONB);

INSERT INTO public.trainer_applications (
  id, user_id, status, professional_name, bio, experience_summary, contact_email,
  preferred_contact, timezone, interview_availability
) VALUES
  ('b3000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000003', 'approved', 'Coach A', 'Approved coach A biography.', 'Approved coach A evidence.', 'coach-a@example.test', 'email', 'UTC', 'Approved'),
  ('b4000000-0000-4000-8000-000000000004', 'a4000000-0000-4000-8000-000000000004', 'approved', 'Coach B', 'Approved coach B biography.', 'Approved coach B evidence.', 'coach-b@example.test', 'email', 'UTC', 'Approved'),
  ('b5000000-0000-4000-8000-000000000005', 'a5000000-0000-4000-8000-000000000005', 'draft', 'Pending Coach', 'Draft biography.', 'Draft evidence.', 'pending@example.test', 'email', 'UTC', 'Weekdays'),
  ('b6000000-0000-4000-8000-000000000006', 'a6000000-0000-4000-8000-000000000006', 'approved', 'Suspended Coach', 'Suspended biography.', 'Suspended evidence.', 'suspended@example.test', 'email', 'UTC', 'Approved');

INSERT INTO public.trainer_application_credentials (
  id, application_id, credential_type, title, external_url
) VALUES
  ('c3000000-0000-4000-8000-000000000003', 'b3000000-0000-4000-8000-000000000003', 'link', 'Coach A approved credential', 'https://example.test/coach-a-credential'),
  ('c5000000-0000-4000-8000-000000000005', 'b5000000-0000-4000-8000-000000000005', 'link', 'Pending credential', 'https://example.test/pending-credential');

INSERT INTO public.trainer_profiles (
  id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary
) VALUES
  ('d3000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000003', 'b3000000-0000-4000-8000-000000000003', 'coach-a', 'active', 'Coach A', 'Coach A public bio.', 'Coach A public evidence.'),
  ('d4000000-0000-4000-8000-000000000004', 'a4000000-0000-4000-8000-000000000004', 'b4000000-0000-4000-8000-000000000004', 'coach-b', 'active', 'Coach B', 'Coach B public bio.', 'Coach B public evidence.'),
  ('d6000000-0000-4000-8000-000000000006', 'a6000000-0000-4000-8000-000000000006', 'b6000000-0000-4000-8000-000000000006', 'suspended-coach', 'suspended', 'Suspended Coach', 'Suspended public bio.', 'Suspended public evidence.');

INSERT INTO public.trainer_service_offerings (
  id, trainer_profile_id, name, modality, duration_minutes, content, capacity
) VALUES
  ('e3000000-0000-4000-8000-000000000003', 'd3000000-0000-4000-8000-000000000003', 'Coach A service', 'online', 60, 'Training only.', 10),
  ('e4000000-0000-4000-8000-000000000004', 'd4000000-0000-4000-8000-000000000004', 'Coach B service', 'online', 60, 'Training only.', 10);

INSERT INTO public.coaching_requests (
  id, service_id, trainer_user_id, client_user_id, message,
  training_profile_consent_version, idempotency_key, status, decided_at
) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'Request A', 'training-profile-v1', 'f1100000-0000-4000-8000-000000000001', 'accepted', NOW()),
  ('f2000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000002', 'Request B', 'training-profile-v1', 'f2200000-0000-4000-8000-000000000002', 'accepted', NOW()),
  ('f7000000-0000-4000-8000-000000000007', 'e3000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000003', 'a7000000-0000-4000-8000-000000000007', 'Pending admin-client request', 'training-profile-v1', 'f7700000-0000-4000-8000-000000000007', 'pending', NULL);

INSERT INTO public.coaching_relationships (
  id, source_request_id, service_id, trainer_user_id, client_user_id, status
) VALUES
  ('11100000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'active'),
  ('22200000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000002', 'active');

INSERT INTO public.coaching_consents (id, relationship_id, scope, text_version, granted_by) VALUES
  ('31100000-0000-4000-8000-000000000001', '11100000-0000-4000-8000-000000000001', 'training_profile', 'training-profile-v1', 'a1000000-0000-4000-8000-000000000001'),
  ('31200000-0000-4000-8000-000000000001', '11100000-0000-4000-8000-000000000001', 'body_measurements', 'body-measurements-v1', 'a1000000-0000-4000-8000-000000000001'),
  ('32100000-0000-4000-8000-000000000002', '22200000-0000-4000-8000-000000000002', 'training_profile', 'training-profile-v1', 'a2000000-0000-4000-8000-000000000002'),
  ('32200000-0000-4000-8000-000000000002', '22200000-0000-4000-8000-000000000002', 'body_measurements', 'body-measurements-v1', 'a2000000-0000-4000-8000-000000000002');

INSERT INTO public.exercises (id, name, is_public) VALUES
  ('40100000-0000-4000-8000-000000000001', 'Authorization exercise', TRUE);
INSERT INTO public.trainer_program_templates (id, trainer_user_id, name, days_per_week, status) VALUES
  ('41100000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', 'Coach A template', 1, 'active'),
  ('41200000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000004', 'Coach B template', 1, 'active');
INSERT INTO public.trainer_template_workouts (id, template_id, name, day_of_week, order_in_plan) VALUES
  ('42100000-0000-4000-8000-000000000001', '41100000-0000-4000-8000-000000000001', 'Coach A workout', 1, 1),
  ('42200000-0000-4000-8000-000000000002', '41200000-0000-4000-8000-000000000002', 'Coach B workout', 1, 1);
INSERT INTO public.trainer_template_exercises (id, template_workout_id, exercise_id, order_index, sets, reps, rest_seconds) VALUES
  ('43100000-0000-4000-8000-000000000001', '42100000-0000-4000-8000-000000000001', '40100000-0000-4000-8000-000000000001', 1, 3, 8, 60),
  ('43200000-0000-4000-8000-000000000002', '42200000-0000-4000-8000-000000000002', '40100000-0000-4000-8000-000000000001', 1, 3, 8, 60);

SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.trainer_plan_assignments (
  id, relationship_id, trainer_user_id, client_user_id, source_template_id,
  status, accepted_at, active_version_id
) VALUES
  ('51100000-0000-4000-8000-000000000001', '11100000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', '41100000-0000-4000-8000-000000000001', 'active', NOW(), '52100000-0000-4000-8000-000000000001'),
  ('51200000-0000-4000-8000-000000000002', '22200000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000002', '41100000-0000-4000-8000-000000000001', 'active', NOW(), '52200000-0000-4000-8000-000000000002');
INSERT INTO public.trainer_assignment_versions (
  id, assignment_id, version_number, snapshot, status, materialized_plan_id
) VALUES
  ('52100000-0000-4000-8000-000000000001', '51100000-0000-4000-8000-000000000001', 1, '{"schemaVersion":1,"workouts":[]}'::JSONB, 'active', '53100000-0000-4000-8000-000000000001'),
  ('52200000-0000-4000-8000-000000000002', '51200000-0000-4000-8000-000000000002', 1, '{"schemaVersion":1,"workouts":[]}'::JSONB, 'active', '53200000-0000-4000-8000-000000000002');
INSERT INTO public.workout_plans (
  id, user_id, name, family_id, is_active, source_type, library_slot,
  prescription_locked, trainer_relationship_id, trainer_assignment_id, trainer_assignment_version_id
) VALUES
  ('53100000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Client A professional plan', gen_random_uuid(), TRUE, 'trainer_assigned', 'professional', TRUE, '11100000-0000-4000-8000-000000000001', '51100000-0000-4000-8000-000000000001', '52100000-0000-4000-8000-000000000001'),
  ('53200000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'Client B professional plan', gen_random_uuid(), TRUE, 'trainer_assigned', 'professional', TRUE, '22200000-0000-4000-8000-000000000002', '51200000-0000-4000-8000-000000000002', '52200000-0000-4000-8000-000000000002');
SET CONSTRAINTS ALL IMMEDIATE;

INSERT INTO public.workouts (id, user_id, plan_id, name, day_of_week, order_in_plan) VALUES
  ('54100000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', '53100000-0000-4000-8000-000000000001', 'Client A prescribed workout', EXTRACT(ISODOW FROM NOW() AT TIME ZONE 'UTC')::INTEGER, 1),
  ('54200000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', '53200000-0000-4000-8000-000000000002', 'Client B prescribed workout', EXTRACT(ISODOW FROM NOW() AT TIME ZONE 'UTC')::INTEGER, 1);
INSERT INTO public.workout_exercises (id, workout_id, exercise_id, order_index, sets, reps, rest_seconds) VALUES
  ('55100000-0000-4000-8000-000000000001', '54100000-0000-4000-8000-000000000001', '40100000-0000-4000-8000-000000000001', 1, 3, 8, 60),
  ('55200000-0000-4000-8000-000000000002', '54200000-0000-4000-8000-000000000002', '40100000-0000-4000-8000-000000000001', 1, 3, 8, 60);

INSERT INTO public.session_authorizations (
  client_session_id, user_id, workout_id, plan_id, session_context_snapshot,
  policy_timezone, policy_date, policy_day_start, policy_day_end,
  workout_window_start, created_at, expires_at, consumed_at
) VALUES (
  '56100000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
  '54100000-0000-4000-8000-000000000001', '53100000-0000-4000-8000-000000000001',
  '{"version":1,"plan":{"trainerAssignmentVersionId":"52100000-0000-4000-8000-000000000001"},"exercises":[]}'::JSONB,
  'UTC', (CURRENT_DATE - 1), (CURRENT_DATE - 1)::TIMESTAMPTZ, CURRENT_DATE::TIMESTAMPTZ,
  (CURRENT_DATE - 7)::TIMESTAMPTZ, (CURRENT_DATE - 1)::TIMESTAMPTZ + INTERVAL '6 hours',
  (CURRENT_DATE - 1)::TIMESTAMPTZ + INTERVAL '18 hours', (CURRENT_DATE - 1)::TIMESTAMPTZ + INTERVAL '7 hours'
);
INSERT INTO public.progress_logs (
  id, user_id, client_session_id, workout_id, completed_at, duration_minutes, notes, session_context_snapshot
) VALUES (
  '57100000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
  '56100000-0000-4000-8000-000000000001', '54100000-0000-4000-8000-000000000001',
  (CURRENT_DATE - 1)::TIMESTAMPTZ + INTERVAL '7 hours', 42, 'Client A private evidence',
  '{"version":1,"plan":{"trainerAssignmentVersionId":"52100000-0000-4000-8000-000000000001"}}'::JSONB
);
INSERT INTO public.exercise_logs (
  id, progress_log_id, exercise_id, sets_completed, reps_completed, weights_kg, rpe_values, notes
) VALUES (
  '58100000-0000-4000-8000-000000000001', '57100000-0000-4000-8000-000000000001',
  '40100000-0000-4000-8000-000000000001', 3, ARRAY[8,8,8], ARRAY[20,20,20], ARRAY[7,8,8], 'Client A private set evidence'
);
INSERT INTO public.measurements (id, user_id, recorded_at, weight_kg, waist_cm, notes) VALUES
  ('59100000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', NOW() - INTERVAL '1 day', 70, 80, 'Client A private measurement'),
  ('59200000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', NOW() - INTERVAL '1 day', 82, 90, 'Client B private measurement');

INSERT INTO public.product_notifications (id, user_id, type, title, body, dedupe_key) VALUES
  ('61100000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'coaching_assignment_status', 'Client A notification', 'Private body A', 'authorization-client-a'),
  ('61200000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'coaching_assignment_status', 'Client B notification', 'Private body B', 'authorization-client-b');
INSERT INTO public.professional_audit_logs (id, actor_user_id, subject_user_id, entity_type, entity_id, action) VALUES
  ('62100000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'trainer_plan_assignment', '51100000-0000-4000-8000-000000000001', 'proposed');

SELECT set_config('app.trainer_prescription_mutation', 'off', true);

-- Application and credential contract.
SELECT set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000005', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.trainer_applications WHERE id = 'b5000000-0000-4000-8000-000000000005'), 1::BIGINT, 'pending_coach reads own application');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000004', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.trainer_applications WHERE id = 'b5000000-0000-4000-8000-000000000005'), 0::BIGINT, 'coach_b cannot read pending_coach application');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000005', true); SET LOCAL ROLE authenticated;
SELECT lives_ok($$UPDATE public.trainer_applications SET professional_name = 'Pending Coach Updated' WHERE id = 'b5000000-0000-4000-8000-000000000005'$$, 'pending_coach can update editable application fields');
SELECT is((SELECT professional_name FROM public.trainer_applications WHERE id = 'b5000000-0000-4000-8000-000000000005'), 'Pending Coach Updated', 'application update changes the owned row');
SELECT throws_ok($$INSERT INTO public.trainer_applications (user_id) VALUES ('a5000000-0000-4000-8000-000000000005')$$, '42501', NULL, 'application insert is RPC-only');
SELECT throws_ok($$DELETE FROM public.trainer_applications WHERE id = 'b5000000-0000-4000-8000-000000000005'$$, '42501', NULL, 'application delete is RPC-only');
SELECT is((SELECT count(*) FROM public.trainer_application_credentials WHERE id = 'c5000000-0000-4000-8000-000000000005'), 1::BIGINT, 'pending_coach reads own credential');
SELECT throws_ok($$INSERT INTO public.trainer_application_credentials (application_id, credential_type, title, external_url) VALUES ('b5000000-0000-4000-8000-000000000005','link','Direct credential','https://example.test/direct')$$, '42501', NULL, 'credential insert is RPC-only');
SELECT throws_ok($$UPDATE public.trainer_application_credentials SET title = 'Direct credential tamper' WHERE id = 'c5000000-0000-4000-8000-000000000005'$$, '42501', NULL, 'credential update is RPC-only');
SELECT throws_ok($$DELETE FROM public.trainer_application_credentials WHERE id = 'c5000000-0000-4000-8000-000000000005'$$, '42501', NULL, 'credential delete is RPC-only');
SELECT is((public.create_trainer_application_credential('c5100000-0000-4000-8000-000000000015', 'b5000000-0000-4000-8000-000000000005', 'link', 'Second credential', NULL, NULL, NULL, 'https://example.test/second-credential', NULL, NULL)->>'id')::UUID, 'c5100000-0000-4000-8000-000000000015'::UUID, 'pending_coach creates own credential through RPC');
SELECT is((SELECT count(*) FROM public.trainer_application_credentials WHERE application_id = 'b5000000-0000-4000-8000-000000000005'), 2::BIGINT, 'credential RPC persists exactly one additional owned row');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000004', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.trainer_application_credentials WHERE id = 'c5000000-0000-4000-8000-000000000005'), 0::BIGINT, 'coach_b cannot read pending_coach credential');
SELECT throws_ok($$SELECT public.create_trainer_application_credential(gen_random_uuid(), 'b5000000-0000-4000-8000-000000000005', 'link', 'Cross tenant', NULL, NULL, NULL, 'https://example.test/cross', NULL, NULL)$$, '42501', NULL, 'credential RPC rejects cross-tenant actor generically');

-- Public profile and service contract plus trainer-owned CRUD.
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000003', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.trainer_profiles WHERE user_id = 'a3000000-0000-4000-8000-000000000003'), 1::BIGINT, 'coach_a reads own professional profile');
SELECT throws_ok($$UPDATE public.trainer_profiles SET professional_name = 'Direct profile tamper' WHERE user_id = 'a3000000-0000-4000-8000-000000000003'$$, '42501', NULL, 'profile base-table update is denied');
SELECT is((public.save_trainer_profile_changes('{"professionalName":"Coach A Reviewed","professionalPhotoUrl":null,"bio":"Coach A public biography updated through the review contract.","specialties":["strength"],"modalities":["online"],"experienceSummary":"Coach A approved evidence updated through review.","generalLocation":null,"languages":["es"]}'::JSONB)->>'review_status'), 'submitted', 'active coach updates profile through the real review RPC');
SELECT is((SELECT count(*) FROM public.trainer_applications WHERE user_id = 'a3000000-0000-4000-8000-000000000003' AND application_kind = 'profile_update' AND status = 'submitted'), 1::BIGINT, 'profile RPC creates one observable submitted review');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.trainer_profiles WHERE user_id = 'a3000000-0000-4000-8000-000000000003'), 0::BIGINT, 'client does not read trainer profile base table');
SELECT is((SELECT count(*) FROM public.get_requestable_trainer_services('coach-a')), 1::BIGINT, 'client reads active coach service through public RPC projection');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000003', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.trainer_service_offerings WHERE trainer_profile_id = 'd3000000-0000-4000-8000-000000000003'), 1::BIGINT, 'coach_a reads own service');
SELECT lives_ok($$INSERT INTO public.trainer_service_offerings (trainer_profile_id, name, modality, duration_minutes) VALUES ('d3000000-0000-4000-8000-000000000003','Temporary service','online',30)$$, 'coach_a inserts own service');
SELECT lives_ok($$UPDATE public.trainer_service_offerings SET capacity = 2 WHERE name = 'Temporary service'$$, 'coach_a updates own service');
SELECT is((SELECT capacity FROM public.trainer_service_offerings WHERE name = 'Temporary service'), 2, 'service update changes one owned row');
SELECT lives_ok($$DELETE FROM public.trainer_service_offerings WHERE name = 'Temporary service'$$, 'coach_a deletes own service');
SELECT is((SELECT count(*) FROM public.trainer_service_offerings WHERE name = 'Temporary service'), 0::BIGINT, 'service delete removes the owned row');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000004', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.trainer_service_offerings WHERE trainer_profile_id = 'd3000000-0000-4000-8000-000000000003'), 0::BIGINT, 'coach_b cannot read coach_a service base rows');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000005', true); SET LOCAL ROLE authenticated;
SELECT throws_ok($$INSERT INTO public.trainer_service_offerings (trainer_profile_id, name, modality, duration_minutes) VALUES ('d3000000-0000-4000-8000-000000000003','Pending write','online',30)$$, 'P0001', 'COACHING_ACTIVE_TRAINER_PROFILE_REQUIRED', 'pending_coach cannot create a service');

-- Request, relationship and consent participant matrix.
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.coaching_requests WHERE id = 'f1000000-0000-4000-8000-000000000001'), 1::BIGINT, 'client_a reads own request');
SELECT is((SELECT count(*) FROM public.coaching_relationships WHERE id = '11100000-0000-4000-8000-000000000001'), 1::BIGINT, 'client_a reads own relationship');
SELECT is((SELECT count(*) FROM public.coaching_consents WHERE relationship_id = '11100000-0000-4000-8000-000000000001'), 2::BIGINT, 'client_a reads own consent history');
SELECT throws_ok($$INSERT INTO public.coaching_requests (service_id, trainer_user_id, client_user_id, training_profile_consent_version) VALUES ('e4000000-0000-4000-8000-000000000004','a4000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000001','training-profile-v1')$$, '42501', NULL, 'request insertion is RPC-only');
SELECT throws_ok($$UPDATE public.coaching_requests SET message = 'Direct tamper' WHERE id = 'f1000000-0000-4000-8000-000000000001'$$, '42501', NULL, 'request update is RPC-only');
SELECT throws_ok($$DELETE FROM public.coaching_requests WHERE id = 'f1000000-0000-4000-8000-000000000001'$$, '42501', NULL, 'request delete is RPC-only');
SELECT throws_ok($$INSERT INTO public.coaching_relationships (service_id, trainer_user_id, client_user_id) VALUES ('e3000000-0000-4000-8000-000000000003','a3000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001')$$, '42501', NULL, 'relationship insertion is RPC-only');
SELECT throws_ok($$UPDATE public.coaching_relationships SET status = 'ended' WHERE id = '11100000-0000-4000-8000-000000000001'$$, '42501', NULL, 'relationship update is RPC-only');
SELECT throws_ok($$DELETE FROM public.coaching_relationships WHERE id = '11100000-0000-4000-8000-000000000001'$$, '42501', NULL, 'relationship delete is RPC-only');
SELECT throws_ok($$INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by) VALUES ('11100000-0000-4000-8000-000000000001','training_profile','forged','a1000000-0000-4000-8000-000000000001')$$, '42501', NULL, 'consent insertion is RPC-only');
SELECT throws_ok($$UPDATE public.coaching_consents SET text_version = 'forged' WHERE relationship_id = '11100000-0000-4000-8000-000000000001'$$, '42501', NULL, 'consent update is denied');
SELECT throws_ok($$DELETE FROM public.coaching_consents WHERE relationship_id = '11100000-0000-4000-8000-000000000001'$$, '42501', NULL, 'consent deletion is denied');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000003', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.coaching_requests), 3::BIGINT, 'coach_a reads requests addressed to it');
SELECT is((SELECT count(*) FROM public.coaching_relationships), 2::BIGINT, 'coach_a reads active scoped relationships');
SELECT is((SELECT count(*) FROM public.coaching_consents), 4::BIGINT, 'coach_a reads active scoped consents');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000004', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.coaching_requests WHERE client_user_id IN ('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002')), 0::BIGINT, 'coach_b cannot read coach_a requests');
SELECT is((SELECT count(*) FROM public.coaching_relationships WHERE client_user_id IN ('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002')), 0::BIGINT, 'coach_b cannot read coach_a relationships');
SELECT is((SELECT count(*) FROM public.coaching_consents WHERE relationship_id IN ('11100000-0000-4000-8000-000000000001','22200000-0000-4000-8000-000000000002')), 0::BIGINT, 'coach_b cannot read coach_a consents');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000005', true); SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.create_coaching_request('e4000000-0000-4000-8000-000000000004', 'Pending coach acting as a real client', 'training-profile-v1', 'f5500000-0000-4000-8000-000000000005')$$, 'pending_coach creates a principal coaching request as a client');
SELECT is((SELECT count(*) FROM public.coaching_requests WHERE idempotency_key = 'f5500000-0000-4000-8000-000000000005'), 1::BIGINT, 'request RPC persists exactly one request');
SELECT is((SELECT status FROM public.coaching_requests WHERE idempotency_key = 'f5500000-0000-4000-8000-000000000005'), 'pending', 'request RPC persists an observable pending request');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000004', true); SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.accept_coaching_request((SELECT id FROM public.coaching_requests WHERE idempotency_key = 'f5500000-0000-4000-8000-000000000005'), 'f5600000-0000-4000-8000-000000000006')$$, 'coach_b accepts the principal request through the real RPC');
SELECT is((SELECT status FROM public.coaching_relationships WHERE source_request_id = (SELECT id FROM public.coaching_requests WHERE idempotency_key = 'f5500000-0000-4000-8000-000000000005')), 'active', 'accept RPC persists an active relationship');
SELECT is((SELECT count(*) FROM public.coaching_consents WHERE relationship_id = (SELECT id FROM public.coaching_relationships WHERE source_request_id = (SELECT id FROM public.coaching_requests WHERE idempotency_key = 'f5500000-0000-4000-8000-000000000005')) AND scope = 'training_profile' AND revoked_at IS NULL), 1::BIGINT, 'accept RPC persists active training-profile consent');

-- Template CRUD and assignment/version participant matrix.
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000003', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.trainer_program_templates WHERE id = '41100000-0000-4000-8000-000000000001'), 1::BIGINT, 'coach_a reads own template');
SELECT lives_ok($$INSERT INTO public.trainer_program_templates (id, trainer_user_id, name, days_per_week) VALUES ('41300000-0000-4000-8000-000000000003','a3000000-0000-4000-8000-000000000003','Temporary template',1)$$, 'coach_a inserts own template');
SELECT lives_ok($$INSERT INTO public.trainer_template_workouts (id, template_id, name, day_of_week, order_in_plan) VALUES ('42300000-0000-4000-8000-000000000003','41300000-0000-4000-8000-000000000003','Temporary workout',2,1)$$, 'coach_a inserts an owned template workout');
SELECT lives_ok($$INSERT INTO public.trainer_template_exercises (id, template_workout_id, exercise_id, order_index, sets, reps, rest_seconds) VALUES ('43300000-0000-4000-8000-000000000003','42300000-0000-4000-8000-000000000003','40100000-0000-4000-8000-000000000001',1,2,10,60)$$, 'coach_a inserts an owned template exercise');
SELECT lives_ok($$UPDATE public.trainer_program_templates SET name = 'Temporary template updated' WHERE id = '41300000-0000-4000-8000-000000000003'$$, 'coach_a updates own template');
SELECT lives_ok($$UPDATE public.trainer_template_workouts SET name = 'Temporary workout updated' WHERE id = '42300000-0000-4000-8000-000000000003'$$, 'coach_a updates an owned template workout');
SELECT lives_ok($$UPDATE public.trainer_template_exercises SET sets = 4 WHERE id = '43300000-0000-4000-8000-000000000003'$$, 'coach_a updates an owned template exercise');
SELECT is((SELECT name FROM public.trainer_program_templates WHERE id = '41300000-0000-4000-8000-000000000003'), 'Temporary template updated', 'template update changes the owned row');
SELECT is((SELECT name FROM public.trainer_template_workouts WHERE id = '42300000-0000-4000-8000-000000000003'), 'Temporary workout updated', 'template-workout update is observable');
SELECT is((SELECT sets FROM public.trainer_template_exercises WHERE id = '43300000-0000-4000-8000-000000000003'), 4, 'template-exercise update is observable');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000004', true); SET LOCAL ROLE authenticated;
SELECT lives_ok($$UPDATE public.trainer_template_workouts SET name = 'Cross-owner tamper' WHERE id = '42300000-0000-4000-8000-000000000003'$$, 'coach_b cross-owner template-workout update is filtered');
SELECT lives_ok($$DELETE FROM public.trainer_template_exercises WHERE id = '43300000-0000-4000-8000-000000000003'$$, 'coach_b cross-owner template-exercise delete is filtered');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000003', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT name FROM public.trainer_template_workouts WHERE id = '42300000-0000-4000-8000-000000000003'), 'Temporary workout updated', 'cross-owner update preserves the template workout');
SELECT is((SELECT count(*) FROM public.trainer_template_exercises WHERE id = '43300000-0000-4000-8000-000000000003'), 1::BIGINT, 'cross-owner delete preserves the template exercise');
SELECT lives_ok($$DELETE FROM public.trainer_program_templates WHERE id = '41300000-0000-4000-8000-000000000003'$$, 'coach_a deletes own template');
SELECT is((SELECT count(*) FROM public.trainer_template_workouts WHERE id = '42300000-0000-4000-8000-000000000003'), 0::BIGINT, 'owned template delete cascades to its workouts');
SELECT is((SELECT count(*) FROM public.trainer_plan_assignments), 2::BIGINT, 'coach_a reads assignments for active scoped clients');
SELECT is((SELECT count(*) FROM public.trainer_assignment_versions), 2::BIGINT, 'coach_a reads versions for active scoped clients');
SELECT throws_ok($$INSERT INTO public.trainer_plan_assignments (relationship_id, trainer_user_id, client_user_id) VALUES ('11100000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001')$$, '42501', NULL, 'assignment insert is RPC-only');
SELECT throws_ok($$UPDATE public.trainer_plan_assignments SET status = 'cancelled' WHERE id = '51100000-0000-4000-8000-000000000001'$$, '42501', NULL, 'assignment update is RPC-only');
SELECT throws_ok($$DELETE FROM public.trainer_plan_assignments WHERE id = '51100000-0000-4000-8000-000000000001'$$, '42501', NULL, 'assignment delete is denied');
SELECT throws_ok($$UPDATE public.trainer_assignment_versions SET change_summary = 'tamper' WHERE id = '52100000-0000-4000-8000-000000000001'$$, '42501', NULL, 'assignment version update is denied');
SELECT throws_ok($$DELETE FROM public.trainer_assignment_versions WHERE id = '52100000-0000-4000-8000-000000000001'$$, '42501', NULL, 'assignment version delete is denied');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000004', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.trainer_program_templates WHERE id = '41100000-0000-4000-8000-000000000001'), 0::BIGINT, 'coach_b cannot read coach_a template');
SELECT is((SELECT count(*) FROM public.trainer_plan_assignments WHERE client_user_id IN ('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002')), 0::BIGINT, 'coach_b never reads coach_a assignments');
SELECT is((SELECT count(*) FROM public.trainer_assignment_versions WHERE assignment_id IN ('51100000-0000-4000-8000-000000000001','51200000-0000-4000-8000-000000000002')), 0::BIGINT, 'coach_b never reads coach_a versions');
RESET ROLE; SET CONSTRAINTS ALL DEFERRED; SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000004', true); SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.propose_trainer_assignment((SELECT id FROM public.coaching_relationships WHERE source_request_id = (SELECT id FROM public.coaching_requests WHERE idempotency_key = 'f5500000-0000-4000-8000-000000000005')), '41200000-0000-4000-8000-000000000002', 'Principal proposal', 'coach-b-principal-proposal')$$, 'coach_b proposes an assignment through the real principal RPC');
SELECT is((SELECT status FROM public.trainer_plan_assignments WHERE proposal_idempotency_key = 'coach-b-principal-proposal'), 'proposed', 'proposal RPC persists an observable proposed assignment');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000005', true); SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.accept_trainer_assignment((SELECT id FROM public.trainer_plan_assignments WHERE proposal_idempotency_key = 'coach-b-principal-proposal'), 'pending-client-principal-acceptance')$$, 'principal client accepts the assignment through the real RPC');
SELECT ok((SELECT is_active FROM public.workout_plans WHERE trainer_assignment_id = (SELECT id FROM public.trainer_plan_assignments WHERE proposal_idempotency_key = 'coach-b-principal-proposal')), 'assignment acceptance activates the materialized plan');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000004', true); SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.publish_trainer_assignment_revision((SELECT id FROM public.trainer_plan_assignments WHERE proposal_idempotency_key = 'coach-b-principal-proposal'), '41200000-0000-4000-8000-000000000002', 'Principal revision', 'coach-b-principal-revision')$$, 'coach_b publishes a revision through the real principal RPC');
SELECT is((SELECT count(*) FROM public.trainer_assignment_versions WHERE assignment_id = (SELECT id FROM public.trainer_plan_assignments WHERE proposal_idempotency_key = 'coach-b-principal-proposal')), 2::BIGINT, 'revision RPC persists exactly two immutable versions');
RESET ROLE; SET CONSTRAINTS ALL IMMEDIATE; SELECT set_config('app.trainer_prescription_mutation', 'off', true); SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.trainer_plan_assignments WHERE id = '51100000-0000-4000-8000-000000000001'), 1::BIGINT, 'client_a reads own assignment');
SELECT is((SELECT count(*) FROM public.trainer_assignment_versions WHERE id = '52100000-0000-4000-8000-000000000001'), 1::BIGINT, 'client_a reads own version');

-- Materialized plan, locked prescription, evidence, measurements and RPCs.
SELECT is((SELECT count(*) FROM public.workout_plans WHERE id = '53100000-0000-4000-8000-000000000001'), 1::BIGINT, 'client_a reads materialized plan');
SELECT is((SELECT count(*) FROM public.workouts WHERE id = '54100000-0000-4000-8000-000000000001'), 1::BIGINT, 'client_a reads prescribed workout');
SELECT is((SELECT count(*) FROM public.workout_exercises WHERE id = '55100000-0000-4000-8000-000000000001'), 1::BIGINT, 'client_a reads locked prescription row');
SELECT throws_ok($$UPDATE public.workout_plans SET name = 'Tampered plan' WHERE id = '53100000-0000-4000-8000-000000000001'$$, 'P0001', 'TRAINER_PRESCRIPTION_LOCKED', 'client cannot mutate locked materialized plan');
SELECT is((SELECT name FROM public.workout_plans WHERE id = '53100000-0000-4000-8000-000000000001'), 'Client A professional plan', 'blocked plan update preserves the prescription');
SELECT throws_ok($$DELETE FROM public.workout_plans WHERE id = '53100000-0000-4000-8000-000000000001'$$, 'P0001', 'TRAINER_PRESCRIPTION_LOCKED', 'client cannot delete locked materialized plan');
SELECT is((SELECT count(*) FROM public.progress_logs WHERE id = '57100000-0000-4000-8000-000000000001'), 1::BIGINT, 'client_a reads own progress evidence');
SELECT is((SELECT count(*) FROM public.exercise_logs WHERE id = '58100000-0000-4000-8000-000000000001'), 1::BIGINT, 'client_a reads own exercise evidence');
SELECT is((SELECT count(*) FROM public.measurements WHERE id = '59100000-0000-4000-8000-000000000001'), 1::BIGINT, 'client_a reads own measurement');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000003', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.workout_plans WHERE user_id = 'a1000000-0000-4000-8000-000000000001'), 0::BIGINT, 'coach_a has no direct plan access');
SELECT is((SELECT count(*) FROM public.progress_logs WHERE user_id = 'a1000000-0000-4000-8000-000000000001'), 0::BIGINT, 'coach_a has no direct evidence access');
SELECT is((SELECT count(*) FROM public.measurements WHERE user_id = 'a1000000-0000-4000-8000-000000000001'), 0::BIGINT, 'coach_a has no direct measurement access');
SELECT throws_ok($$INSERT INTO public.workout_plans (user_id, name) VALUES ('a1000000-0000-4000-8000-000000000001','Forged coach plan')$$, '42501', NULL, 'coach_a cannot insert a client plan');
SELECT lives_ok($$UPDATE public.workout_plans SET name = 'Forged coach update' WHERE id = '53100000-0000-4000-8000-000000000001'$$, 'coach_a cross-tenant plan update is generically filtered');
SELECT lives_ok($$DELETE FROM public.workout_plans WHERE id = '53100000-0000-4000-8000-000000000001'$$, 'coach_a cross-tenant plan delete is generically filtered');
SELECT lives_ok($$UPDATE public.workouts SET name = 'Forged coach workout' WHERE id = '54100000-0000-4000-8000-000000000001'$$, 'coach_a cross-tenant workout update is generically filtered');
SELECT throws_ok($$DELETE FROM public.workouts WHERE id = '54100000-0000-4000-8000-000000000001'$$, '42501', NULL, 'coach_a cross-tenant workout delete is denied by effective ACL');
SELECT throws_ok($$INSERT INTO public.workout_exercises (workout_id, exercise_id, order_index, sets, reps) VALUES ('54100000-0000-4000-8000-000000000001','40100000-0000-4000-8000-000000000001',2,1,1)$$, '42501', NULL, 'coach_a cannot insert a client prescription row');
SELECT lives_ok($$UPDATE public.workout_exercises SET sets = 99 WHERE id = '55100000-0000-4000-8000-000000000001'$$, 'coach_a cross-tenant prescription update is generically filtered');
SELECT lives_ok($$DELETE FROM public.workout_exercises WHERE id = '55100000-0000-4000-8000-000000000001'$$, 'coach_a cross-tenant prescription delete is generically filtered');
SELECT throws_ok($$INSERT INTO public.progress_logs (user_id, completed_at, notes) VALUES ('a1000000-0000-4000-8000-000000000001',NOW(),'Forged coach evidence')$$, '42501', NULL, 'coach_a cannot insert client evidence');
SELECT lives_ok($$UPDATE public.progress_logs SET notes = 'Forged coach evidence' WHERE id = '57100000-0000-4000-8000-000000000001'$$, 'coach_a cross-tenant evidence update is generically filtered');
SELECT throws_ok($$DELETE FROM public.progress_logs WHERE id = '57100000-0000-4000-8000-000000000001'$$, '42501', NULL, 'coach_a cannot delete client evidence');
SELECT throws_ok($$INSERT INTO public.exercise_logs (progress_log_id, exercise_id, sets_completed) VALUES ('57100000-0000-4000-8000-000000000001','40100000-0000-4000-8000-000000000001',1)$$, '42501', NULL, 'coach_a cannot insert client exercise evidence');
SELECT throws_ok($$UPDATE public.exercise_logs SET notes = 'Forged coach set evidence' WHERE id = '58100000-0000-4000-8000-000000000001'$$, '42501', NULL, 'coach_a cannot update client exercise evidence');
SELECT throws_ok($$DELETE FROM public.exercise_logs WHERE id = '58100000-0000-4000-8000-000000000001'$$, '42501', NULL, 'coach_a cannot delete client exercise evidence');
SELECT throws_ok($$INSERT INTO public.measurements (user_id, weight_kg) VALUES ('a1000000-0000-4000-8000-000000000001',999)$$, '42501', NULL, 'coach_a cannot insert client measurements');
SELECT lives_ok($$UPDATE public.measurements SET weight_kg = 999 WHERE id = '59100000-0000-4000-8000-000000000001'$$, 'coach_a cross-tenant measurement update is generically filtered');
SELECT lives_ok($$DELETE FROM public.measurements WHERE id = '59100000-0000-4000-8000-000000000001'$$, 'coach_a cross-tenant measurement delete is generically filtered');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT name FROM public.workout_plans WHERE id = '53100000-0000-4000-8000-000000000001'), 'Client A professional plan', 'coach DML attempts preserve the client plan');
SELECT is((SELECT name FROM public.workouts WHERE id = '54100000-0000-4000-8000-000000000001'), 'Client A prescribed workout', 'coach DML attempts preserve the client workout');
SELECT is((SELECT sets FROM public.workout_exercises WHERE id = '55100000-0000-4000-8000-000000000001'), 3, 'coach DML attempts preserve the client prescription row');
SELECT is((SELECT notes FROM public.progress_logs WHERE id = '57100000-0000-4000-8000-000000000001'), 'Client A private evidence', 'coach DML attempts preserve client progress evidence');
SELECT is((SELECT notes FROM public.exercise_logs WHERE id = '58100000-0000-4000-8000-000000000001'), 'Client A private set evidence', 'coach DML attempts preserve client exercise evidence');
SELECT is((SELECT weight_kg FROM public.measurements WHERE id = '59100000-0000-4000-8000-000000000001'), 70::NUMERIC, 'coach DML attempts preserve client measurements');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000003', true); SET LOCAL ROLE authenticated;
SELECT is((public.get_coach_clients_summary()->'counts'->>'activeClients')::INTEGER, 2, 'coach summary exposes exactly its two scoped clients');
SELECT is(jsonb_array_length(public.get_coach_client_insights('a1000000-0000-4000-8000-000000000001', CURRENT_DATE - 30, CURRENT_DATE)->'sessions'), 1, 'coach insights expose one trusted client evidence row');
SELECT is(jsonb_array_length(public.get_coach_client_measurements('a1000000-0000-4000-8000-000000000001', CURRENT_DATE - 30, CURRENT_DATE)->'measurements'), 1, 'coach measurement RPC exposes one consented row');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000004', true); SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.get_coach_client_insights('a1000000-0000-4000-8000-000000000001', CURRENT_DATE - 30, CURRENT_DATE)$$, 'P0001', 'COACH_CLIENT_INSIGHTS_UNAVAILABLE', 'coach_b insights fail generically for client_a');
SELECT throws_ok($$SELECT public.get_coach_client_measurements('a1000000-0000-4000-8000-000000000001', CURRENT_DATE - 30, CURRENT_DATE)$$, 'P0001', 'COACH_CLIENT_INSIGHTS_UNAVAILABLE', 'coach_b measurements fail generically for client_a');
SELECT is((SELECT count(*) FROM public.workout_exercises WHERE workout_id = '54100000-0000-4000-8000-000000000001'), 0::BIGINT, 'coach_b has no direct client_a prescription access');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.workout_exercises WHERE workout_id = '54100000-0000-4000-8000-000000000001'), 0::BIGINT, 'client_b has no client_a prescription access');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000005', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.workout_exercises WHERE workout_id = '54100000-0000-4000-8000-000000000001'), 0::BIGINT, 'pending_coach has no client_a prescription access');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000006', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.workout_exercises WHERE workout_id = '54100000-0000-4000-8000-000000000001'), 0::BIGINT, 'suspended_coach has no client_a prescription access');

-- Notifications and audit are owner/admin projections, never cross-tenant tables.
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.product_notifications WHERE id = '61100000-0000-4000-8000-000000000001'), 1::BIGINT, 'client_a reads own notification');
SELECT is((SELECT count(*) FROM public.product_notifications WHERE id = '61200000-0000-4000-8000-000000000002'), 0::BIGINT, 'client_a cannot read client_b notification');
SELECT lives_ok($$UPDATE public.product_notifications SET read_at = NOW() WHERE id = '61100000-0000-4000-8000-000000000001'$$, 'client_a marks own notification read');
SELECT ok((SELECT read_at IS NOT NULL FROM public.product_notifications WHERE id = '61100000-0000-4000-8000-000000000001'), 'notification update has an observable read timestamp');
SELECT throws_ok($$INSERT INTO public.product_notifications (user_id, type, title, body, dedupe_key) VALUES ('a1000000-0000-4000-8000-000000000001','coaching_assignment_status','Forged','Forged','forged')$$, '42501', NULL, 'notification insert is denied');
SELECT throws_ok($$DELETE FROM public.product_notifications WHERE id = '61100000-0000-4000-8000-000000000001'$$, '42501', NULL, 'notification delete is denied');
SELECT throws_ok($$SELECT public.create_product_notification('a2000000-0000-4000-8000-000000000002','coaching_assignment_status','Forged RPC','Forged RPC','/coaching','forged-rpc','{}'::JSONB)$$, '42501', NULL, 'notification definer helper is not executable by authenticated actors');
SELECT throws_ok($$SELECT count(*) FROM public.professional_audit_logs$$, '42501', NULL, 'authenticated actors cannot read raw professional audit');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000007', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.workout_plans), 0::BIGINT, 'authenticated admin has no direct client table bypass');
SELECT throws_ok($$SELECT count(*) FROM public.admin_audit_logs$$, '42501', NULL, 'authenticated admin cannot read server-only admin audit rows');
SELECT throws_ok($$SELECT public.suspend_account_and_professional('a3000000-0000-4000-8000-000000000003', 'a7000000-0000-4000-8000-000000000007', 'Forged direct admin call', NULL)$$, '42501', NULL, 'authenticated admin cannot invoke the service-only suspension RPC directly');
RESET ROLE; SELECT set_config('request.jwt.claim.role', 'service_role', true); SELECT set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000007', true); SET LOCAL ROLE service_role;
SELECT ok((SELECT count(*) FROM public.professional_audit_logs WHERE id = '62100000-0000-4000-8000-000000000001') = 1, 'service role observes the seeded audit row');

-- Revocation is checked in the same transaction and identity transition: the
-- very next statement/RPC must see the new authority state.
RESET ROLE; SELECT set_config('request.jwt.claim.role', 'authenticated', true); SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true); SET LOCAL ROLE authenticated;
SELECT ok((SELECT changed FROM public.revoke_body_measurements_consent('11100000-0000-4000-8000-000000000001', '71100000-0000-4000-8000-000000000001')), 'client_a revokes body-measurement scope');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000003', true); SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.get_coach_client_measurements('a1000000-0000-4000-8000-000000000001', CURRENT_DATE - 30, CURRENT_DATE)$$, 'P0001', 'COACH_CLIENT_INSIGHTS_UNAVAILABLE', 'next coach measurement RPC fails after scope revocation');
SELECT ok((SELECT changed FROM public.end_coaching_relationship('11100000-0000-4000-8000-000000000001', 'Authorization matrix termination', '71200000-0000-4000-8000-000000000001')), 'coach_a terminates client_a relationship');
SELECT is((SELECT count(*) FROM public.trainer_plan_assignments WHERE id = '51100000-0000-4000-8000-000000000001'), 0::BIGINT, 'next coach statement sees zero client_a assignments after termination');
SELECT throws_ok($$SELECT public.get_coach_client_insights('a1000000-0000-4000-8000-000000000001', CURRENT_DATE - 30, CURRENT_DATE)$$, 'P0001', 'COACH_CLIENT_INSIGHTS_UNAVAILABLE', 'next coach insights RPC fails after termination');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.trainer_plan_assignments WHERE id = '51100000-0000-4000-8000-000000000001'), 1::BIGINT, 'client_a retains assignment history after termination');
SELECT is((SELECT count(*) FROM public.workout_plans WHERE id = '53100000-0000-4000-8000-000000000001'), 1::BIGINT, 'client_a retains materialized plan after termination');
SELECT is((public.authorize_session_start('71300000-0000-4000-8000-000000000001', '54100000-0000-4000-8000-000000000001')->'plan'->>'prescriptionLocked'), 'true', 'client_a retains plan execution after termination');

RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true); SET LOCAL ROLE authenticated;
SELECT ok((SELECT changed FROM public.revoke_training_profile_consent('22200000-0000-4000-8000-000000000002', '72100000-0000-4000-8000-000000000002')), 'client_b revokes training-profile scope');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000003', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.trainer_plan_assignments WHERE id = '51200000-0000-4000-8000-000000000002'), 0::BIGINT, 'next coach statement sees zero client_b assignments after scope revocation');
SELECT is((public.get_coach_clients_summary()->'counts'->>'activeClients')::INTEGER, 0, 'coach summary drops every revoked or ended client');

RESET ROLE; SELECT set_config('request.jwt.claim.role', 'service_role', true); SELECT set_config('request.jwt.claim.sub', 'a7000000-0000-4000-8000-000000000007', true); SET LOCAL ROLE service_role;
SELECT ok((SELECT account_suspended AND trainer_profile_suspended FROM public.suspend_account_and_professional('a3000000-0000-4000-8000-000000000003', 'a7000000-0000-4000-8000-000000000007', 'Authorization matrix suspension', NULL)), 'administrator service role suspends coach_a');
RESET ROLE; SELECT set_config('request.jwt.claim.role', 'authenticated', true); SELECT set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000003', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.trainer_program_templates), 0::BIGINT, 'next suspended coach statement sees zero owned templates');
SELECT is((SELECT count(*) FROM public.coaching_requests WHERE id = 'f7000000-0000-4000-8000-000000000007'), 0::BIGINT, 'next suspended coach statement sees zero pending requests');
SELECT throws_ok($$SELECT public.get_coach_clients_summary()$$, 'P0001', 'COACH_CLIENT_INSIGHTS_UNAVAILABLE', 'next suspended coach RPC fails generically');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.trainer_plan_assignments WHERE id = '51100000-0000-4000-8000-000000000001'), 1::BIGINT, 'client_a keeps assignment history after coach suspension');
SELECT is((SELECT count(*) FROM public.workout_plans WHERE id = '53100000-0000-4000-8000-000000000001'), 1::BIGINT, 'client_a keeps materialized plan after coach suspension');
SELECT is((public.authorize_session_start('71300000-0000-4000-8000-000000000001', '54100000-0000-4000-8000-000000000001')->'plan'->>'trainerAssignmentVersionId'), '52100000-0000-4000-8000-000000000001', 'client_a reauthorizes the retained snapshot after every authority transition');
SELECT lives_ok($$SELECT public.save_session_log_atomic_v3(
  '71300000-0000-4000-8000-000000000001', '54100000-0000-4000-8000-000000000001', NOW(), 35, NULL,
  '[{"exercise_id":"40100000-0000-4000-8000-000000000001","sets_completed":1,"reps_completed":[8],"weights_kg":[20],"rpe_values":[7],"duration_seconds":null,"notes":"Retained execution after revocation","skip_reason":null}]'::JSONB,
  '{"version":1,"prs":[],"progressions":[]}'::JSONB
)$$, 'client_a executes the retained professional plan after relationship, consent, and coach revocation');
SELECT is((SELECT count(*) FROM public.progress_logs WHERE client_session_id = '71300000-0000-4000-8000-000000000001'), 1::BIGINT, 'post-revocation execution persists one observable session');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000004', true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.trainer_plan_assignments WHERE client_user_id IN ('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002')), 0::BIGINT, 'coach_b still has zero cross-tenant assignments after all transitions');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000006', true); SET LOCAL ROLE authenticated;
SELECT throws_ok($$INSERT INTO public.trainer_program_templates (trainer_user_id, name, days_per_week) VALUES ('a6000000-0000-4000-8000-000000000006','Suspended write',1)$$, '42501', NULL, 'suspended_coach cannot create templates');
RESET ROLE; SELECT set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000005', true); SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.get_coach_clients_summary()$$, 'P0001', 'COACH_CLIENT_INSIGHTS_UNAVAILABLE', 'pending_coach cannot invoke coach insights');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;

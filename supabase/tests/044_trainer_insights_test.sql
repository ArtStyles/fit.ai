BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(26);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('f4000000-0000-4000-8000-000000000001', 'insights-trainer@example.test', '{}'::JSONB),
  ('f4000000-0000-4000-8000-000000000002', 'insights-other-trainer@example.test', '{}'::JSONB),
  ('f4000000-0000-4000-8000-000000000003', 'insights-client@example.test', '{}'::JSONB);
INSERT INTO public.profiles (
  id, full_name, avatar_url, timezone, fitness_level, primary_goal, days_per_week,
  session_duration_minutes, gym_type, available_equipment, movement_limitations,
  onboarding_done, account_status
) VALUES
  ('f4000000-0000-4000-8000-000000000001', 'Insights trainer', 'https://example.test/insights-trainer.webp', 'America/Havana', 'advanced', 'gain_strength', 4, 60, 'full_gym', ARRAY[]::TEXT[], '[]'::JSONB, TRUE, 'active'),
  ('f4000000-0000-4000-8000-000000000002', 'Other trainer', 'https://example.test/insights-other.webp', 'America/Havana', 'advanced', 'gain_strength', 4, 60, 'full_gym', ARRAY[]::TEXT[], '[]'::JSONB, TRUE, 'active'),
  ('f4000000-0000-4000-8000-000000000003', 'Consent client', 'https://example.test/insights-client.webp', 'America/Havana', 'intermediate', 'build_muscle', 3, 45, 'home_basic', ARRAY['dumbbells']::TEXT[], '["knee"]'::JSONB, TRUE, 'active');
INSERT INTO public.trainer_applications (id, user_id) VALUES
  ('f4000000-0000-4000-8000-000000000011', 'f4000000-0000-4000-8000-000000000001'),
  ('f4000000-0000-4000-8000-000000000012', 'f4000000-0000-4000-8000-000000000002');
INSERT INTO public.trainer_profiles (id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary) VALUES
  ('f4000000-0000-4000-8000-000000000021', 'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000011', 'insights-trainer', 'active', 'Insights trainer', 'Bio', 'Evidence'),
  ('f4000000-0000-4000-8000-000000000022', 'f4000000-0000-4000-8000-000000000002', 'f4000000-0000-4000-8000-000000000012', 'insights-other-trainer', 'active', 'Other trainer', 'Bio', 'Evidence');
INSERT INTO public.trainer_service_offerings (id, trainer_profile_id, name, modality, duration_minutes) VALUES
  ('f4000000-0000-4000-8000-000000000031', 'f4000000-0000-4000-8000-000000000021', 'Insights service', 'online', 60),
  ('f4000000-0000-4000-8000-000000000032', 'f4000000-0000-4000-8000-000000000022', 'Other service', 'online', 60);
INSERT INTO public.coaching_relationships (id, service_id, trainer_user_id, client_user_id, status) VALUES
  ('f4000000-0000-4000-8000-000000000041', 'f4000000-0000-4000-8000-000000000031', 'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000003', 'active');
INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by) VALUES
  ('f4000000-0000-4000-8000-000000000041', 'training_profile', 'training-profile-v1', 'f4000000-0000-4000-8000-000000000003');
INSERT INTO public.exercises (id, name) VALUES
  ('f4000000-0000-4000-8000-000000000051', 'Live exercise name');

SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.trainer_plan_assignments (id, relationship_id, trainer_user_id, client_user_id, status, accepted_at, active_version_id) VALUES
  ('f4000000-0000-4000-8000-000000000061', 'f4000000-0000-4000-8000-000000000041', 'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000003', 'active', NOW(), 'f4000000-0000-4000-8000-000000000071');
INSERT INTO public.trainer_assignment_versions (id, assignment_id, version_number, snapshot, status, effective_from, materialized_plan_id) VALUES
  ('f4000000-0000-4000-8000-000000000071', 'f4000000-0000-4000-8000-000000000061', 1,
    jsonb_build_object('schemaVersion', 1, 'workouts', jsonb_build_array(jsonb_build_object(
      'sourceTemplateWorkoutId', 'f4000000-0000-4000-8000-000000000081',
      'name', 'Prescription workout',
      'dayOfWeek', EXTRACT(ISODOW FROM NOW() AT TIME ZONE 'America/Havana')::INTEGER,
      'orderInPlan', 1,
      'exercises', jsonb_build_array(jsonb_build_object(
        'exerciseId', 'f4000000-0000-4000-8000-000000000051', 'sets', 3, 'reps', 8
      ))
    ))),
    'active', NOW() - INTERVAL '14 days', 'f4000000-0000-4000-8000-000000000091');
INSERT INTO public.workout_plans (id, user_id, name, family_id, is_active, source_type, library_slot, prescription_locked, trainer_relationship_id, trainer_assignment_id, trainer_assignment_version_id) VALUES
  ('f4000000-0000-4000-8000-000000000091', 'f4000000-0000-4000-8000-000000000003', 'Live workout name', gen_random_uuid(), TRUE, 'trainer_assigned', 'professional', TRUE, 'f4000000-0000-4000-8000-000000000041', 'f4000000-0000-4000-8000-000000000061', 'f4000000-0000-4000-8000-000000000071');
SET CONSTRAINTS ALL IMMEDIATE;
INSERT INTO public.workouts (id, user_id, plan_id, name, day_of_week, order_in_plan) VALUES
  ('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000003', 'f4000000-0000-4000-8000-000000000091', 'Live workout name', EXTRACT(ISODOW FROM NOW() AT TIME ZONE 'America/Havana')::INTEGER, 1),
  ('f4000000-0000-4000-8000-000000000102', 'f4000000-0000-4000-8000-000000000003', NULL, 'Personal workout', NULL, NULL);
INSERT INTO public.workout_exercises (workout_id, exercise_id, order_index, sets, reps, rest_seconds) VALUES
  ('f4000000-0000-4000-8000-000000000101', 'f4000000-0000-4000-8000-000000000051', 1, 3, 8, 60);
INSERT INTO public.progress_logs (id, user_id, client_session_id, workout_id, completed_at, duration_minutes, notes, session_context_snapshot) VALUES
  ('f4000000-0000-4000-8000-000000000112', 'f4000000-0000-4000-8000-000000000003', 'f4000000-0000-4000-8000-000000000122', 'f4000000-0000-4000-8000-000000000102', NOW() - INTERVAL '1 day', 20, 'PERSONAL_LOG_MUST_NOT_LEAK',
    '{"version":1,"plan":{"trainerAssignmentVersionId":"f4000000-0000-4000-8000-000000000071"}}'::JSONB);

SELECT set_config('request.jwt.claim.sub', 'f4000000-0000-4000-8000-000000000003', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.authorize_session_start('f4000000-0000-4000-8000-000000000121', 'f4000000-0000-4000-8000-000000000101')$$,
  'the client receives a real professional session authorization'
);
SELECT lives_ok(
  $$SELECT * FROM public.save_session_log_atomic_v3(
    'f4000000-0000-4000-8000-000000000121',
    'f4000000-0000-4000-8000-000000000101',
    NOW(), 37, 4,
    '[{"exercise_id":"f4000000-0000-4000-8000-000000000051","sets_completed":3,"reps_completed":[8,8,8],"weights_kg":[42,42,42],"rpe_values":[7,8,8],"duration_seconds":null,"notes":"Trusted result","skip_reason":null}]'::JSONB,
    '{"version":1}'::JSONB
  )$$,
  'the consumed authorization persists professional evidence'
);
RESET ROLE;

SELECT ok(
  has_function_privilege('authenticated', 'public.get_coach_clients_summary()', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.get_coach_client_insights(uuid,date,date)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.get_coach_client_insights(uuid,date,date)', 'EXECUTE'),
  'insight RPCs are authenticated entry points only'
);

SELECT set_config('request.jwt.claim.sub', 'f4000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.get_coach_clients_summary()$$, 'the consented active trainer receives a summary');
SELECT is(
  (SELECT jsonb_array_length(public.get_coach_clients_summary()->'clients')),
  1,
  'summary exposes exactly the active consented client'
);
SELECT is(
  (SELECT public.get_coach_clients_summary()->'counts'->>'activeClients'),
  '1',
  'summary exposes active and consented client counts without paused client detail'
);
SELECT ok(
  (SELECT (public.get_coach_clients_summary()->'clients'->0->'adherenceInput'->'sessions'->0->>'averageRpe')::NUMERIC BETWEEN 7.6 AND 7.7),
  'summary exposes only the aggregate RPE needed for the operational alert'
);
SELECT ok(
  (SELECT jsonb_array_length(public.get_coach_clients_summary()->'clients'->0->'adherenceInput'->'alertSessions') >= 1),
  'summary supplies a separate minimal activity-alert window'
);
SELECT lives_ok(
  $$SELECT public.get_coach_client_insights('f4000000-0000-4000-8000-000000000003', CURRENT_DATE - 30, CURRENT_DATE)$$,
  'the relationship trainer can read basic consented evidence'
);
SELECT is(
  (SELECT public.get_coach_client_insights('f4000000-0000-4000-8000-000000000003', CURRENT_DATE - 30, CURRENT_DATE)->>'schemaVersion'),
  '1',
  'detail returns the versioned payload'
);
SELECT is(
  (SELECT public.get_coach_client_insights('f4000000-0000-4000-8000-000000000003', CURRENT_DATE - 30, CURRENT_DATE)->'sessions'->0->'workout'->>'name'),
  'Live workout name',
  'trusted authorization snapshot supplies the workout name'
);
SELECT is(
  (SELECT public.get_coach_client_insights('f4000000-0000-4000-8000-000000000003', CURRENT_DATE - 30, CURRENT_DATE)->'sessions'->0->'exerciseResults'->0->>'name'),
  'Live exercise name',
  'trusted authorization snapshot supplies the exercise name'
);
SELECT is(
  (SELECT public.get_coach_client_insights('f4000000-0000-4000-8000-000000000003', CURRENT_DATE - 30, CURRENT_DATE)->'prescribedWorkouts'->0->>'id'),
  'f4000000-0000-4000-8000-000000000101',
  'prescribed workouts expose the materialized workout id that session evidence uses'
);
SELECT is(
  (SELECT jsonb_array_length(public.get_coach_clients_summary()->'clients'->0->'adherenceInput'->'sessions')),
  1,
  'summary exposes only trusted professional weekly session inputs'
);
SELECT ok(
  (SELECT public.get_coach_clients_summary()::TEXT NOT LIKE '%Trusted result%'),
  'summary adherence input excludes session notes and exercise result data'
);
SELECT is(
  (SELECT jsonb_array_length(public.get_coach_client_insights('f4000000-0000-4000-8000-000000000003', CURRENT_DATE - 30, CURRENT_DATE)->'sessions')),
  1,
  'a personal log with a forged professional snapshot does not leak into evidence'
);
RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE public.progress_logs
SET workout_id = NULL
WHERE client_session_id = 'f4000000-0000-4000-8000-000000000121';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'f4000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT public.get_coach_client_insights('f4000000-0000-4000-8000-000000000003', CURRENT_DATE - 30, CURRENT_DATE)->'sessions'->0->'workout'->>'id'),
  'f4000000-0000-4000-8000-000000000101',
  'a detached genuine log remains visible through its trusted authorization workout id'
);
SELECT is(
  (SELECT public.get_coach_client_insights('f4000000-0000-4000-8000-000000000003', CURRENT_DATE - 30, CURRENT_DATE)->'sessions'->0->'workout'->>'name'),
  'Live workout name',
  'a detached genuine log retains the trusted authorization snapshot name'
);
SELECT ok(
  (SELECT public.get_coach_client_insights('f4000000-0000-4000-8000-000000000003', CURRENT_DATE - 30, CURRENT_DATE)->'measurements' = 'null'::JSONB),
  'basic insight fixes measurements to null'
);
SELECT ok(
  to_regclass('public.measurements') IS NULL,
  'the isolated fixture omits measurements so the successful basic RPC proves it did not read that table'
);
SELECT lives_ok(
  $$SELECT public.get_coach_client_insights('f4000000-0000-4000-8000-000000000003', CURRENT_DATE - 179, CURRENT_DATE)$$,
  'an inclusive 180-calendar-day range is accepted at the 179-day difference boundary'
);
SELECT throws_ok(
  $$SELECT public.get_coach_client_insights('f4000000-0000-4000-8000-000000000003', CURRENT_DATE - 180, CURRENT_DATE)$$,
  'P0001', 'COACH_CLIENT_INSIGHTS_UNAVAILABLE',
  'an inclusive 181-calendar-day range is rejected without a descriptive leak'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'f4000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.get_coach_client_insights('f4000000-0000-4000-8000-000000000003', CURRENT_DATE - 30, CURRENT_DATE)$$,
  'P0001', 'COACH_CLIENT_INSIGHTS_UNAVAILABLE',
  'another trainer receives the same generic unavailable response'
);
RESET ROLE;

SET LOCAL ROLE service_role;
UPDATE public.coaching_relationships
SET status = 'paused_by_platform', paused_at = NOW()
WHERE id = 'f4000000-0000-4000-8000-000000000041';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'f4000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.get_coach_client_insights('f4000000-0000-4000-8000-000000000003', CURRENT_DATE - 30, CURRENT_DATE)$$,
  'P0001', 'COACH_CLIENT_INSIGHTS_UNAVAILABLE',
  'a paused relationship is indistinguishable from unavailable'
);
RESET ROLE;

SET LOCAL ROLE service_role;
UPDATE public.coaching_relationships
SET status = 'active', paused_at = NULL
WHERE id = 'f4000000-0000-4000-8000-000000000041';
UPDATE public.coaching_consents
SET revoked_at = NOW(), revoked_by = 'f4000000-0000-4000-8000-000000000003'
WHERE relationship_id = 'f4000000-0000-4000-8000-000000000041' AND scope = 'training_profile';
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.get_coach_client_insights('f4000000-0000-4000-8000-000000000003', CURRENT_DATE - 30, CURRENT_DATE)$$,
  'P0001', 'COACH_CLIENT_INSIGHTS_UNAVAILABLE',
  'a revoked training profile consent is indistinguishable from unavailable'
);
RESET ROLE;

SET LOCAL ROLE service_role;
UPDATE public.coaching_consents
SET revoked_at = NULL, revoked_by = NULL
WHERE relationship_id = 'f4000000-0000-4000-8000-000000000041' AND scope = 'training_profile';
UPDATE public.coaching_relationships
SET status = 'ended', ended_at = NOW(), ended_by = 'f4000000-0000-4000-8000-000000000001', end_reason = 'Ended for test'
WHERE id = 'f4000000-0000-4000-8000-000000000041';
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.get_coach_client_insights('f4000000-0000-4000-8000-000000000003', CURRENT_DATE - 30, CURRENT_DATE)$$,
  'P0001', 'COACH_CLIENT_INSIGHTS_UNAVAILABLE',
  'an ended relationship is indistinguishable from unavailable'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;

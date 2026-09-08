-- phase: fixtures
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

INSERT INTO auth.users (id,email) VALUES ('59000000-0000-4000-8000-000000000003','other-client@example.test');
INSERT INTO public.profiles (id,full_name,account_status,onboarding_done) VALUES ('59000000-0000-4000-8000-000000000003','Other client','active',true);
INSERT INTO public.coaching_relationships (id,service_id,trainer_user_id,client_user_id,status)
SELECT '59000000-0000-4000-8000-000000000042',service_id,trainer_user_id,'59000000-0000-4000-8000-000000000003','active'
FROM public.coaching_relationships WHERE id='59000000-0000-4000-8000-000000000041';
INSERT INTO public.coaching_consents (relationship_id,scope,text_version,granted_by)
VALUES ('59000000-0000-4000-8000-000000000042','training_profile','training-profile-v1','59000000-0000-4000-8000-000000000003');
INSERT INTO public.trainer_program_templates (id,trainer_user_id,name,days_per_week,status)
SELECT id,'59000000-0000-4000-8000-000000000001','Same display name',1,'active' FROM unnest(ARRAY[
'59000000-0000-4000-8000-000000000062'::uuid,'59000000-0000-4000-8000-000000000063'::uuid,'59000000-0000-4000-8000-000000000064'::uuid]) id;
INSERT INTO public.trainer_template_workouts (id,template_id,name,day_of_week,order_in_plan) VALUES
('59000000-0000-4000-8000-000000000072','59000000-0000-4000-8000-000000000062','Second day',1,1),
('59000000-0000-4000-8000-000000000073','59000000-0000-4000-8000-000000000063','Third day',1,1);
INSERT INTO public.trainer_template_exercises (template_workout_id,exercise_id,order_index,sets,reps,rest_seconds)
SELECT id,'59000000-0000-4000-8000-000000000051',1,3,8,60 FROM public.trainer_template_workouts
WHERE id IN ('59000000-0000-4000-8000-000000000072','59000000-0000-4000-8000-000000000073');
UPDATE public.trainer_template_workouts SET day_of_week=extract(isodow from now() at time zone 'America/Havana')::int;
INSERT INTO public.workout_plans (id,user_id,name,days_per_week,is_active,source_type,family_id,library_slot)
VALUES ('59000000-0000-4000-8000-000000000091','59000000-0000-4000-8000-000000000002','Personal',1,true,'manual','59000000-0000-4000-8000-000000000091','personal');

-- phase: personal_creation
BEGIN;
-- PERSONAL_FIXTURES
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path=public,extensions;
SELECT no_plan();
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','59400000-0000-4000-8000-000000000001',true);
SELECT workout_plan_id AS manual_professional FROM assign_trainer_program('59400000-0000-4000-8000-000000000041','59400000-0000-4000-8000-000000000061',NULL,'personal-manual') \gset
SELECT workout_plan_id AS engine_professional FROM assign_trainer_program('59400000-0000-4000-8000-000000000042','59400000-0000-4000-8000-000000000061',NULL,'personal-engine') \gset
SELECT set_config('request.jwt.claim.sub','59400000-0000-4000-8000-000000000003',true);
SELECT activate_plan_version(:'engine_professional');
SELECT set_config('request.jwt.claim.sub','59400000-0000-4000-8000-000000000002',true);
SELECT activate_plan_version(:'manual_professional');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT jsonb_build_array(
  (SELECT jsonb_agg(to_jsonb(p)-'is_active'-'updated_at' ORDER BY p.id) FROM workout_plans p WHERE id IN (:'manual_professional',:'engine_professional')),
  (SELECT jsonb_agg(to_jsonb(w) ORDER BY w.id) FROM workouts w WHERE plan_id IN (:'manual_professional',:'engine_professional')),
  (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM workout_exercises e JOIN workouts w ON w.id=e.workout_id WHERE w.plan_id IN (:'manual_professional',:'engine_professional')),
  (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM trainer_plan_assignments a WHERE trainer_user_id='59400000-0000-4000-8000-000000000001'),
  (SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM trainer_assignment_versions v WHERE materialized_plan_id IN (:'manual_professional',:'engine_professional'))
) AS professional_snapshot \gset
SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) AS manual_periods FROM private.trainer_plan_selection_periods p WHERE client_user_id='59400000-0000-4000-8000-000000000002' \gset
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT is(session_user::text,'authenticator','personal creation uses an actual API session');
SELECT is(current_user::text,'authenticated','personal creation uses the authenticated role');
SELECT '{"display_name":"Independent engine","days":[{"display_name":"Engine day","day_of_week":1,"day_number":1,"estimated_duration_minutes":30,"exercises":[{"exercise_id":"59400000-0000-4000-8000-000000000051","sets":3,"reps":8,"rest_seconds":60}]}]}' AS engine_payload \gset
SELECT throws_ok($$SELECT create_manual_plan_atomic('{"name":" "}','[{"name":"Day"}]',true)$$,'P0001','Manual plan name is required','manual creation still validates its name');
SELECT throws_ok($$SELECT create_manual_plan_atomic('{"name":"Invalid"}','[]',true)$$,'P0001','Manual plan has no workouts','manual creation still requires workouts');
SELECT throws_ok($$SELECT create_manual_plan_atomic('{"name":"Invalid"}','[{"name":"Day","day_of_week":1,"order_in_plan":1},{"name":" "}]',false)$$,'P0001','Manual workout name is required','late invalid workout rejects the complete manual creation');
SELECT is((SELECT count(*)::int FROM workout_plans WHERE library_slot='personal'),1,'failed manual creation leaves no partial family');
SELECT create_manual_plan_atomic('{"name":"Library only","user_id":"59400000-0000-4000-8000-000000000003"}','[{"name":"Saved day","day_of_week":1,"order_in_plan":1}]',false) AS manual_saved \gset
SELECT ok((SELECT NOT is_active AND library_slot='personal' AND parent_plan_id IS NULL AND user_id='59400000-0000-4000-8000-000000000002' FROM workout_plans WHERE id=:'manual_saved'),'manual false saves an independent family owned by the caller');
SELECT ok((SELECT is_active FROM workout_plans WHERE id=:'manual_professional'),'manual false keeps the professional principal');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT is((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM private.trainer_plan_selection_periods p WHERE client_user_id='59400000-0000-4000-8000-000000000002'),:'manual_periods'::jsonb,'manual false preserves exact open selection history');
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT retire_plan_family(:'manual_saved');
SELECT lives_ok($$SELECT create_manual_plan_atomic('{"name":"Independent manual"}','[{"name":"Manual day","day_of_week":1,"order_in_plan":1}]',true)$$,'manual creation can select a new personal family while a professional plan is principal');
SELECT id AS manual_personal FROM workout_plans WHERE name='Independent manual' \gset
SELECT ok((SELECT is_active AND library_slot='personal' AND source_type='manual' AND parent_plan_id IS NULL AND family_id<>(SELECT family_id FROM workout_plans WHERE id=:'manual_professional') FROM workout_plans WHERE id=:'manual_personal'),'manual true selects a separate personal family without a professional parent');
SELECT ok((SELECT NOT is_active AND retired_at IS NULL AND superseded_at IS NULL FROM workout_plans WHERE id=:'manual_professional'),'manual selection leaves professional copy available and unsuperseded');
SELECT is((SELECT count(*)::int FROM workout_plans WHERE is_active),1,'manual creation leaves exactly one principal');
SELECT ok((SELECT retired_at IS NULL AND superseded_at IS NULL FROM workout_plans WHERE id='59400000-0000-4000-8000-000000000091'),'manual creation preserves the other personal family');
SELECT throws_ok($$SELECT create_manual_plan_atomic('{"name":"Excess"}','[{"name":"Day","day_of_week":1,"order_in_plan":1}]',false)$$,'P0001','PLAN_FAMILY_LIMIT: free plan family limit reached','manual creation retains the free personal-family cap');
SELECT throws_ok(format('SELECT create_engine_plan_v2(%L,''{}'',1,''first_plan'',NULL,''59400000-0000-4000-8000-000000000109'')',:'engine_payload'),'P0001','PLAN_FAMILY_LIMIT: free plan family limit reached','engine creation retains the shared personal-family cap');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT is((SELECT count(*)::int FROM private.trainer_plan_selection_periods WHERE client_user_id='59400000-0000-4000-8000-000000000002' AND ended_at IS NOT NULL),1,'manual switch closes the professional selection period once');
SELECT is((SELECT count(*)::int FROM private.trainer_plan_selection_periods WHERE client_user_id='59400000-0000-4000-8000-000000000002' AND ended_at IS NULL),0,'manual switch leaves no open professional period');
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','59400000-0000-4000-8000-000000000003',true);
SELECT throws_ok(format('SELECT create_engine_plan_v2(%L,''{}'',1,''first_plan'',NULL,NULL)',:'engine_payload'),'P0001','PLAN_REQUEST_ID_REQUIRED','engine still requires an idempotency request');
SELECT throws_ok(format('SELECT create_engine_plan_v2(%L,''{}'',1,''first_plan'',%L,''59400000-0000-4000-8000-000000000110'')',:'engine_payload',:'engine_professional'),'P0001','PLAN_INITIAL_PARENT_NOT_ALLOWED','initial mode cannot smuggle a professional parent');
SELECT throws_ok($$SELECT create_engine_plan_v2('{"display_name":"Invalid","days":[{"display_name":"Day","exercises":[]}]}','{}',1,'first_plan',NULL,'59400000-0000-4000-8000-000000000110')$$,'P0001','Workout day has no exercises','engine rejects a malformed workout after attempting a plan insert');
SELECT is((SELECT count(*)::int FROM workout_plans WHERE library_slot='personal'),0,'failed engine creation rolls back the partial plan');
SELECT lives_ok(format('SELECT create_engine_plan_v2(%L,''{"engineVersion":"personal-integration"}'',1,''first_plan'',NULL,''59400000-0000-4000-8000-000000000101'',''{"days_per_week":2,"session_duration_minutes":30,"preferred_workout_days":[1],"available_equipment":["barbell"],"cardio_preferences":["walking"]}'')',:'engine_payload'),'first engine creation can select a new personal family while a professional plan is principal');
SELECT id AS engine_personal,family_id AS engine_family FROM workout_plans WHERE generation_request_id='59400000-0000-4000-8000-000000000101' \gset
SELECT ok((SELECT is_active AND library_slot='personal' AND source_type='engine' AND parent_plan_id IS NULL AND family_id<>(SELECT family_id FROM workout_plans WHERE id=:'engine_professional') FROM workout_plans WHERE id=:'engine_personal'),'first engine plan is principal in a separate family without a professional parent');
SELECT is((SELECT count(*)::int FROM workout_plans WHERE is_active),1,'engine first creation leaves exactly one principal');
SELECT ok((SELECT days_per_week=2 AND session_duration_minutes=30 AND preferred_workout_days=ARRAY[1] AND available_equipment=ARRAY['barbell'] AND cardio_preferences=ARRAY['walking'] FROM profiles WHERE id='59400000-0000-4000-8000-000000000003'),'engine creation retains all profile update semantics');
SELECT activate_plan_version(:'engine_professional');
SELECT is(create_engine_plan_v2(:'engine_payload','{}',1,'first_plan',NULL,'59400000-0000-4000-8000-000000000101','{"days_per_week":3}'),:'engine_personal'::uuid,'retry returns its original personal plan while professional is selected');
SELECT ok((SELECT is_active FROM workout_plans WHERE id=:'engine_professional'),'idempotent retry does not replace the newer principal choice');
SELECT is((SELECT days_per_week FROM profiles WHERE id='59400000-0000-4000-8000-000000000003'),2,'idempotent retry does not apply profile updates again');
SELECT throws_ok(format('SELECT create_engine_plan_v2(%L,''{}'',2,''weekly_regeneration'',%L,''59400000-0000-4000-8000-000000000102'')',:'engine_payload',:'engine_professional'),'P0001','PROFESSIONAL_PLAN_REPLACEMENT_FORBIDDEN','direct weekly RPC cannot regenerate the professional principal');
SELECT throws_ok(format('SELECT create_engine_plan_v2(%L,''{}'',2,''manual_update'',%L,''59400000-0000-4000-8000-000000000103'')',:'engine_payload',:'engine_professional'),'P0001','PROFESSIONAL_PLAN_REPLACEMENT_FORBIDDEN','direct manual-update RPC cannot replace the professional principal');
SELECT w.id AS professional_workout,e.id AS professional_exercise FROM workouts w JOIN workout_exercises e ON e.workout_id=w.id WHERE w.plan_id=:'engine_professional' \gset
SELECT throws_ok(format('SELECT apply_workout_adjustment_atomic(%L,%L)',:'professional_workout',jsonb_build_array(jsonb_build_object('type','update_exercise','workoutExerciseId',:'professional_exercise','sets',5))::text),'P0001','WORKOUT_ADJUSTMENT_NOT_EDITABLE','direct adjustment RPC cannot mutate a professional prescription');
SELECT throws_ok(format('UPDATE workout_plans SET name=''Forged after creation'' WHERE id=%L',:'engine_professional'),'P0001','TRAINER_PRESCRIPTION_LOCKED','successful creation and selection never grant invoker prescription privileges');
SELECT activate_plan_version(:'engine_personal');
SELECT create_engine_plan_v2(:'engine_payload','{}',2,'weekly_regeneration',:'engine_personal','59400000-0000-4000-8000-000000000104') AS weekly_personal \gset
SELECT ok((SELECT is_active AND family_id=:'engine_family' AND parent_plan_id=:'engine_personal' FROM workout_plans WHERE id=:'weekly_personal'),'personal weekly regeneration keeps its family and direct parent');
SELECT ok((SELECT NOT is_active AND superseded_at IS NOT NULL FROM workout_plans WHERE id=:'engine_personal'),'personal regeneration still supersedes the original version');
SELECT is(create_engine_plan_v2(:'engine_payload','{}',2,'weekly_regeneration',:'engine_personal','59400000-0000-4000-8000-000000000104'),:'weekly_personal'::uuid,'weekly retry succeeds even though its parent was superseded');
SELECT create_engine_plan_v2(:'engine_payload','{}',2,'manual_update',:'weekly_personal','59400000-0000-4000-8000-000000000105') AS adjusted_personal \gset
SELECT ok((SELECT is_active AND family_id=:'engine_family' AND parent_plan_id=:'weekly_personal' FROM workout_plans WHERE id=:'adjusted_personal'),'personal manual-update generation keeps family and parent');
SELECT w.id AS personal_workout,e.id AS personal_exercise FROM workouts w JOIN workout_exercises e ON e.workout_id=w.id WHERE w.plan_id=:'adjusted_personal' \gset
SELECT is(apply_workout_adjustment_atomic(:'personal_workout',jsonb_build_array(jsonb_build_object('type','update_exercise','workoutExerciseId',:'personal_exercise','sets',5))),1,'normal personal adjustment remains available');
SELECT is((SELECT sets FROM workout_exercises WHERE id=:'personal_exercise'),5,'personal adjustment persists the requested prescription change');
SELECT throws_ok(format('SELECT create_engine_plan_v2(%L,''{}'',2,''manual_update'',%L,''59400000-0000-4000-8000-000000000106'')',:'engine_payload',:'weekly_personal'),'P0001','PLAN_STALE_PARENT: active plan changed','regeneration still rejects a stale personal parent');
RESET ROLE;
RESET SESSION AUTHORIZATION;
-- The event ledger intentionally has no API SELECT policy; inspect persisted
-- evidence administratively, without substituting the RPC caller's API role.
SELECT ok((SELECT mode='initial' AND generator='evidence_engine' AND success AND engine_version='personal-integration' AND metadata='{"weekNumber":1}'::jsonb FROM plan_generation_events WHERE plan_id=:'engine_personal'),'engine creation records its original generation metadata');
SELECT is((SELECT count(*)::int FROM plan_generation_events WHERE plan_id=:'engine_personal'),1,'retry records no duplicate generation success');
SELECT is((SELECT mode FROM plan_generation_events WHERE plan_id=:'adjusted_personal'),'plan_adjustment','manual-update generation retains event classification');
SELECT is(jsonb_build_array(
  (SELECT jsonb_agg(to_jsonb(p)-'is_active'-'updated_at' ORDER BY p.id) FROM workout_plans p WHERE id IN (:'manual_professional',:'engine_professional')),
  (SELECT jsonb_agg(to_jsonb(w) ORDER BY w.id) FROM workouts w WHERE plan_id IN (:'manual_professional',:'engine_professional')),
  (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM workout_exercises e JOIN workouts w ON w.id=e.workout_id WHERE w.plan_id IN (:'manual_professional',:'engine_professional')),
  (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM trainer_plan_assignments a WHERE trainer_user_id='59400000-0000-4000-8000-000000000001'),
  (SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM trainer_assignment_versions v WHERE materialized_plan_id IN (:'manual_professional',:'engine_professional'))
),:'professional_snapshot'::jsonb,'personal creation, regeneration and adjustment preserve exact professional prescriptions, workouts, exercises, assignments and versions');
SELECT is((SELECT count(*)::int FROM private.trainer_plan_selection_periods WHERE client_user_id='59400000-0000-4000-8000-000000000003' AND ended_at IS NOT NULL),2,'engine selection switches close precisely the two professional periods');
SELECT is((SELECT count(*)::int FROM private.trainer_plan_selection_periods WHERE client_user_id='59400000-0000-4000-8000-000000000003' AND ended_at IS NULL),0,'personal engine principal leaves no open professional period');
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','59400000-0000-4000-8000-000000000001',true);
SELECT create_manual_plan_atomic('{"name":"Ordinary manual one"}','[{"name":"Day","day_of_week":1,"order_in_plan":1}]') AS ordinary_first \gset
SELECT create_manual_plan_atomic('{"name":"Ordinary manual two"}','[{"name":"Day","day_of_week":1,"order_in_plan":1}]') AS ordinary_second \gset
SELECT ok((SELECT is_active AND parent_plan_id IS NULL FROM workout_plans WHERE id=:'ordinary_second'),'default manual creation still selects a new personal plan for an ordinary personal library');
SELECT ok((SELECT NOT is_active AND retired_at IS NULL AND superseded_at IS NULL FROM workout_plans WHERE id=:'ordinary_first'),'ordinary manual selection preserves its existing personal family');
SELECT set_config('request.jwt.claim.sub','59400000-0000-4000-8000-000000000003',true);
SELECT throws_ok(format('SELECT create_engine_plan_v2(%L,''{}'',1,''first_plan'',NULL,''59400000-0000-4000-8000-000000000111'',''{"days_per_week":1}'')',:'engine_payload'),'23514',NULL,'late invalid profile update rejects the complete engine creation');
SELECT ok((SELECT is_active FROM workout_plans WHERE id=:'adjusted_personal'),'late engine failure preserves the selected personal version');
SELECT is((SELECT count(*)::int FROM workout_plans WHERE generation_request_id='59400000-0000-4000-8000-000000000111'),0,'late engine failure leaves no plan or reusable request result');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claim.role','service_role',true);
UPDATE profiles SET account_status='suspended' WHERE id='59400000-0000-4000-8000-000000000003';
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT ok(NOT is_account_active('59400000-0000-4000-8000-000000000003'),'account-boundary fixture is suspended');
SELECT throws_ok($$SELECT create_manual_plan_atomic('{"name":"Inactive"}','[{"name":"Day","day_of_week":1,"order_in_plan":1}]',false)$$,'42501',NULL,'inactive client cannot create a manual library entry through invoker RLS');
SELECT throws_ok(format('SELECT create_engine_plan_v2(%L,''{}'',1,''first_plan'',NULL,''59400000-0000-4000-8000-000000000112'')',:'engine_payload'),'42501',NULL,'inactive client cannot create an engine plan through invoker RLS');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claim.role','service_role',true);
UPDATE profiles SET account_status='active' WHERE id='59400000-0000-4000-8000-000000000003';
UPDATE coaching_relationships SET status='paused_by_platform',paused_at=now() WHERE id='59400000-0000-4000-8000-000000000042';
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT activate_plan_version(:'engine_professional');
SELECT throws_ok(format('SELECT create_engine_plan_v2(%L,''{}'',2,''weekly_regeneration'',%L,''59400000-0000-4000-8000-000000000113'')',:'engine_payload',:'engine_professional'),'P0001','TRAINER_PRESCRIPTION_LOCKED','weekly regeneration cannot modify even a frozen professional prescription');
SELECT throws_ok(format('SELECT create_engine_plan_v2(%L,''{}'',2,''manual_update'',%L,''59400000-0000-4000-8000-000000000114'')',:'engine_payload',:'engine_professional'),'P0001','TRAINER_PRESCRIPTION_LOCKED','manual-update generation cannot modify even a frozen professional prescription');
SELECT throws_ok(format('SELECT apply_workout_adjustment_atomic(%L,%L)',:'professional_workout',jsonb_build_array(jsonb_build_object('type','update_exercise','workoutExerciseId',:'professional_exercise','sets',5))::text),'P0001','WORKOUT_ADJUSTMENT_NOT_EDITABLE','frozen professional prescriptions remain unavailable to adjustment RPC');
SELECT ok((SELECT is_active AND superseded_at IS NULL FROM workout_plans WHERE id=:'engine_professional'),'failed frozen replacement leaves the professional principal intact');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT is((SELECT count(*)::int FROM plan_generation_events WHERE user_id='59400000-0000-4000-8000-000000000003'),3,'failed replacements and retries leave exactly the three successful generation events');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.create_manual_plan_atomic(jsonb,jsonb,boolean)'::regprocedure),'manual creation stays invoker');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.create_engine_plan_v2(jsonb,jsonb,integer,text,uuid,uuid,jsonb)'::regprocedure),'engine creation stays invoker');
ALTER FUNCTION public.create_manual_plan_atomic(jsonb,jsonb,boolean) SECURITY DEFINER;
SELECT throws_ok('SELECT trainer_security_preflight()','P0001','TRAINER_SECURITY_PREFLIGHT_FAILED','preflight rejects privileged manual creation');
ALTER FUNCTION public.create_manual_plan_atomic(jsonb,jsonb,boolean) SECURITY INVOKER;
ALTER FUNCTION public.create_engine_plan_v2(jsonb,jsonb,integer,text,uuid,uuid,jsonb) SECURITY DEFINER;
SELECT throws_ok('SELECT trainer_security_preflight()','P0001','TRAINER_SECURITY_PREFLIGHT_FAILED','preflight rejects privileged engine creation');
ALTER FUNCTION public.create_engine_plan_v2(jsonb,jsonb,integer,text,uuid,uuid,jsonb) SECURITY INVOKER;
SELECT is(trainer_security_preflight(),61,'preflight remains 61 after restoring original invoker boundaries');
-- Validate the same deferred integrity checks that a real commit must satisfy.
SET CONSTRAINTS ALL IMMEDIATE;
SELECT * FROM finish();
ROLLBACK;

-- phase: baseline
BEGIN;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT * FROM public.propose_trainer_assignment('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000061',NULL,'direct-assignment-test');
ROLLBACK;

-- phase: legacy
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT * FROM public.propose_trainer_assignment('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000061',NULL,'legacy-valid');
RESET ROLE;
UPDATE public.trainer_plan_assignments SET status='frozen' WHERE proposal_idempotency_key='legacy-valid';
SET LOCAL ROLE authenticated;
SELECT * FROM public.propose_trainer_assignment('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000061',NULL,'legacy-duplicate');
SELECT * FROM public.propose_trainer_assignment('59000000-0000-4000-8000-000000000042','59000000-0000-4000-8000-000000000061',NULL,'legacy-invalid');
RESET ROLE;
UPDATE public.trainer_plan_assignments SET status='frozen' WHERE proposal_idempotency_key='legacy-invalid';
SET LOCAL ROLE authenticated;
SELECT * FROM public.propose_trainer_assignment('59000000-0000-4000-8000-000000000042','59000000-0000-4000-8000-000000000062',NULL,'legacy-cancelled');
RESET ROLE;
UPDATE public.trainer_plan_assignments SET status='cancelled' WHERE proposal_idempotency_key='legacy-cancelled';
UPDATE public.trainer_plan_assignments SET status='proposed' WHERE proposal_idempotency_key='legacy-invalid';
UPDATE public.trainer_plan_assignments SET status='proposed',created_at=now()-interval '1 day' WHERE proposal_idempotency_key='legacy-valid';
UPDATE public.coaching_consents SET revoked_at=now(),revoked_by='59000000-0000-4000-8000-000000000003' WHERE relationship_id='59000000-0000-4000-8000-000000000042';
COMMIT;

-- phase: behavior
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path=public,extensions;
SELECT no_plan();
SELECT is((SELECT status FROM trainer_plan_assignments WHERE proposal_idempotency_key='legacy-valid'),'active','valid pending proposal becomes available');
SELECT is((SELECT status FROM trainer_plan_assignments WHERE proposal_idempotency_key='legacy-duplicate'),'cancelled','duplicate pending proposal closes without deleting evidence');
SELECT is((SELECT status FROM trainer_plan_assignments WHERE proposal_idempotency_key='legacy-invalid'),'cancelled','pending proposal without consent closes');
SELECT ok((SELECT p.retired_at IS NOT NULL FROM trainer_plan_assignments a JOIN trainer_assignment_versions v ON v.assignment_id=a.id JOIN workout_plans p ON p.id=v.materialized_plan_id WHERE a.proposal_idempotency_key='legacy-cancelled'),'historical cancelled proposal cannot leak into available library');
SELECT is((SELECT count(*)::int FROM trainer_plan_assignments WHERE accepted_at IS NOT NULL OR acceptance_idempotency_key IS NOT NULL),0,'migration records no fake acceptance');
SELECT is((SELECT count(*)::int FROM workout_plans WHERE is_active),1,'migration preserves principal plan');
SELECT ok((SELECT is_active FROM workout_plans WHERE id='59000000-0000-4000-8000-000000000091'),'personal plan remains principal');
SELECT a.id AS first_assignment,v.id AS first_version,v.materialized_plan_id AS first_plan FROM trainer_plan_assignments a JOIN trainer_assignment_versions v ON v.id=a.active_version_id WHERE a.proposal_idempotency_key='legacy-valid' \gset
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT is(session_user::text,'authenticator','API session identity is authenticator');
SELECT is(current_user::text,'authenticated','API effective role is authenticated');
SELECT is(public.trainer_security_preflight(),61,'professional security preflight includes direct assignment');
SELECT throws_ok($$SELECT * FROM assign_trainer_program('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000064',NULL,'incomplete')$$,'P0001','TRAINER_ASSIGNMENT_TEMPLATE_INCOMPLETE','incomplete template is atomic rejection');
SELECT throws_ok($$SELECT * FROM assign_trainer_program('59000000-0000-4000-8000-000000000042','59000000-0000-4000-8000-000000000062',NULL,'no-consent')$$,'P0001','TRAINER_ASSIGNMENT_CONSENT_REQUIRED','missing consent rejects assignment');
SELECT assignment_id AS second_assignment,assignment_version_id AS second_version,workout_plan_id AS second_plan FROM assign_trainer_program('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000062',NULL,'second-template') \gset
SELECT is((SELECT assignment_id FROM assign_trainer_program('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000062',NULL,'second-template')),:'second_assignment'::uuid,'same request returns original assignment');
SELECT is((SELECT assignment_id FROM propose_trainer_assignment('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000062',NULL,'second-request')),:'second_assignment'::uuid,'old proposal entry point deduplicates retained template');
SELECT throws_ok($$SELECT * FROM assign_trainer_program('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000061',NULL,'second-template')$$,'P0001','TRAINER_ASSIGNMENT_IDEMPOTENCY_MISMATCH','idempotency key cannot target a different template');
SELECT throws_ok($$SELECT * FROM assign_trainer_program('59000000-0000-4000-8000-000000000042','59000000-0000-4000-8000-000000000062',NULL,'second-template')$$,'P0001','TRAINER_ASSIGNMENT_IDEMPOTENCY_MISMATCH','idempotency key cannot target a different recipient');
SELECT is((SELECT count(*)::int FROM trainer_plan_assignments WHERE status='active'),2,'different templates coexist');
SELECT is(jsonb_array_length(get_coach_client_insights('59000000-0000-4000-8000-000000000002',current_date-7,current_date)->'versions'),0,'unselected available routines do not create missed-workout denominators');
SELECT ok((get_coach_clients_summary()->'clients'->0->>'activeAssignmentVersionId') IS NULL,'summary has no arbitrary primary assignment');
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000003',true);
SELECT throws_ok(format('SELECT remove_trainer_assignment(%L)',:'first_plan'),'P0001','PLAN_NOT_FOUND','another client cannot remove plan');
SELECT throws_ok(format('SELECT activate_plan_version(%L)',:'first_plan'),'P0001','PLAN_NOT_FOUND','another client cannot select plan');
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000002',true);
SELECT ok(NOT (SELECT is_active FROM workout_plans WHERE id=:'second_plan'),'assignment never selects itself');
SELECT is((SELECT workout_plan_id FROM accept_trainer_assignment(:'first_assignment','obsolete-accept')),:'first_plan'::uuid,'obsolete acceptance safely returns existing available plan');
SELECT ok((SELECT is_active FROM workout_plans WHERE id='59000000-0000-4000-8000-000000000091'),'obsolete acceptance does not change principal');
SELECT set_config('app.trainer_prescription_mutation','authorized',true);
SELECT set_config('app.plan_lifecycle_actor','59000000-0000-4000-8000-000000000002',true);
SELECT throws_ok(format('UPDATE workout_plans SET name=''forged'' WHERE id=%L',:'first_plan'),'P0001','TRAINER_PRESCRIPTION_LOCKED','forged prescription flag cannot edit professional plan');
SELECT throws_ok(format('UPDATE workout_plans SET is_active=true WHERE id=%L',:'first_plan'),'P0001','TRAINER_PRESCRIPTION_LOCKED','forged lifecycle flag cannot select professional plan directly');
SELECT throws_ok(format('DELETE FROM workout_plans WHERE id=%L',:'first_plan'),'P0001','TRAINER_PRESCRIPTION_LOCKED','raw delete cannot destroy professional history');
SELECT is(activate_plan_version(:'first_plan'),:'first_plan'::uuid,'client selects professional plan');
SELECT is((SELECT count(*)::int FROM workout_plans WHERE is_active),1,'exactly one principal after professional selection');
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
SELECT is(jsonb_array_length(get_coach_client_insights('59000000-0000-4000-8000-000000000002',current_date-7,current_date)->'versions'),1,'selected assignment alone supplies insight schedule');
SELECT is((get_coach_clients_summary()->'clients'->0->>'activeAssignmentVersionId')::uuid,:'first_version'::uuid,'summary primary version follows client selection');
SELECT is(jsonb_array_length(get_coach_clients_summary()->'clients'->0->'adherenceInput'->'versions'),1,'summary excludes unselected assignments from adherence denominator');
SELECT throws_ok(format('SELECT * FROM publish_trainer_assignment_revision(%L,%L,''Duplicate source'',''duplicate-revision'')',:'first_assignment','59000000-0000-4000-8000-000000000062'),'P0001','TRAINER_ASSIGNMENT_TEMPLATE_ALREADY_ASSIGNED','revision cannot collide with another retained template');
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000002',true);
SELECT id AS first_workout FROM workouts WHERE plan_id=:'first_plan' \gset
SELECT authorize_session_start('59000000-0000-4000-8000-000000000095',:'first_workout') AS saved_context \gset
SELECT is(activate_plan_version('59000000-0000-4000-8000-000000000091'),'59000000-0000-4000-8000-000000000091'::uuid,'client can return to personal plan');
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
SELECT assignment_version_id AS revised_version,workout_plan_id AS revised_plan FROM publish_trainer_assignment_revision(:'first_assignment','59000000-0000-4000-8000-000000000061','Future revision','revision-1') \gset
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000002',true);
SELECT ok((SELECT is_active FROM workout_plans WHERE id='59000000-0000-4000-8000-000000000091'),'revision of unselected routine preserves personal choice');
SELECT ok((SELECT superseded_at IS NOT NULL AND NOT is_active FROM workout_plans WHERE id=:'first_plan'),'revision supersedes its own prior version');
SELECT is(authorize_session_start('59000000-0000-4000-8000-000000000095',:'first_workout'),:'saved_context'::jsonb,'authorized session retains original snapshot across revision');
SELECT is(activate_plan_version(:'revised_plan'),:'revised_plan'::uuid,'client selects revised plan');
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
SELECT assignment_version_id AS current_version,workout_plan_id AS current_plan FROM publish_trainer_assignment_revision(:'first_assignment','59000000-0000-4000-8000-000000000061','Selected revision','revision-2') \gset
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000002',true);
SELECT ok((SELECT is_active FROM workout_plans WHERE id=:'current_plan'),'revision transfers own principal choice');
SELECT throws_ok(format('SELECT activate_plan_version(%L)',:'revised_plan'),'P0001','PLAN_VERSION_SUPERSEDED','superseded version cannot be selected');
SELECT is(remove_trainer_assignment(:'first_plan'),:'first_plan'::uuid,'removing any version closes the entire assignment');
SELECT is(remove_trainer_assignment(:'first_plan'),:'first_plan'::uuid,'removal is idempotent');
SELECT is((SELECT status FROM trainer_plan_assignments WHERE id=:'first_assignment'),'cancelled','removal cancels assignment');
SELECT is((SELECT count(*)::int FROM workout_plans WHERE trainer_assignment_id=:'first_assignment' AND retired_at IS NULL),0,'all assignment versions retire');
SELECT is((SELECT count(*)::int FROM trainer_assignment_versions WHERE assignment_id=:'first_assignment'),3,'all versions retained');
SELECT is((SELECT count(*)::int FROM workout_plans WHERE is_active),1,'removal of principal chooses another available plan');
SELECT is(authorize_session_start('59000000-0000-4000-8000-000000000095',:'first_workout'),:'saved_context'::jsonb,'already authorized session remains historical after removal');
SELECT lives_ok(format('SELECT * FROM save_session_log_atomic_v3(''59000000-0000-4000-8000-000000000095'',%L,now(),30,4,%L::jsonb,%L::jsonb)',:'first_workout','[{"exercise_id":"59000000-0000-4000-8000-000000000051","sets_completed":3,"reps_completed":[8,8,8],"weights_kg":[20,20,20],"rpe_values":[7,7,7],"skip_reason":null}]','{"version":1,"prs":[],"progressions":[]}'),'session started before removal can finish with original prescription');
SELECT is((SELECT count(*)::int FROM progress_logs WHERE client_session_id='59000000-0000-4000-8000-000000000095'),1,'completed session retained after assignment removal');
SELECT throws_ok(format('SELECT activate_plan_version(%L)',:'current_plan'),'P0001','PLAN_VERSION_RETIRED','removed plan cannot be reactivated');
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
SELECT is(jsonb_array_length(get_coach_client_insights('59000000-0000-4000-8000-000000000002',current_date-7,current_date)->'sessions'),1,'coach retains removed assignment session evidence while consent is active');
SELECT ok(get_coach_clients_summary()->'clients'->0->>'lastProfessionalEvidenceAt' IS NOT NULL,'summary retains evidence timestamp from removed assignment');
SELECT is((SELECT workout_plan_id FROM assign_trainer_program('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000061',NULL,'legacy-valid')),:'first_plan'::uuid,'old assignment retry returns historical copy without resurrection');
SELECT throws_ok(format('SELECT * FROM publish_trainer_assignment_revision(%L,%L,''forbidden'',''removed-revision'')',:'first_assignment','59000000-0000-4000-8000-000000000061'),'P0001','TRAINER_ASSIGNMENT_NOT_ACTIVE','removed assignment cannot be revised');
SELECT assignment_id AS reassigned,workout_plan_id AS reassigned_plan FROM assign_trainer_program('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000061',NULL,'reassign-new-request') \gset
SELECT isnt(:'reassigned'::uuid,:'first_assignment'::uuid,'fresh request after removal creates a new assignment');
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000002',true);
SELECT throws_ok(format('SELECT * FROM accept_trainer_assignment(%L,''obsolete-retry'')',:'first_assignment'),'P0001','TRAINER_ASSIGNMENT_NOT_AVAILABLE','old acceptance cannot resurrect removed routine');
SELECT activate_plan_version('59000000-0000-4000-8000-000000000091');
RESET ROLE;
RESET SESSION AUTHORIZATION;
UPDATE coaching_relationships SET status='paused_by_platform',paused_at=now() WHERE id='59000000-0000-4000-8000-000000000041';
SELECT is((SELECT count(*)::int FROM trainer_plan_assignments WHERE status='frozen'),2,'pause freezes every retained assignment');
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT is(activate_plan_version(:'second_plan'),:'second_plan'::uuid,'client can use frozen retained routine');
SELECT activate_plan_version('59000000-0000-4000-8000-000000000091');
SELECT * FROM resume_paused_coaching_relationship('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000096');
SELECT is((SELECT count(*)::int FROM trainer_plan_assignments WHERE status='active'),2,'resume restores all retained assignments');
SELECT ok((SELECT is_active FROM workout_plans WHERE id='59000000-0000-4000-8000-000000000091'),'resume preserves principal choice');
SELECT is((SELECT status FROM trainer_plan_assignments WHERE id=:'first_assignment'),'cancelled','resume leaves removed assignment cancelled');
SELECT * FROM end_coaching_relationship('59000000-0000-4000-8000-000000000041',NULL,'59000000-0000-4000-8000-000000000097');
SELECT is((SELECT count(*)::int FROM trainer_plan_assignments WHERE status='frozen'),2,'ending relationship freezes all retained routines');
SELECT ok((SELECT is_active FROM workout_plans WHERE id='59000000-0000-4000-8000-000000000091'),'ending relationship preserves principal choice');
SELECT remove_trainer_assignment(:'second_plan');
SELECT remove_trainer_assignment(:'reassigned_plan');
SELECT retire_plan_family('59000000-0000-4000-8000-000000000091');
SELECT is((SELECT count(*)::int FROM workout_plans WHERE is_active),0,'removing all plans leaves no principal');
RESET ROLE;
RESET SESSION AUTHORIZATION;
-- Restore the fictional relationship solely to exercise independent race requests.
UPDATE coaching_relationships SET status='active',ended_at=NULL,ended_by=NULL,end_reason=NULL WHERE id='59000000-0000-4000-8000-000000000041';
INSERT INTO coaching_consents (relationship_id,scope,text_version,granted_by) VALUES ('59000000-0000-4000-8000-000000000041','training_profile','training-profile-v1','59000000-0000-4000-8000-000000000002');
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
SELECT is((SELECT workout_plan_id FROM assign_trainer_program('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000062',NULL,'second-request')),:'second_plan'::uuid,'alternate deduplicated key remains historical after removal');
SELECT is((SELECT count(*)::int FROM trainer_plan_assignments WHERE status='active'),0,'alternate key retry cannot resurrect cancelled assignment');
SELECT throws_ok('SELECT * FROM private.trainer_assignment_requests','42501',NULL,'authenticated cannot access request ledger');
SELECT workout_plan_id AS last_plan FROM assign_trainer_program('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000062',NULL,'last-plan-request') \gset
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000002',true);
SELECT is((SELECT count(*)::int FROM workout_plans WHERE is_active),0,'first professional library copy still requires explicit selection');
SELECT activate_plan_version(:'last_plan');
SELECT remove_trainer_assignment(:'last_plan');
SELECT is((SELECT count(*)::int FROM workout_plans WHERE is_active),0,'removing the last professional principal leaves no principal');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT * FROM finish();

COMMIT;

-- phase: lifecycle_race_verify
SET search_path=public,extensions;
SELECT no_plan();
SELECT is((SELECT status FROM coaching_relationships WHERE id='RACE_PREFIX-0000-4000-8000-000000000041'),'ended','concurrent relationship transition commits');
SELECT is((SELECT status FROM trainer_plan_assignments WHERE client_user_id='RACE_PREFIX-0000-4000-8000-000000000002'),'cancelled','concurrent removal stays cancelled');
SELECT is((SELECT count(*)::int FROM coaching_consents WHERE relationship_id='RACE_PREFIX-0000-4000-8000-000000000041' AND revoked_at IS NULL),0,'concurrent transition revokes active consent');
SELECT is((SELECT count(*)::int FROM workout_plans WHERE user_id='RACE_PREFIX-0000-4000-8000-000000000002' AND library_slot='professional' AND retired_at IS NULL),0,'concurrent removal retires the professional library copy');
SELECT is((SELECT count(*)::int FROM private.trainer_assignment_requests WHERE trainer_user_id='RACE_PREFIX-0000-4000-8000-000000000001'),1,'ordinary removal retains request history');
SELECT is((SELECT count(*)::int FROM private.trainer_plan_selection_periods WHERE client_user_id='RACE_PREFIX-0000-4000-8000-000000000002' AND ended_at IS NOT NULL),1,'ordinary removal closes and retains selection history');
SELECT * FROM finish();

-- phase: cleanup
BEGIN;
SET search_path=public,extensions;
SELECT no_plan();
UPDATE auth.users SET raw_user_meta_data=jsonb_build_object('e2e_run_id','direct-assignment-cleanup')
WHERE id IN ('59000000-0000-4000-8000-000000000001','59000000-0000-4000-8000-000000000002','59000000-0000-4000-8000-000000000003');
SELECT ok((SELECT count(*)>0 FROM private.trainer_assignment_requests WHERE trainer_user_id='59000000-0000-4000-8000-000000000001'),'cleanup fixture contains assignment requests');
SELECT ok((SELECT count(*)>0 FROM private.trainer_plan_selection_periods WHERE client_user_id='59000000-0000-4000-8000-000000000002'),'cleanup fixture contains selected plan history');
SELECT version.materialized_plan_id AS cleanup_selected_plan
FROM trainer_plan_assignments assignment JOIN trainer_assignment_versions version ON version.id=assignment.active_version_id
WHERE assignment.client_user_id='59000000-0000-4000-8000-000000000002' AND assignment.status='active' \gset
SELECT md5(jsonb_build_array(
  (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM trainer_plan_assignments row WHERE row.trainer_user_id='59200000-0000-4000-8000-000000000001'),
  (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.idempotency_key) FROM private.trainer_assignment_requests row WHERE row.trainer_user_id='59200000-0000-4000-8000-000000000001'),
  (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM private.trainer_plan_selection_periods row WHERE row.client_user_id='59200000-0000-4000-8000-000000000002')
)::text) AS unrelated_fingerprint \gset
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000002',true);
SELECT is(activate_plan_version(:'cleanup_selected_plan'),:'cleanup_selected_plan'::uuid,'cleanup also includes a currently selected professional plan');
SELECT throws_ok($$SELECT cleanup_trainer_security_e2e_fixture('direct-assignment-cleanup',ARRAY['59000000-0000-4000-8000-000000000001'::uuid])$$,'42501',NULL,'authenticated cannot invoke fixture cleanup');
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('request.jwt.claim.sub','',true);
SELECT throws_ok($$SELECT cleanup_trainer_security_e2e_fixture('direct-assignment-cleanup',ARRAY['59000000-0000-4000-8000-000000000001'::uuid,'59200000-0000-4000-8000-000000000001'::uuid])$$,'P0001','TRAINER_SECURITY_CLEANUP_SCOPE_MISMATCH','cleanup rejects unrelated participant mixed into fixture scope');
SELECT is(cleanup_trainer_security_e2e_fixture('direct-assignment-cleanup',ARRAY['59000000-0000-4000-8000-000000000001'::uuid,'59000000-0000-4000-8000-000000000002'::uuid,'59000000-0000-4000-8000-000000000003'::uuid]),3,'cleanup removes exactly the three validated fixture users');
SELECT is(cleanup_trainer_security_e2e_fixture('direct-assignment-cleanup',ARRAY['59000000-0000-4000-8000-000000000001'::uuid,'59000000-0000-4000-8000-000000000002'::uuid,'59000000-0000-4000-8000-000000000003'::uuid]),0,'repeated cleanup succeeds without remaining fixture users');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT is((SELECT count(*)::int FROM private.trainer_assignment_requests WHERE trainer_user_id='59000000-0000-4000-8000-000000000001'),0,'cleanup removes scoped request ledger rows');
SELECT is((SELECT count(*)::int FROM private.trainer_plan_selection_periods WHERE client_user_id='59000000-0000-4000-8000-000000000002'),0,'cleanup removes scoped selection periods');
SELECT is((SELECT count(*)::int FROM trainer_plan_assignments WHERE trainer_user_id='59000000-0000-4000-8000-000000000001'),0,'cleanup removes fixture assignment parents');
SELECT is(md5(jsonb_build_array(
  (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM trainer_plan_assignments row WHERE row.trainer_user_id='59200000-0000-4000-8000-000000000001'),
  (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.idempotency_key) FROM private.trainer_assignment_requests row WHERE row.trainer_user_id='59200000-0000-4000-8000-000000000001'),
  (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM private.trainer_plan_selection_periods row WHERE row.client_user_id='59200000-0000-4000-8000-000000000002')
)::text),:'unrelated_fingerprint','cleanup preserves exact unrelated assignment and private histories');
SELECT is((SELECT count(*)::int FROM auth.users WHERE id IN ('59200000-0000-4000-8000-000000000001','59200000-0000-4000-8000-000000000002','59200000-0000-4000-8000-000000000003')),3,'cleanup preserves all unrelated users');
SELECT * FROM finish();
COMMIT;

-- phase: permissions
BEGIN;
SET search_path=public,extensions;
SELECT no_plan();
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('app.plan_lifecycle_actor','59000000-0000-4000-8000-000000000002',true);
SELECT set_config('app.trainer_prescription_mutation','authorized',true);
SELECT throws_ok($$INSERT INTO workout_plans(user_id,name,days_per_week,source_type,family_id,library_slot) VALUES('59000000-0000-4000-8000-000000000002','Forged',1,'manual',gen_random_uuid(),'personal')$$,'P0001','PLAN_DIRECT_LIFECYCLE_MUTATION_FORBIDDEN','trainer cannot forge authority by setting lifecycle flags');
SELECT throws_ok($$INSERT INTO trainer_plan_assignments(relationship_id,trainer_user_id,client_user_id,status) VALUES('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000001','59000000-0000-4000-8000-000000000002','active')$$,'42501',NULL,'trainer cannot bypass assignment RPC by direct insert');
SELECT assignment_id AS permission_assignment,workout_plan_id AS permission_plan FROM assign_trainer_program('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000062',NULL,'permission-fixture') \gset
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000003',true);
SELECT throws_ok($$SELECT * FROM assign_trainer_program('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000063',NULL,'foreign-trainer')$$,'P0001','COACHING_RELATIONSHIP_NOT_ACTIVE','another user cannot assign to someone else relationship');
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000002',true);
SELECT set_config('app.plan_lifecycle_actor','59000000-0000-4000-8000-000000000002',true);
INSERT INTO workout_plans(user_id,name,days_per_week,source_type,family_id,library_slot) VALUES
('59000000-0000-4000-8000-000000000002','Personal one',1,'manual',gen_random_uuid(),'personal'),
('59000000-0000-4000-8000-000000000002','Personal two',1,'manual',gen_random_uuid(),'personal');
SELECT throws_ok($$INSERT INTO workout_plans(user_id,name,days_per_week,source_type,family_id,library_slot) VALUES('59000000-0000-4000-8000-000000000002','Excess family',1,'manual',gen_random_uuid(),'personal')$$,'P0001','PLAN_FAMILY_LIMIT: free plan family limit reached','personal family limit survives trigger ownership repair');
SELECT is(activate_plan_version(:'permission_plan'),:'permission_plan'::uuid,'professional selection works with full personal library');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','service_role',true);
UPDATE coaching_consents SET revoked_at=now(),revoked_by='59000000-0000-4000-8000-000000000002' WHERE relationship_id='59000000-0000-4000-8000-000000000041' AND revoked_at IS NULL;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT throws_ok(format('SELECT * FROM publish_trainer_assignment_revision(%L,%L,''No consent'',''new-revision'')',:'permission_assignment','59000000-0000-4000-8000-000000000062'),'P0001','TRAINER_ASSIGNMENT_CONSENT_REQUIRED','revoked consent prevents a new revision');
SELECT throws_ok($$SELECT get_coach_client_insights('59000000-0000-4000-8000-000000000002',current_date-7,current_date)$$,'P0001','COACH_CLIENT_INSIGHTS_UNAVAILABLE','revoked consent hides historical professional evidence');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','service_role',true);
UPDATE profiles SET account_status='suspended' WHERE id='59000000-0000-4000-8000-000000000002';
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT throws_ok(format('SELECT activate_plan_version(%L)',:'permission_plan'),'P0001','PLAN_ACCOUNT_INACTIVE','inactive client cannot select a plan');
SELECT throws_ok(format('SELECT remove_trainer_assignment(%L)',:'permission_plan'),'P0001','PLAN_ACCOUNT_INACTIVE','inactive client cannot mutate library');
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
SELECT throws_ok($$SELECT * FROM assign_trainer_program('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000063',NULL,'inactive-client')$$,'P0001','TRAINER_ASSIGNMENT_CLIENT_INACTIVE','inactive client cannot receive new routines');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claim.role','service_role',true);
UPDATE profiles SET account_status='active' WHERE id='59000000-0000-4000-8000-000000000002';
UPDATE trainer_profiles SET status='suspended' WHERE user_id='59000000-0000-4000-8000-000000000001';
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT throws_ok($$SELECT * FROM assign_trainer_program('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000063',NULL,'inactive-trainer')$$,'P0001','TRAINER_ASSIGNMENT_TRAINER_INACTIVE','inactive professional cannot assign routines');
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM assign_trainer_program('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000063',NULL,'anon')$$,'42501',NULL,'anonymous cannot execute direct assignment');
SELECT throws_ok(format('SELECT remove_trainer_assignment(%L)',:'permission_plan'),'42501',NULL,'anonymous cannot execute removal');
RESET ROLE;
RESET SESSION AUTHORIZATION;
ALTER FUNCTION public.assign_trainer_program(uuid,uuid,text,text) SECURITY INVOKER;
SELECT throws_ok('SELECT trainer_security_preflight()','P0001','TRAINER_SECURITY_PREFLIGHT_FAILED','preflight rejects assignment function without trusted execution');
ALTER FUNCTION public.assign_trainer_program(uuid,uuid,text,text) SECURITY DEFINER;
GRANT SELECT ON private.trainer_assignment_requests TO authenticated;
SELECT throws_ok('SELECT trainer_security_preflight()','P0001','TRAINER_SECURITY_PREFLIGHT_FAILED','preflight rejects request ledger exposure');
REVOKE SELECT ON private.trainer_assignment_requests FROM authenticated;
GRANT SELECT ON private.trainer_plan_selection_periods TO authenticated;
SELECT throws_ok('SELECT trainer_security_preflight()','P0001','TRAINER_SECURITY_PREFLIGHT_FAILED','preflight rejects selection ledger exposure');
SELECT * FROM finish();
ROLLBACK;

-- phase: selection
BEGIN;
SET search_path=public,extensions;
SELECT no_plan();
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT assignment_id AS delayed_assignment,assignment_version_id AS delayed_version,workout_plan_id AS delayed_plan FROM assign_trainer_program('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000061',NULL,'delayed-selection') \gset
SELECT assignment_version_id AS other_version,workout_plan_id AS other_plan FROM assign_trainer_program('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000062',NULL,'other-selection') \gset
RESET ROLE;
RESET SESSION AUTHORIZATION;
-- Fictional older availability: assignment precedes first selection by four days.
UPDATE trainer_assignment_versions SET effective_from=now()-interval '4 days' WHERE id=:'delayed_version';
SELECT clock_timestamp() AS selection_boundary \gset
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000002',true);
SELECT activate_plan_version(:'delayed_plan');
SELECT activate_plan_version(:'delayed_plan');
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
SELECT ok((SELECT bool_and((schedule_window->>'effectiveFrom')::timestamptz >= :'selection_boundary'::timestamptz) FROM jsonb_array_elements(get_coach_client_insights('59000000-0000-4000-8000-000000000002',current_date-7,current_date)->'versions') schedule_window WHERE schedule_window->>'id'=:'delayed_version'),'days available before first selection are not prescribed');
SELECT is((SELECT count(*)::int FROM jsonb_array_elements(get_coach_client_insights('59000000-0000-4000-8000-000000000002',current_date-7,current_date)->'versions') schedule_window WHERE schedule_window->>'id'=:'delayed_version'),1,'selecting the same principal is idempotent for schedule history');
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000002',true);
SELECT activate_plan_version(:'other_plan');
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
SELECT ok((SELECT bool_and(schedule_window->>'effectiveTo' IS NOT NULL) FROM jsonb_array_elements(get_coach_client_insights('59000000-0000-4000-8000-000000000002',current_date-7,current_date)->'versions') schedule_window WHERE schedule_window->>'id'=:'delayed_version'),'switching to another retained routine closes previous schedule window');
SELECT ok((SELECT bool_and((schedule_window->>'effectiveFrom')::timestamptz >= :'selection_boundary'::timestamptz) FROM jsonb_array_elements(get_coach_clients_summary()->'clients'->0->'adherenceInput'->'versions') schedule_window WHERE schedule_window->>'id'=:'other_version'),'newly selected routine starts its own schedule window');
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000002',true);
SELECT activate_plan_version(:'delayed_plan');
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
SELECT is((SELECT count(*)::int FROM jsonb_array_elements(get_coach_client_insights('59000000-0000-4000-8000-000000000002',current_date-7,current_date)->'versions') schedule_window WHERE schedule_window->>'id'=:'delayed_version'),2,'reselecting a routine retains distinct schedule windows');
SELECT is((SELECT sum(jsonb_array_length(schedule_window->'workouts'))::int FROM jsonb_array_elements(get_coach_clients_summary()->'clients'->0->'adherenceInput'->'versions') schedule_window WHERE schedule_window->>'id'=:'delayed_version'),1,'multiple windows do not duplicate summary workouts');
SELECT is(jsonb_array_length(get_coach_client_insights('59000000-0000-4000-8000-000000000002',current_date-7,current_date)->'sessions'),1,'historical completed sessions survive subsequent principal switches');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT * FROM finish();
ROLLBACK;

-- phase: race
BEGIN;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT * FROM assign_trainer_program('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000063',NULL,'RACE_KEY');
SELECT pg_sleep(0.2);
COMMIT;

-- phase: race_verify
SET search_path=public,extensions;
SELECT no_plan();
SELECT is((SELECT count(*)::int FROM trainer_plan_assignments WHERE source_template_id='59000000-0000-4000-8000-000000000063' AND status='active'),1,'concurrent distinct requests retain one template copy');
SELECT is((SELECT count(*)::int FROM workout_plans WHERE trainer_assignment_id IN (SELECT id FROM trainer_plan_assignments WHERE source_template_id='59000000-0000-4000-8000-000000000063')),1,'race does not create orphan copies');
SELECT * FROM finish();

-- phase: rerun_verify
SET search_path=public,extensions;
SELECT no_plan();
SELECT is((SELECT count(*)::int FROM trainer_plan_assignments WHERE status='active'),1,'migration rerun preserves retained assignment');
SELECT is((SELECT count(*)::int FROM trainer_assignment_versions WHERE assignment_id=(SELECT id FROM trainer_plan_assignments WHERE proposal_idempotency_key='legacy-valid')),3,'migration rerun retains removed revision history');
SELECT is((SELECT status FROM trainer_plan_assignments WHERE proposal_idempotency_key='legacy-valid'),'cancelled','migration rerun does not resurrect removed assignment');
SELECT is((SELECT count(*)::int FROM session_authorizations WHERE client_session_id='59000000-0000-4000-8000-000000000095'),1,'migration rerun retains authorized session history');
SELECT is((SELECT count(*)::int FROM progress_logs WHERE client_session_id='59000000-0000-4000-8000-000000000095'),1,'migration rerun retains completed session history');
SELECT is((SELECT count(*)::int FROM trainer_plan_assignments WHERE accepted_at IS NOT NULL),0,'no migration or obsolete client call invents acceptance');
SELECT * FROM finish();

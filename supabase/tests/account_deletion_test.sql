-- phase: seed
BEGIN;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
SELECT * FROM public.assign_trainer_program('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000061',NULL,'deletion-client-one');
SELECT * FROM public.assign_trainer_program('59000000-0000-4000-8000-000000000042','59000000-0000-4000-8000-000000000061',NULL,'deletion-client-two');
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000003',true);
SELECT activate_plan_version(id) FROM workout_plans WHERE user_id=auth.uid() AND source_type='trainer_assigned';
RESET ROLE;
RESET SESSION AUTHORIZATION;
INSERT INTO public.progress_logs(user_id,workout_id,duration_minutes,session_result_snapshot)
SELECT user_id,id,30,'{"retained":"completion"}'::jsonb FROM public.workouts WHERE user_id IN ('59000000-0000-4000-8000-000000000002','59000000-0000-4000-8000-000000000003');
INSERT INTO public.exercise_logs(progress_log_id,exercise_id,sets_completed,reps_completed,weights_kg,rpe_values)
SELECT id,'59000000-0000-4000-8000-000000000051',3,ARRAY[8,8,8],ARRAY[20,20,20],ARRAY[6,7,8] FROM public.progress_logs;
INSERT INTO auth.users(id,email) VALUES ('59000000-0000-4000-8000-000000000099','fejames07@gmail.com');
INSERT INTO public.profiles(id) VALUES ('59000000-0000-4000-8000-000000000099');
COMMIT;

-- phase: test
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path=public,extensions;
SELECT no_plan();
SELECT ok(NOT has_function_privilege('anon','public.prepare_verified_account_deletion(uuid)','EXECUTE'),'anon has no deletion privilege');
SELECT ok(NOT has_function_privilege('authenticated','public.prepare_verified_account_deletion(uuid)','EXECUTE'),'authenticated has no deletion privilege');
SELECT ok(has_function_privilege('service_role','public.prepare_verified_account_deletion(uuid)','EXECUTE'),'service role can prepare verified deletion');
SELECT ok((SELECT prosecdef AND proowner='postgres'::regrole AND proconfig=ARRAY['search_path=public, pg_temp'] FROM pg_proc WHERE oid='public.prepare_verified_account_deletion(uuid)'::regprocedure),'RPC uses pinned privileged owner and search path');
SELECT ok(NOT has_table_privilege('authenticated','private.detached_trainer_prescriptions','SELECT,INSERT,UPDATE,DELETE'),'archived snapshots have no direct authenticated access');
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT prepare_verified_account_deletion('59000000-0000-4000-8000-000000000001')$$,'42501','permission denied for function prepare_verified_account_deletion','anon actual call rejected');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT throws_ok($$SELECT prepare_verified_account_deletion('59000000-0000-4000-8000-000000000001')$$,'42501','permission denied for function prepare_verified_account_deletion','authenticated cannot forge service claim to gain execute');
RESET ROLE;
RESET SESSION AUTHORIZATION;
CREATE FUNCTION public.deletion_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'INJECTED_DELETION_FAILURE'; END; $$;
CREATE TRIGGER deletion_test_failure BEFORE DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.deletion_test_failure();
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT throws_ok($$SELECT prepare_verified_account_deletion('59000000-0000-4000-8000-000000000001')$$,'P0001','INJECTED_DELETION_FAILURE','late failure rolls back entire cleanup');
SELECT is((SELECT count(*)::int FROM trainer_plan_assignments),2,'late failure restores assignments');
SELECT is((SELECT count(*)::int FROM private.detached_trainer_prescriptions),0,'late failure restores live prescription identity');
SELECT is((SELECT count(*)::int FROM profiles WHERE id='59000000-0000-4000-8000-000000000001'),1,'late failure preserves target profile');
DROP TRIGGER deletion_test_failure ON public.profiles;
DROP FUNCTION public.deletion_test_failure();
SELECT throws_ok($$SELECT prepare_verified_account_deletion('59000000-0000-4000-8000-000000000099')$$,'P0001','ACCOUNT_DELETION_OWNER_PROTECTED','owner account protected inside privileged boundary');
SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) AS template_before FROM trainer_program_templates x \gset
SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) AS other_plans_before FROM workout_plans x WHERE user_id='59000000-0000-4000-8000-000000000003' \gset
SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) AS audit_before FROM professional_audit_logs x \gset
SAVEPOINT retry;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT lives_ok($$SELECT prepare_verified_account_deletion('59000000-0000-4000-8000-000000000002')$$,'client deletion clears professional dependencies');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT is((SELECT count(*)::int FROM profiles WHERE id='59000000-0000-4000-8000-000000000002'),0,'client profile removed before Auth deletion');
SELECT is((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM trainer_program_templates x),:'template_before'::jsonb,'client deletion retains trainer templates exactly');
SELECT is((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM workout_plans x WHERE user_id='59000000-0000-4000-8000-000000000003'),:'other_plans_before'::jsonb,'client deletion preserves other client plans exactly');
SELECT is((SELECT count(*)::int FROM private.trainer_assignment_requests r JOIN trainer_plan_assignments a ON a.id=r.assignment_id WHERE a.client_user_id='59000000-0000-4000-8000-000000000002'),0,'client private assignment requests removed');
SELECT is((SELECT count(*)::int FROM progress_logs WHERE user_id='59000000-0000-4000-8000-000000000002'),0,'client progress removed');
SELECT lives_ok($$DELETE FROM auth.users WHERE id='59000000-0000-4000-8000-000000000002'$$,'client Auth delete now succeeds');
ROLLBACK TO retry;
SELECT is((SELECT count(*)::int FROM profiles WHERE id='59000000-0000-4000-8000-000000000002'),1,'rollback restores complete client profile');
SELECT is((SELECT count(*)::int FROM trainer_plan_assignments),2,'rollback restores both assignments');
SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) AS history_before FROM progress_logs x \gset
SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) AS workout_before FROM workouts x \gset
SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) AS prescription_before FROM workout_exercises x \gset
SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) AS sets_before FROM exercise_logs x \gset
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT lives_ok($$SELECT prepare_verified_account_deletion('59000000-0000-4000-8000-000000000001')$$,'trainer deletion detaches every client prescription');
SELECT lives_ok($$SELECT prepare_verified_account_deletion('59000000-0000-4000-8000-000000000001')$$,'retry after partial external deletion is idempotent');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT is((SELECT count(*)::int FROM workout_plans WHERE source_type='trainer_assigned' AND trainer_detached_at IS NOT NULL AND retired_at IS NOT NULL AND NOT is_active AND prescription_locked AND library_slot='professional' AND trainer_assignment_id IS NULL AND trainer_assignment_version_id IS NULL AND trainer_relationship_id IS NULL),2,'both client copies explicitly archived, detached, locked');
SELECT is((SELECT count(*)::int FROM private.detached_trainer_prescriptions),2,'both immutable snapshots retained separately');
SELECT is((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM progress_logs x),:'history_before'::jsonb,'all counterpart completion history remains byte-for-byte');
SELECT is((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM workouts x),:'workout_before'::jsonb,'all counterpart workouts remain byte-for-byte');
SELECT is((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM workout_exercises x),:'prescription_before'::jsonb,'all counterpart prescriptions remain byte-for-byte');
SELECT is((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM exercise_logs x),:'sets_before'::jsonb,'all counterpart set logs remain byte-for-byte');
SELECT is((SELECT count(*)::int FROM private.trainer_plan_selection_periods WHERE ended_at IS NOT NULL),1,'active professional selection closes when archived');
SELECT is((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM professional_audit_logs x),:'audit_before'::jsonb,'immutable professional audit retained explicitly');
SELECT is((SELECT count(*)::int FROM trainer_plan_assignments),0,'removed trainer has no live assignments');
SELECT is((SELECT count(*)::int FROM coaching_relationships),0,'removed trainer has no live relationships');
SELECT lives_ok($$DELETE FROM auth.users WHERE id='59000000-0000-4000-8000-000000000001'$$,'trainer Auth delete now succeeds');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT set_config('app.trainer_prescription_mutation','authorized',true);
SELECT throws_ok($$UPDATE workout_plans SET trainer_detached_at=NULL WHERE source_type='trainer_assigned'$$,'P0001','TRAINER_ASSIGNED_PLAN_IDENTITY_INVALID','null live references require explicit detached marker even for privileged mutation');
SELECT throws_ok($$UPDATE workout_plans SET is_active=true WHERE source_type='trainer_assigned'$$,'P0001','PLAN_VERSION_UNAVAILABLE','detached copy cannot be reactivated even through privileged lifecycle mutation');
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000003',true);
SELECT throws_ok($$UPDATE workout_plans SET prescription_locked=false WHERE user_id=auth.uid() AND source_type='trainer_assigned'$$,'P0001','TRAINER_PRESCRIPTION_LOCKED','detached prescription cannot be unlocked by client');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT lives_ok($$SELECT prepare_verified_account_deletion('59000000-0000-4000-8000-000000000002')$$,'later client deletion removes its detached copy');
SELECT is((SELECT count(*)::int FROM private.detached_trainer_prescriptions),1,'later client deletion retains only the other client snapshot');
SELECT is((SELECT count(*)::int FROM progress_logs WHERE user_id='59000000-0000-4000-8000-000000000003'),1,'later client deletion retains other client history');
SELECT lives_ok($$DELETE FROM auth.users WHERE id='59000000-0000-4000-8000-000000000002'$$,'later client Auth deletion succeeds');
SELECT lives_ok($$SELECT prepare_verified_account_deletion('59000000-0000-4000-8000-000000000002')$$,'retry after Auth deletion succeeds');
SELECT * FROM finish();
ROLLBACK;

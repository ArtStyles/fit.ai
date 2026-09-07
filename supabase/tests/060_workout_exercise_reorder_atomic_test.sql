BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(20);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('60000000-0000-4000-8000-000000000001', 'adjustment-owner@example.test', '{}'::jsonb),
  ('60000000-0000-4000-8000-000000000002', 'adjustment-outsider@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id, avatar_url, onboarding_done, account_status) VALUES
  ('60000000-0000-4000-8000-000000000001', 'https://example.test/adjustment-owner.webp', TRUE, 'active'),
  ('60000000-0000-4000-8000-000000000002', 'https://example.test/adjustment-outsider.webp', TRUE, 'active');
INSERT INTO public.exercises (id, name, is_public) VALUES
  ('60000000-0000-4000-8000-000000000011', 'Atomic squat', TRUE),
  ('60000000-0000-4000-8000-000000000012', 'Atomic press', TRUE),
  ('60000000-0000-4000-8000-000000000013', 'Atomic row', TRUE);
INSERT INTO public.workout_plans (
  id, user_id, name, is_active, source_type, plan_context, prescription_locked
) VALUES
  ('60000000-0000-4000-8000-000000000021', '60000000-0000-4000-8000-000000000001', 'Editable atomic plan', TRUE, 'manual', 'first_plan', FALSE),
  ('60000000-0000-4000-8000-000000000023', '60000000-0000-4000-8000-000000000001', 'Inactive atomic plan', FALSE, 'manual', 'first_plan', FALSE);
INSERT INTO public.workouts (id, plan_id, user_id, name, day_of_week, order_in_plan) VALUES
  ('60000000-0000-4000-8000-000000000031', '60000000-0000-4000-8000-000000000021', '60000000-0000-4000-8000-000000000001', 'Editable workout', 1, 1),
  ('60000000-0000-4000-8000-000000000033', '60000000-0000-4000-8000-000000000023', '60000000-0000-4000-8000-000000000001', 'Inactive workout', 3, 1);
INSERT INTO public.workout_exercises (
  id, workout_id, exercise_id, order_index, sets, reps, target_rpe, rest_seconds
) VALUES
  ('60000000-0000-4000-8000-000000000041', '60000000-0000-4000-8000-000000000031', '60000000-0000-4000-8000-000000000011', 1, 3, 10, 7, 60),
  ('60000000-0000-4000-8000-000000000042', '60000000-0000-4000-8000-000000000031', '60000000-0000-4000-8000-000000000012', 2, 3, 10, 7, 60),
  ('60000000-0000-4000-8000-000000000043', '60000000-0000-4000-8000-000000000031', '60000000-0000-4000-8000-000000000013', 3, 3, 10, 7, 60),
  ('60000000-0000-4000-8000-000000000045', '60000000-0000-4000-8000-000000000033', '60000000-0000-4000-8000-000000000011', 1, 3, 10, 7, 60);
SELECT set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok($$SELECT public.reorder_workout_exercises_atomic('60000000-0000-4000-8000-000000000021', '60000000-0000-4000-8000-000000000031', ARRAY['60000000-0000-4000-8000-000000000041','60000000-0000-4000-8000-000000000041','60000000-0000-4000-8000-000000000043']::uuid[])$$, 'WORKOUT_REORDER_INVALID_PERMUTATION', 'duplicate rejects unchanged');
SELECT throws_ok($$SELECT public.reorder_workout_exercises_atomic('60000000-0000-4000-8000-000000000021', '60000000-0000-4000-8000-000000000031', ARRAY['60000000-0000-4000-8000-000000000041','60000000-0000-4000-8000-000000000042']::uuid[])$$, 'WORKOUT_REORDER_INVALID_PERMUTATION', 'omitted rejects unchanged');
SELECT throws_ok($$SELECT public.reorder_workout_exercises_atomic('60000000-0000-4000-8000-000000000021', '60000000-0000-4000-8000-000000000031', ARRAY['60000000-0000-4000-8000-000000000041','60000000-0000-4000-8000-000000000042','60000000-0000-4000-8000-000000000045']::uuid[])$$, 'WORKOUT_REORDER_INVALID_PERMUTATION', 'foreign rejects unchanged');
SELECT throws_ok($$SELECT public.reorder_workout_exercises_atomic('60000000-0000-4000-8000-000000000021', '60000000-0000-4000-8000-000000000031', ARRAY['60000000-0000-4000-8000-000000000041','60000000-0000-4000-8000-000000000042','60000000-0000-4000-8000-000000000043','60000000-0000-4000-8000-000000000045']::uuid[])$$, 'WORKOUT_REORDER_INVALID_PERMUTATION', 'extra rejects unchanged');
SELECT throws_ok($$SELECT public.reorder_workout_exercises_atomic('60000000-0000-4000-8000-000000000021', '60000000-0000-4000-8000-000000000031', NULL::uuid[])$$, 'WORKOUT_REORDER_INVALID_PERMUTATION', 'null array rejects unchanged');
SELECT throws_ok($$SELECT public.reorder_workout_exercises_atomic('60000000-0000-4000-8000-000000000021', '60000000-0000-4000-8000-000000000031', ARRAY['60000000-0000-4000-8000-000000000041','60000000-0000-4000-8000-000000000042',NULL]::uuid[])$$, 'WORKOUT_REORDER_INVALID_PERMUTATION', 'null member rejects unchanged');
SELECT throws_ok($$SELECT public.reorder_workout_exercises_atomic('60000000-0000-4000-8000-000000000021', '60000000-0000-4000-8000-000000000031', ARRAY[]::uuid[])$$, 'WORKOUT_REORDER_INVALID_PERMUTATION', 'empty rejects unchanged');
SELECT throws_ok($$SELECT public.reorder_workout_exercises_atomic('60000000-0000-4000-8000-000000000021', '60000000-0000-4000-8000-000000000031', ARRAY[['60000000-0000-4000-8000-000000000041','60000000-0000-4000-8000-000000000042','60000000-0000-4000-8000-000000000043']]::uuid[])$$, 'WORKOUT_REORDER_INVALID_PERMUTATION', 'multidimensional rejects unchanged');
SELECT results_eq($$SELECT order_index FROM workout_exercises WHERE workout_id = '60000000-0000-4000-8000-000000000031' ORDER BY id$$, $$VALUES (1),(2),(3)$$, 'all invalid requests preserve positions');
SELECT is(public.reorder_workout_exercises_atomic('60000000-0000-4000-8000-000000000021', '60000000-0000-4000-8000-000000000031', ARRAY['60000000-0000-4000-8000-000000000043','60000000-0000-4000-8000-000000000041','60000000-0000-4000-8000-000000000042']::uuid[]), 3, 'complete permutation succeeds');
SELECT results_eq($$SELECT order_index FROM workout_exercises WHERE workout_id = '60000000-0000-4000-8000-000000000031' ORDER BY id$$, $$VALUES (2),(3),(1)$$, 'valid permutation stores exact one-based ordering');
SELECT is((SELECT plan_context FROM workout_plans WHERE id='60000000-0000-4000-8000-000000000021'), 'manual_update', 'transaction touches plan');
SELECT throws_ok($$SELECT public.reorder_workout_exercises_atomic('60000000-0000-4000-8000-000000000023', '60000000-0000-4000-8000-000000000031', ARRAY['60000000-0000-4000-8000-000000000043','60000000-0000-4000-8000-000000000041','60000000-0000-4000-8000-000000000042']::uuid[])$$, 'WORKOUT_REORDER_NOT_EDITABLE', 'wrong parent rejected');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.reorder_workout_exercises_atomic('60000000-0000-4000-8000-000000000021', '60000000-0000-4000-8000-000000000031', ARRAY['60000000-0000-4000-8000-000000000043','60000000-0000-4000-8000-000000000041','60000000-0000-4000-8000-000000000042']::uuid[])$$, 'WORKOUT_REORDER_NOT_EDITABLE', 'other owner cannot reorder directly');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.reorder_workout_exercises_atomic('60000000-0000-4000-8000-000000000021', '60000000-0000-4000-8000-000000000031', ARRAY['60000000-0000-4000-8000-000000000043','60000000-0000-4000-8000-000000000041','60000000-0000-4000-8000-000000000042']::uuid[])$$, 'WORKOUT_REORDER_NOT_AUTHENTICATED', 'missing user rejected');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',true);
UPDATE workout_plans SET plan_context='first_plan', manually_updated_at=NULL WHERE id='60000000-0000-4000-8000-000000000021';
CREATE FUNCTION public.fail_reorder_plan_touch_test() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
IF NEW.id='60000000-0000-4000-8000-000000000021'::uuid THEN RAISE EXCEPTION 'FORCED_REORDER_FAILURE'; END IF;
RETURN NEW; END$$;
CREATE TRIGGER fail_reorder_plan_touch_test BEFORE UPDATE ON workout_plans FOR EACH ROW EXECUTE FUNCTION public.fail_reorder_plan_touch_test();
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.reorder_workout_exercises_atomic('60000000-0000-4000-8000-000000000021', '60000000-0000-4000-8000-000000000031', ARRAY['60000000-0000-4000-8000-000000000041','60000000-0000-4000-8000-000000000042','60000000-0000-4000-8000-000000000043']::uuid[])$$, 'FORCED_REORDER_FAILURE', 'failure after exercise writes rolls back transaction');
SELECT results_eq($$SELECT order_index FROM workout_exercises WHERE workout_id = '60000000-0000-4000-8000-000000000031' ORDER BY id$$, $$VALUES (2),(3),(1)$$, 'failure rolls back every position');
SELECT is((SELECT manually_updated_at FROM workout_plans WHERE id='60000000-0000-4000-8000-000000000021'), NULL::timestamptz, 'failure preserves plan timestamp');
RESET ROLE;
DROP TRIGGER fail_reorder_plan_touch_test ON workout_plans;
SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM workouts WHERE id='f4700000-0000-4000-8000-000000000101'),true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.reorder_workout_exercises_atomic((SELECT plan_id FROM workouts WHERE id='f4700000-0000-4000-8000-000000000101'),'f4700000-0000-4000-8000-000000000101',ARRAY[]::uuid[])$$, 'WORKOUT_REORDER_NOT_EDITABLE', 'professional prescription rejected directly');
RESET ROLE;
SELECT ok(NOT has_function_privilege('anon','public.reorder_workout_exercises_atomic(uuid,uuid,uuid[])','EXECUTE'), 'anonymous role cannot call RPC');
SELECT * FROM finish();
ROLLBACK;

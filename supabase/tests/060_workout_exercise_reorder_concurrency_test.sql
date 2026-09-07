

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;


INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('61000000-0000-4000-8000-000000000001', 'adjustment-owner@example.test', '{}'::jsonb),
  ('61000000-0000-4000-8000-000000000002', 'adjustment-outsider@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id, avatar_url, onboarding_done, account_status) VALUES
  ('61000000-0000-4000-8000-000000000001', 'https://example.test/adjustment-owner.webp', TRUE, 'active'),
  ('61000000-0000-4000-8000-000000000002', 'https://example.test/adjustment-outsider.webp', TRUE, 'active');
INSERT INTO public.exercises (id, name, is_public) VALUES
  ('61000000-0000-4000-8000-000000000011', 'Atomic squat', TRUE),
  ('61000000-0000-4000-8000-000000000012', 'Atomic press', TRUE),
  ('61000000-0000-4000-8000-000000000013', 'Atomic row', TRUE);
INSERT INTO public.workout_plans (
  id, user_id, name, is_active, source_type, plan_context, prescription_locked
) VALUES
  ('61000000-0000-4000-8000-000000000021', '61000000-0000-4000-8000-000000000001', 'Editable atomic plan', TRUE, 'manual', 'first_plan', FALSE),
  ('61000000-0000-4000-8000-000000000023', '61000000-0000-4000-8000-000000000001', 'Inactive atomic plan', FALSE, 'manual', 'first_plan', FALSE);
INSERT INTO public.workouts (id, plan_id, user_id, name, day_of_week, order_in_plan) VALUES
  ('61000000-0000-4000-8000-000000000031', '61000000-0000-4000-8000-000000000021', '61000000-0000-4000-8000-000000000001', 'Editable workout', 1, 1),
  ('61000000-0000-4000-8000-000000000033', '61000000-0000-4000-8000-000000000023', '61000000-0000-4000-8000-000000000001', 'Inactive workout', 3, 1);
INSERT INTO public.workout_exercises (
  id, workout_id, exercise_id, order_index, sets, reps, target_rpe, rest_seconds
) VALUES
  ('61000000-0000-4000-8000-000000000041', '61000000-0000-4000-8000-000000000031', '61000000-0000-4000-8000-000000000011', 1, 3, 10, 7, 60),
  ('61000000-0000-4000-8000-000000000042', '61000000-0000-4000-8000-000000000031', '61000000-0000-4000-8000-000000000012', 2, 3, 10, 7, 60),
  ('61000000-0000-4000-8000-000000000043', '61000000-0000-4000-8000-000000000031', '61000000-0000-4000-8000-000000000013', 3, 3, 10, 7, 60),
  ('61000000-0000-4000-8000-000000000045', '61000000-0000-4000-8000-000000000033', '61000000-0000-4000-8000-000000000011', 1, 3, 10, 7, 60);

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SELECT plan(4);
SELECT dblink_connect('reorder_a','dbname=postgres user=supabase_admin');
SELECT dblink_connect('reorder_b','dbname=postgres user=supabase_admin application_name=reorder_b');
SELECT dblink_exec('reorder_a','BEGIN');
SELECT dblink_exec('reorder_a', $$SET request.jwt.claim.sub='61000000-0000-4000-8000-000000000001'$$);
SELECT dblink_exec('reorder_a','SET ROLE authenticated');
SELECT dblink_exec('reorder_b', $$SET request.jwt.claim.sub='61000000-0000-4000-8000-000000000001'$$);
SELECT dblink_exec('reorder_b','SET ROLE authenticated');
SELECT is((SELECT n FROM dblink('reorder_a',$$SELECT public.reorder_workout_exercises_atomic('61000000-0000-4000-8000-000000000021','61000000-0000-4000-8000-000000000031',ARRAY['61000000-0000-4000-8000-000000000043','61000000-0000-4000-8000-000000000041','61000000-0000-4000-8000-000000000042']::uuid[])$$) AS t(n integer)),3,'first transaction writes complete permutation');
SELECT dblink_send_query('reorder_b',$$SELECT public.reorder_workout_exercises_atomic('61000000-0000-4000-8000-000000000021','61000000-0000-4000-8000-000000000031',ARRAY['61000000-0000-4000-8000-000000000042','61000000-0000-4000-8000-000000000043','61000000-0000-4000-8000-000000000041']::uuid[])$$);
DO $$DECLARE deadline timestamptz := clock_timestamp()+interval '5 seconds'; BEGIN
  LOOP
    EXIT WHEN EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name='reorder_b' AND wait_event_type='Lock');
    IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'second reorder did not wait for transaction lock'; END IF;
    PERFORM pg_sleep(0.05);
  END LOOP;
END$$;
SELECT ok(EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='reorder_b' AND wait_event_type='Lock'),'second reorder waits for first transaction');
SELECT dblink_exec('reorder_a','COMMIT');
SELECT is((SELECT n FROM dblink_get_result('reorder_b') AS t(n integer)),3,'second complete permutation succeeds after first commit');
SELECT results_eq($$SELECT order_index FROM workout_exercises WHERE workout_id='61000000-0000-4000-8000-000000000031' ORDER BY id$$,$$VALUES (3),(1),(2)$$,'concurrent reorders leave exactly the second complete permutation');
SELECT dblink_disconnect('reorder_a');
SELECT dblink_disconnect('reorder_b');
SELECT * FROM finish();
DELETE FROM workout_exercises WHERE workout_id IN (SELECT id FROM workouts WHERE user_id='61000000-0000-4000-8000-000000000001');
DELETE FROM workouts WHERE user_id='61000000-0000-4000-8000-000000000001';
DELETE FROM workout_plans WHERE user_id='61000000-0000-4000-8000-000000000001';
DELETE FROM auth.users WHERE id IN ('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002');
DELETE FROM exercises WHERE id IN ('61000000-0000-4000-8000-000000000011','61000000-0000-4000-8000-000000000012','61000000-0000-4000-8000-000000000013');

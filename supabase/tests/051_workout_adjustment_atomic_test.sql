BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(25);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('51000000-0000-4000-8000-000000000001', 'adjustment-owner@example.test', '{}'::jsonb),
  ('51000000-0000-4000-8000-000000000002', 'adjustment-outsider@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id, avatar_url, onboarding_done, account_status) VALUES
  ('51000000-0000-4000-8000-000000000001', 'https://example.test/adjustment-owner.webp', TRUE, 'active'),
  ('51000000-0000-4000-8000-000000000002', 'https://example.test/adjustment-outsider.webp', TRUE, 'active');
INSERT INTO public.exercises (id, name, is_public) VALUES
  ('51000000-0000-4000-8000-000000000011', 'Atomic squat', TRUE),
  ('51000000-0000-4000-8000-000000000012', 'Atomic press', TRUE),
  ('51000000-0000-4000-8000-000000000013', 'Atomic row', TRUE);
INSERT INTO public.workout_plans (
  id, user_id, name, is_active, source_type, plan_context, prescription_locked
) VALUES
  ('51000000-0000-4000-8000-000000000021', '51000000-0000-4000-8000-000000000001', 'Editable atomic plan', TRUE, 'manual', 'first_plan', FALSE),
  ('51000000-0000-4000-8000-000000000023', '51000000-0000-4000-8000-000000000001', 'Inactive atomic plan', FALSE, 'manual', 'first_plan', FALSE);
INSERT INTO public.workouts (id, plan_id, user_id, name, day_of_week, order_in_plan) VALUES
  ('51000000-0000-4000-8000-000000000031', '51000000-0000-4000-8000-000000000021', '51000000-0000-4000-8000-000000000001', 'Editable workout', 1, 1),
  ('51000000-0000-4000-8000-000000000033', '51000000-0000-4000-8000-000000000023', '51000000-0000-4000-8000-000000000001', 'Inactive workout', 3, 1);
INSERT INTO public.workout_exercises (
  id, workout_id, exercise_id, order_index, sets, reps, target_rpe, rest_seconds
) VALUES
  ('51000000-0000-4000-8000-000000000041', '51000000-0000-4000-8000-000000000031', '51000000-0000-4000-8000-000000000011', 1, 3, 10, 7, 60),
  ('51000000-0000-4000-8000-000000000042', '51000000-0000-4000-8000-000000000031', '51000000-0000-4000-8000-000000000012', 2, 3, 10, 7, 60),
  ('51000000-0000-4000-8000-000000000043', '51000000-0000-4000-8000-000000000031', '51000000-0000-4000-8000-000000000013', 3, 3, 10, 7, 60),
  ('51000000-0000-4000-8000-000000000045', '51000000-0000-4000-8000-000000000033', '51000000-0000-4000-8000-000000000011', 1, 3, 10, 7, 60);
SELECT set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT is(
  public.apply_workout_adjustment_atomic(
    '51000000-0000-4000-8000-000000000031',
    '[
      {"type":"update_exercise","workoutExerciseId":"51000000-0000-4000-8000-000000000041","sets":5,"restSeconds":90},
      {"type":"remove_exercise","workoutExerciseId":"51000000-0000-4000-8000-000000000042"}
    ]'::jsonb
  ),
  2,
  'owner applies every validated adjustment in one RPC'
);
SELECT is((SELECT sets FROM public.workout_exercises WHERE id = '51000000-0000-4000-8000-000000000041'), 5, 'atomic adjustment updates sets');
SELECT is((SELECT rest_seconds FROM public.workout_exercises WHERE id = '51000000-0000-4000-8000-000000000041'), 90, 'atomic adjustment updates rest');
SELECT is((SELECT count(*) FROM public.workout_exercises WHERE id = '51000000-0000-4000-8000-000000000042'), 0::bigint, 'atomic adjustment removes the requested exercise');
SELECT results_eq(
  $$SELECT order_index FROM public.workout_exercises WHERE workout_id = '51000000-0000-4000-8000-000000000031' ORDER BY order_index$$,
  $$VALUES (1), (2)$$,
  'remaining exercises are compacted to a one-based order'
);
SELECT is((SELECT plan_context FROM public.workout_plans WHERE id = '51000000-0000-4000-8000-000000000021'), 'manual_update', 'parent plan is marked as manually updated');
SELECT isnt((SELECT manually_updated_at FROM public.workout_plans WHERE id = '51000000-0000-4000-8000-000000000021'), NULL::timestamptz, 'parent plan records the manual update time');

SELECT throws_ok(
  $$SELECT public.apply_workout_adjustment_atomic(
    '51000000-0000-4000-8000-000000000031',
    '[{"type":"update_exercise","workoutExerciseId":"51000000-0000-4000-8000-000000000041","sets":6},{"type":"remove_exercise","workoutExerciseId":"51000000-0000-4000-8000-000000000099"}]'::jsonb
  )$$,
  'WORKOUT_ADJUSTMENT_UNKNOWN_EXERCISE',
  'unknown exercise rejects the complete payload'
);
SELECT is((SELECT sets FROM public.workout_exercises WHERE id = '51000000-0000-4000-8000-000000000041'), 5, 'preflight rejects before changing an earlier valid row');
SELECT throws_ok(
  $$SELECT public.apply_workout_adjustment_atomic(
    '51000000-0000-4000-8000-000000000031',
    '[{"type":"update_exercise","workoutExerciseId":"51000000-0000-4000-8000-000000000041","sets":6},{"type":"update_exercise","workoutExerciseId":"51000000-0000-4000-8000-000000000041","reps":12}]'::jsonb
  )$$,
  'WORKOUT_ADJUSTMENT_DUPLICATE_EXERCISE',
  'duplicate exercise changes are rejected'
);
SELECT throws_ok(
  $$SELECT public.apply_workout_adjustment_atomic(
    '51000000-0000-4000-8000-000000000031',
    '[{"type":"update_exercise","workoutExerciseId":"51000000-0000-4000-8000-000000000041","restSeconds":14}]'::jsonb
  )$$,
  'WORKOUT_ADJUSTMENT_INVALID_VALUE',
  'out-of-range values are rejected by the database boundary'
);
SELECT throws_ok(
  $$SELECT public.apply_workout_adjustment_atomic(
    '51000000-0000-4000-8000-000000000031',
    '[{"type":"remove_exercise","workoutExerciseId":"51000000-0000-4000-8000-000000000041"},{"type":"remove_exercise","workoutExerciseId":"51000000-0000-4000-8000-000000000043"}]'::jsonb
  )$$,
  'WORKOUT_ADJUSTMENT_EMPTY_WORKOUT',
  'removing every remaining exercise is rejected'
);
SELECT is((SELECT count(*) FROM public.workout_exercises WHERE workout_id = '51000000-0000-4000-8000-000000000031'), 2::bigint, 'empty-workout rejection preserves every row');

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000002', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.apply_workout_adjustment_atomic(
    '51000000-0000-4000-8000-000000000031',
    '[{"type":"update_exercise","workoutExerciseId":"51000000-0000-4000-8000-000000000041","sets":9}]'::jsonb
  )$$,
  'WORKOUT_ADJUSTMENT_NOT_EDITABLE',
  'another user cannot adjust the workout'
);
SELECT is((SELECT count(*) FROM public.workout_exercises WHERE workout_id = '51000000-0000-4000-8000-000000000031'), 0::bigint, 'RLS still hides owner rows from the outsider');

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', TRUE);
SELECT set_config('app.trainer_prescription_mutation', 'authorized', TRUE);
UPDATE public.workout_plans
SET is_active = TRUE
WHERE id = 'f4700000-0000-4000-8000-000000000091';
SELECT ok(
  (SELECT is_active AND prescription_locked FROM public.workout_plans WHERE id = 'f4700000-0000-4000-8000-000000000091'),
  'locked-plan fixture is active so only the prescription lock rejects editing'
);
SELECT set_config('request.jwt.claim.sub', 'f4700000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.apply_workout_adjustment_atomic(
    'f4700000-0000-4000-8000-000000000101',
    '[]'::jsonb
  )$$,
  'WORKOUT_ADJUSTMENT_NOT_EDITABLE',
  'prescription-locked plans cannot be adjusted'
);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.apply_workout_adjustment_atomic(
    '51000000-0000-4000-8000-000000000033',
    '[{"type":"update_exercise","workoutExerciseId":"51000000-0000-4000-8000-000000000045","sets":4}]'::jsonb
  )$$,
  'WORKOUT_ADJUSTMENT_NOT_EDITABLE',
  'inactive plans cannot be adjusted'
);

RESET ROLE;
UPDATE public.workout_plans
SET plan_context = 'first_plan', manually_updated_at = NULL
WHERE id = '51000000-0000-4000-8000-000000000021';
CREATE OR REPLACE FUNCTION public.fail_second_atomic_adjustment_for_test()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id = '51000000-0000-4000-8000-000000000043'::uuid THEN
    RAISE EXCEPTION 'FORCED_INTERMEDIATE_ADJUSTMENT_FAILURE';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_fail_second_atomic_adjustment_for_test
  BEFORE UPDATE ON public.workout_exercises
  FOR EACH ROW EXECUTE FUNCTION public.fail_second_atomic_adjustment_for_test();
SELECT set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.apply_workout_adjustment_atomic(
    '51000000-0000-4000-8000-000000000031',
    '[{"type":"update_exercise","workoutExerciseId":"51000000-0000-4000-8000-000000000041","sets":7},{"type":"update_exercise","workoutExerciseId":"51000000-0000-4000-8000-000000000043","reps":12}]'::jsonb
  )$$,
  'FORCED_INTERMEDIATE_ADJUSTMENT_FAILURE',
  'a failure after the first write aborts the complete RPC'
);
SELECT is((SELECT sets FROM public.workout_exercises WHERE id = '51000000-0000-4000-8000-000000000041'), 5, 'forced intermediate failure rolls back the first row update');
SELECT is((SELECT reps FROM public.workout_exercises WHERE id = '51000000-0000-4000-8000-000000000043'), 10, 'forced intermediate failure preserves the failing row');
SELECT is((SELECT plan_context FROM public.workout_plans WHERE id = '51000000-0000-4000-8000-000000000021'), 'first_plan', 'forced intermediate failure preserves plan context');
SELECT is((SELECT manually_updated_at FROM public.workout_plans WHERE id = '51000000-0000-4000-8000-000000000021'), NULL::timestamptz, 'forced intermediate failure preserves plan timestamp');
SELECT results_eq(
  $$SELECT order_index FROM public.workout_exercises WHERE workout_id = '51000000-0000-4000-8000-000000000031' ORDER BY order_index$$,
  $$VALUES (1), (2)$$,
  'forced intermediate failure preserves compact ordering'
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT throws_ok(
  $$SELECT public.apply_workout_adjustment_atomic('51000000-0000-4000-8000-000000000031', '[]'::jsonb)$$,
  '42501',
  NULL,
  'anonymous callers cannot execute the adjustment RPC'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;

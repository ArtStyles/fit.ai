BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(23);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('56000000-0000-4000-8000-000000000001', 'batch-owner@example.test', '{}'::JSONB),
  ('56000000-0000-4000-8000-000000000002', 'batch-outsider@example.test', '{}'::JSONB),
  ('56000000-0000-4000-8000-000000000003', 'batch-suspended@example.test', '{}'::JSONB),
  ('56000000-0000-4000-8000-000000000004', 'batch-inactive-trainer@example.test', '{}'::JSONB);

INSERT INTO public.profiles (id, full_name, onboarding_done, account_status) VALUES
  ('56000000-0000-4000-8000-000000000001', 'Batch owner', TRUE, 'active'),
  ('56000000-0000-4000-8000-000000000002', 'Batch outsider', TRUE, 'active'),
  ('56000000-0000-4000-8000-000000000003', 'Batch suspended owner', TRUE, 'suspended'),
  ('56000000-0000-4000-8000-000000000004', 'Batch inactive trainer', TRUE, 'active');

INSERT INTO public.trainer_applications (id, user_id, status, decided_at) VALUES
  ('56000000-0000-4000-8000-000000000011', '56000000-0000-4000-8000-000000000001', 'approved', NOW()),
  ('56000000-0000-4000-8000-000000000013', '56000000-0000-4000-8000-000000000003', 'approved', NOW()),
  ('56000000-0000-4000-8000-000000000014', '56000000-0000-4000-8000-000000000004', 'approved', NOW());

INSERT INTO public.trainer_profiles (
  id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary
) VALUES
  ('56000000-0000-4000-8000-000000000021', '56000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000011', 'batch-owner', 'active', 'Batch owner', 'Bio', 'Evidence'),
  ('56000000-0000-4000-8000-000000000023', '56000000-0000-4000-8000-000000000003', '56000000-0000-4000-8000-000000000013', 'batch-suspended', 'active', 'Batch suspended owner', 'Bio', 'Evidence'),
  ('56000000-0000-4000-8000-000000000024', '56000000-0000-4000-8000-000000000004', '56000000-0000-4000-8000-000000000014', 'batch-inactive-trainer', 'inactive', 'Batch inactive trainer', 'Bio', 'Evidence');

INSERT INTO public.exercises (id, name, is_public) VALUES
  ('56000000-0000-4000-8000-000000000051', 'Batch exercise one', TRUE),
  ('56000000-0000-4000-8000-000000000052', 'Batch exercise two', TRUE),
  ('56000000-0000-4000-8000-000000000053', 'Batch exercise three', TRUE),
  ('56000000-0000-4000-8000-000000000054', 'Batch exercise four', TRUE);

INSERT INTO public.trainer_program_templates (id, trainer_user_id, name, days_per_week) VALUES
  ('56000000-0000-4000-8000-000000000061', '56000000-0000-4000-8000-000000000001', 'Active owner template', 1),
  ('56000000-0000-4000-8000-000000000063', '56000000-0000-4000-8000-000000000003', 'Suspended owner template', 1),
  ('56000000-0000-4000-8000-000000000064', '56000000-0000-4000-8000-000000000004', 'Inactive trainer template', 1);

INSERT INTO public.trainer_template_workouts (id, template_id, name, day_of_week, order_in_plan) VALUES
  ('56000000-0000-4000-8000-000000000071', '56000000-0000-4000-8000-000000000061', 'Active owner day', 1, 1),
  ('56000000-0000-4000-8000-000000000073', '56000000-0000-4000-8000-000000000063', 'Suspended owner day', 1, 1),
  ('56000000-0000-4000-8000-000000000074', '56000000-0000-4000-8000-000000000064', 'Inactive trainer day', 1, 1);

INSERT INTO public.trainer_template_exercises (
  id, template_workout_id, exercise_id, order_index, sets, reps, rest_seconds
) VALUES
  ('56000000-0000-4000-8000-000000000081', '56000000-0000-4000-8000-000000000071', '56000000-0000-4000-8000-000000000051', 1, 3, 10, 60),
  ('56000000-0000-4000-8000-000000000083', '56000000-0000-4000-8000-000000000071', '56000000-0000-4000-8000-000000000051', 3, 3, 10, 60);

SELECT set_config('request.jwt.claim.sub', '56000000-0000-4000-8000-000000000001', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SET LOCAL ROLE authenticated;

SELECT is(
  jsonb_array_length(
    public.append_trainer_template_exercises(
      '56000000-0000-4000-8000-000000000071',
      '[
        {"exerciseId":"56000000-0000-4000-8000-000000000052","sets":3,"reps":10,"weightKg":null,"targetRpe":7,"restSeconds":60,"notes":null},
        {"exerciseId":"56000000-0000-4000-8000-000000000053","sets":3,"reps":10,"weightKg":null,"targetRpe":7,"restSeconds":60,"notes":null}
      ]'::JSONB
    )->'exercises'
  ),
  2,
  'owner appends every selected exercise in one call'
);

SELECT results_eq(
  $$SELECT order_index FROM public.trainer_template_exercises
    WHERE template_workout_id = '56000000-0000-4000-8000-000000000071'
    ORDER BY order_index$$,
  $$VALUES (1), (2), (3), (4)$$,
  'existing gaps are compacted and appended exercises are consecutive'
);

SELECT is(
  (
    WITH response AS (
      SELECT public.append_trainer_template_exercises(
        '56000000-0000-4000-8000-000000000071',
        '[
          {"exerciseId":"56000000-0000-4000-8000-000000000054","sets":3,"reps":10,"weightKg":null,"targetRpe":7,"restSeconds":60,"notes":null},
          {"exerciseId":"56000000-0000-4000-8000-000000000051","sets":3,"reps":10,"weightKg":null,"targetRpe":7,"restSeconds":60,"notes":null}
        ]'::JSONB
      ) AS payload
    )
    SELECT jsonb_build_object(
      'templateWorkoutId', response.payload->>'templateWorkoutId',
      'exercises', (
        SELECT jsonb_agg(item.value - 'id' ORDER BY item.ordinality)
        FROM jsonb_array_elements(response.payload->'exercises') WITH ORDINALITY AS item(value, ordinality)
      )
    )
    FROM response
  ),
  '{"templateWorkoutId":"56000000-0000-4000-8000-000000000071","exercises":[{"exerciseId":"56000000-0000-4000-8000-000000000054","orderIndex":5},{"exerciseId":"56000000-0000-4000-8000-000000000051","orderIndex":6}]}'::JSONB,
  'response preserves request order and exposes the exact public payload shape'
);

SELECT throws_ok(
  $$SELECT public.append_trainer_template_exercises(
    '56000000-0000-4000-8000-000000000071',
    '[{"exerciseId":"56000000-0000-4000-8000-000000000099","sets":3,"reps":10,"weightKg":null,"targetRpe":7,"restSeconds":60,"notes":null}]'::jsonb
  )$$,
  'TRAINER_TEMPLATE_BATCH_EXERCISE_UNAVAILABLE',
  'an unavailable exercise rejects the complete batch'
);

SELECT is(
  (SELECT count(*) FROM public.trainer_template_exercises WHERE template_workout_id = '56000000-0000-4000-8000-000000000071'),
  6::BIGINT,
  'an unavailable exercise leaves every preexisting row unchanged'
);

SELECT throws_ok(
  $$SELECT public.append_trainer_template_exercises('56000000-0000-4000-8000-000000000071', '{}'::JSONB)$$,
  'TRAINER_TEMPLATE_BATCH_INVALID',
  'a non-array payload is rejected'
);
SELECT throws_ok(
  $$SELECT public.append_trainer_template_exercises('56000000-0000-4000-8000-000000000071', '[]'::JSONB)$$,
  'TRAINER_TEMPLATE_BATCH_INVALID',
  'an empty batch is rejected'
);
SELECT throws_ok(
  $$SELECT public.append_trainer_template_exercises(
    '56000000-0000-4000-8000-000000000071',
    '[{"exerciseId":"56000000-0000-4000-8000-000000000052","sets":3}]'::JSONB
  )$$,
  'TRAINER_TEMPLATE_BATCH_INVALID',
  'a structurally malformed exercise object is rejected'
);
SELECT throws_ok(
  $$SELECT public.append_trainer_template_exercises(
    '56000000-0000-4000-8000-000000000071',
    '[{"exerciseId":"56000000-0000-4000-8000-000000000052","sets":3,"reps":10,"weightKg":null,"targetRpe":7,"restSeconds":60,"notes":null},{"exerciseId":"56000000-0000-4000-8000-000000000052","sets":3,"reps":10,"weightKg":null,"targetRpe":7,"restSeconds":60,"notes":null}]'::JSONB
  )$$,
  'TRAINER_TEMPLATE_BATCH_INVALID',
  'duplicate exercise identifiers in one payload are rejected'
);

SELECT throws_ok(
  $$SELECT public.append_trainer_template_exercises('56000000-0000-4000-8000-000000000071', '[{"exerciseId":"56000000-0000-4000-8000-000000000052","sets":21,"reps":10,"weightKg":null,"targetRpe":7,"restSeconds":60,"notes":null}]'::JSONB)$$,
  'TRAINER_TEMPLATE_BATCH_INVALID', 'sets above 20 are rejected'
);
SELECT throws_ok(
  $$SELECT public.append_trainer_template_exercises('56000000-0000-4000-8000-000000000071', '[{"exerciseId":"56000000-0000-4000-8000-000000000052","sets":3,"reps":101,"weightKg":null,"targetRpe":7,"restSeconds":60,"notes":null}]'::JSONB)$$,
  'TRAINER_TEMPLATE_BATCH_INVALID', 'reps above 100 are rejected'
);
SELECT throws_ok(
  $$SELECT public.append_trainer_template_exercises('56000000-0000-4000-8000-000000000071', '[{"exerciseId":"56000000-0000-4000-8000-000000000052","sets":3,"reps":10,"weightKg":1000.01,"targetRpe":7,"restSeconds":60,"notes":null}]'::JSONB)$$,
  'TRAINER_TEMPLATE_BATCH_INVALID', 'weight above 1000 kilograms is rejected'
);
SELECT throws_ok(
  $$SELECT public.append_trainer_template_exercises('56000000-0000-4000-8000-000000000071', '[{"exerciseId":"56000000-0000-4000-8000-000000000052","sets":3,"reps":10,"weightKg":null,"targetRpe":11,"restSeconds":60,"notes":null}]'::JSONB)$$,
  'TRAINER_TEMPLATE_BATCH_INVALID', 'target RPE above 10 is rejected'
);
SELECT throws_ok(
  $$SELECT public.append_trainer_template_exercises('56000000-0000-4000-8000-000000000071', '[{"exerciseId":"56000000-0000-4000-8000-000000000052","sets":3,"reps":10,"weightKg":null,"targetRpe":7,"restSeconds":3601,"notes":null}]'::JSONB)$$,
  'TRAINER_TEMPLATE_BATCH_INVALID', 'rest above 3600 seconds is rejected'
);

RESET ROLE;
INSERT INTO public.trainer_template_exercises (
  id, template_workout_id, exercise_id, order_index, sets, reps, rest_seconds
)
SELECT
  ('56000000-0000-4000-8000-' || lpad(series::TEXT, 12, '0'))::UUID,
  '56000000-0000-4000-8000-000000000071',
  '56000000-0000-4000-8000-000000000051',
  series,
  3,
  10,
  60
FROM generate_series(7, 30) AS series;
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.append_trainer_template_exercises('56000000-0000-4000-8000-000000000071', '[{"exerciseId":"56000000-0000-4000-8000-000000000052","sets":3,"reps":10,"weightKg":null,"targetRpe":7,"restSeconds":60,"notes":null}]'::JSONB)$$,
  'TRAINER_TEMPLATE_BATCH_LIMIT',
  'a day cannot contain more than 30 exercises'
);
RESET ROLE;
DELETE FROM public.trainer_template_exercises
WHERE template_workout_id = '56000000-0000-4000-8000-000000000071' AND order_index BETWEEN 7 AND 30;

SELECT set_config('request.jwt.claim.sub', '56000000-0000-4000-8000-000000000003', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.append_trainer_template_exercises('56000000-0000-4000-8000-000000000073', '[{"exerciseId":"56000000-0000-4000-8000-000000000052","sets":3,"reps":10,"weightKg":null,"targetRpe":7,"restSeconds":60,"notes":null}]'::JSONB)$$,
  'TRAINER_TEMPLATE_OWNER_REQUIRED',
  'an inactive account cannot append template exercises'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '56000000-0000-4000-8000-000000000004', TRUE);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.append_trainer_template_exercises('56000000-0000-4000-8000-000000000074', '[{"exerciseId":"56000000-0000-4000-8000-000000000052","sets":3,"reps":10,"weightKg":null,"targetRpe":7,"restSeconds":60,"notes":null}]'::JSONB)$$,
  'TRAINER_TEMPLATE_OWNER_REQUIRED',
  'an inactive trainer cannot append template exercises'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '56000000-0000-4000-8000-000000000002', TRUE);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.append_trainer_template_exercises('56000000-0000-4000-8000-000000000071', '[{"exerciseId":"56000000-0000-4000-8000-000000000052","sets":3,"reps":10,"weightKg":null,"targetRpe":7,"restSeconds":60,"notes":null}]'::JSONB)$$,
  'TRAINER_TEMPLATE_OWNER_REQUIRED',
  'an authenticated outsider cannot append to another trainer template'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '', TRUE);
SELECT set_config('request.jwt.claim.role', 'anon', TRUE);
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.append_trainer_template_exercises('56000000-0000-4000-8000-000000000071', '[]'::JSONB)$$,
  '42501',
  'permission denied for function append_trainer_template_exercises',
  'anonymous callers cannot execute the batch append RPC'
);
RESET ROLE;

UPDATE public.trainer_template_exercises
SET order_index = 8
WHERE id = '56000000-0000-4000-8000-000000000083';

CREATE FUNCTION pg_temp.reject_second_batch_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.exercise_id = '56000000-0000-4000-8000-000000000054'::UUID THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_BATCH_FORCED_FAILURE';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reject_second_batch_insert
  BEFORE INSERT ON public.trainer_template_exercises
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_second_batch_insert();

SELECT set_config('request.jwt.claim.sub', '56000000-0000-4000-8000-000000000001', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.append_trainer_template_exercises(
    '56000000-0000-4000-8000-000000000071',
    '[{"exerciseId":"56000000-0000-4000-8000-000000000052","sets":3,"reps":10,"weightKg":null,"targetRpe":7,"restSeconds":60,"notes":null},{"exerciseId":"56000000-0000-4000-8000-000000000054","sets":3,"reps":10,"weightKg":null,"targetRpe":7,"restSeconds":60,"notes":null}]'::JSONB
  )$$,
  'TRAINER_TEMPLATE_BATCH_FORCED_FAILURE',
  'a failure on the second insert aborts the call'
);
RESET ROLE;
DROP TRIGGER reject_second_batch_insert ON public.trainer_template_exercises;

SELECT results_eq(
  $$SELECT order_index FROM public.trainer_template_exercises
    WHERE template_workout_id = '56000000-0000-4000-8000-000000000071'
    ORDER BY order_index$$,
  $$VALUES (1), (3), (4), (5), (6), (8)$$,
  'the failed second insert rolls back both the first insert and gap compaction'
);

SELECT ok(
  (
    SELECT procedure.prosecdef
      AND procedure.proconfig @> ARRAY['search_path=public, pg_temp']::TEXT[]
    FROM pg_proc procedure
    WHERE procedure.oid = 'public.append_trainer_template_exercises(uuid,jsonb)'::REGPROCEDURE
  )
  AND has_function_privilege('authenticated', 'public.append_trainer_template_exercises(uuid,jsonb)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.append_trainer_template_exercises(uuid,jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.append_trainer_template_exercises(uuid,jsonb)', 'EXECUTE'),
  'batch append is SECURITY DEFINER with a fixed search_path and least-privilege grants'
);

SELECT is(public.trainer_security_preflight(), 56, 'trainer preflight marks the batch append boundary');

SELECT * FROM finish();
ROLLBACK;

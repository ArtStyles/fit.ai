BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(8);

SELECT is(public.trainer_security_preflight(), 49, 'trainer preflight marks the ISO repair');
SELECT is(
  (SELECT day_of_week FROM public.workouts WHERE id = 'f4700000-0000-4000-8000-000000000101'),
  7,
  'legacy professional Sunday is restored from the immutable snapshot'
);
SELECT is(
  (SELECT day_of_week FROM public.workouts WHERE id = 'f4700000-0000-4000-8000-000000000105'),
  7,
  'non-adjacent professional mismatch is restored exactly from 2 to snapshot day 7'
);
SELECT is(
  (SELECT day_of_week FROM public.workouts WHERE id = 'f4700000-0000-4000-8000-000000000102'),
  6,
  'personal workout remains unchanged'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.workouts'::regclass
      AND tgname = 'trg_enforce_trainer_workout_iso_schedule'
      AND tgenabled = 'O' AND NOT tgisinternal
  ),
  'ISO schedule trigger is enabled'
);

SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.trainer_plan_assignments (
  id, relationship_id, trainer_user_id, client_user_id, status
) VALUES (
  'f4700000-0000-4000-8000-000000000066',
  'f4700000-0000-4000-8000-000000000041',
  'f4700000-0000-4000-8000-000000000001',
  'f4700000-0000-4000-8000-000000000002',
  'proposed'
);
INSERT INTO public.trainer_assignment_versions (
  id, assignment_id, version_number, snapshot, status, materialized_plan_id
) VALUES (
  'f4700000-0000-4000-8000-000000000076',
  'f4700000-0000-4000-8000-000000000066',
  1,
  '{"schemaVersion":1,"workouts":[{"dayOfWeek":"7","orderInPlan":"1"}]}'::JSONB,
  'proposed',
  'f4700000-0000-4000-8000-000000000097'
);
INSERT INTO public.workout_plans (
  id, user_id, name, family_id, source_type, library_slot, prescription_locked,
  trainer_relationship_id, trainer_assignment_id, trainer_assignment_version_id
) VALUES (
  'f4700000-0000-4000-8000-000000000097',
  'f4700000-0000-4000-8000-000000000002',
  'Malformed scalar trigger plan',
  gen_random_uuid(),
  'trainer_assigned',
  'professional',
  TRUE,
  'f4700000-0000-4000-8000-000000000041',
  'f4700000-0000-4000-8000-000000000066',
  'f4700000-0000-4000-8000-000000000076'
);
SET LOCAL ROLE postgres;
SELECT set_config('app.trainer_prescription_mutation', 'authorized', TRUE);
SELECT throws_ok(
  $$INSERT INTO public.workouts (
      id, user_id, plan_id, name, day_of_week, order_in_plan
    ) VALUES (
      'f4700000-0000-4000-8000-000000000107',
      'f4700000-0000-4000-8000-000000000002',
      'f4700000-0000-4000-8000-000000000097',
      'Malformed scalar trigger workout',
      7,
      1
    )$$,
  'P0001', 'TRAINER_PRESCRIPTION_SCHEDULE_MISMATCH',
  'trigger rejects string weekday/order scalars even when their text matches'
);
SELECT throws_ok(
  $$UPDATE public.workouts SET day_of_week = 6 WHERE id = 'f4700000-0000-4000-8000-000000000101'$$,
  'P0001', 'TRAINER_PRESCRIPTION_SCHEDULE_MISMATCH',
  'trusted maintenance cannot persist a professional day that disagrees with its snapshot'
);
SELECT lives_ok(
  $$UPDATE public.workouts SET day_of_week = 7 WHERE id = 'f4700000-0000-4000-8000-000000000101'$$,
  'exact ISO schedule remains writable by an authorized trusted session'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;

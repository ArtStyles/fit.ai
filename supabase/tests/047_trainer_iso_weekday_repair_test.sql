BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(6);

SELECT is(public.trainer_security_preflight(), 47, 'trainer preflight marks the ISO repair');
SELECT is(
  (SELECT day_of_week FROM public.workouts WHERE id = 'f4700000-0000-4000-8000-000000000101'),
  7,
  'legacy professional Sunday is restored from the immutable snapshot'
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
SET LOCAL ROLE postgres;
SELECT set_config('app.trainer_prescription_mutation', 'authorized', TRUE);
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

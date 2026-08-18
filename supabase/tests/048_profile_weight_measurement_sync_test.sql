BEGIN;
SET LOCAL search_path = public, extensions;
SELECT plan(22);

INSERT INTO auth.users (id, email)
VALUES ('10000000-0000-4000-8000-000000000001', 'weight-sync@example.test');
INSERT INTO public.profiles (id, weight_kg, onboarding_done)
VALUES ('10000000-0000-4000-8000-000000000001', 80, TRUE);

INSERT INTO public.measurements (id, user_id, recorded_at, notes)
VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '2026-08-01T12:00:00Z', 'solo nota');
SELECT is((SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000001'), 80::numeric, 'notes-only insert preserves onboarding weight');

INSERT INTO public.measurements (id, user_id, recorded_at, weight_kg)
VALUES ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '2026-08-02T12:00:00Z', 78);
SELECT is((SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000001'), 78::numeric, 'weighted insert updates profile');

INSERT INTO public.measurements (id, user_id, recorded_at, weight_kg)
VALUES ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '2026-08-02T12:00:00Z', 77);
SELECT is((SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000001'), 77::numeric, 'later id wins when recorded_at ties');

UPDATE public.measurements SET weight_kg = 76 WHERE id = '20000000-0000-4000-8000-000000000003';
SELECT is((SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000001'), 76::numeric, 'editing the current row keeps its current position');

UPDATE public.measurements SET recorded_at = '2026-08-03T12:00:00Z' WHERE id = '20000000-0000-4000-8000-000000000002';
SELECT is((SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000001'), 78::numeric, 'moving an older measurement to the future refreshes profile weight');

INSERT INTO public.measurements (id, user_id, recorded_at, weight_kg)
VALUES ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '2026-08-03T12:00:00Z', 75);
UPDATE public.measurements
SET id = '20000000-0000-4000-8000-000000000005'
WHERE id = '20000000-0000-4000-8000-000000000002';
SELECT is((SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000001'), 78::numeric, 'changing a tied measurement id refreshes profile weight');

DELETE FROM public.measurements WHERE id = '20000000-0000-4000-8000-000000000005';
SELECT is((SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000001'), 75::numeric, 'deleting newest restores previous weight');

UPDATE public.measurements SET weight_kg = NULL WHERE id = '20000000-0000-4000-8000-000000000004';
SELECT is((SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000001'), 76::numeric, 'clearing the current row restores the next weighted row');

UPDATE public.measurements SET weight_kg = NULL WHERE id = '20000000-0000-4000-8000-000000000003';
SELECT is((SELECT weight_kg FROM profiles WHERE id = '10000000-0000-4000-8000-000000000001'), NULL::numeric, 'clearing the last weighted row clears profile');

SELECT is((SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000002'), 72::numeric, 'backfill leaves profile without weighted history unchanged');
SELECT is((SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000005'), 71::numeric, 'backfill applies the latest historical weighted measurement');

INSERT INTO auth.users (id, email)
VALUES ('10000000-0000-4000-8000-000000000003', 'onboarding-weight@example.test');
INSERT INTO public.profiles (id, weight_kg, onboarding_done)
VALUES ('10000000-0000-4000-8000-000000000003', NULL, FALSE);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE public.profiles
      SET weight_kg = 73, onboarding_done = TRUE
    WHERE id = '10000000-0000-4000-8000-000000000003'$$,
  'authenticated initial onboarding weight write is allowed without weighted history'
);
SELECT throws_ok(
  $$UPDATE public.profiles
      SET weight_kg = 70
    WHERE id = '10000000-0000-4000-8000-000000000003'$$,
  'P0001', 'profile weight is derived from measurements',
  'authenticated direct post-onboarding weight update is rejected'
);
SELECT is(
  (SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000003'),
  73::numeric,
  'rejected direct update leaves the onboarding weight unchanged'
);
SELECT throws_ok(
  $$UPDATE public.profiles SET onboarding_done = FALSE WHERE id = '10000000-0000-4000-8000-000000000003';
    UPDATE public.profiles SET weight_kg = 70 WHERE id = '10000000-0000-4000-8000-000000000003';
    UPDATE public.profiles SET onboarding_done = TRUE WHERE id = '10000000-0000-4000-8000-000000000003'$$,
  'P0001', 'onboarding state cannot be reverted',
  'authenticated downgrade-weight-upgrade sequence is rejected'
);
SELECT is(
  (SELECT ROW(onboarding_done, weight_kg)::text FROM profiles WHERE id = '10000000-0000-4000-8000-000000000003'),
  '(t,73.0)'::text,
  'rejected authenticated sequence leaves onboarding and weight unchanged'
);
RESET ROLE;

INSERT INTO auth.users (id, email)
VALUES ('10000000-0000-4000-8000-000000000006', 'pre-onboarding-measurement@example.test');
INSERT INTO public.profiles (id, weight_kg, onboarding_done)
VALUES ('10000000-0000-4000-8000-000000000006', NULL, FALSE);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000006', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.measurements (id, user_id, recorded_at, weight_kg)
    VALUES ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000006', '2026-08-05T12:00:00Z', 69)$$,
  'authenticated user can log an initial weighted measurement before onboarding completes'
);
SELECT is(
  (SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000006'),
  69::numeric,
  'initial weighted measurement synchronizes the incomplete profile'
);
SELECT throws_ok(
  $$UPDATE public.profiles
      SET weight_kg = 70
    WHERE id = '10000000-0000-4000-8000-000000000006'$$,
  'P0001', 'profile weight is derived from measurements',
  'authenticated direct weight update is rejected after the first weighted measurement'
);
SELECT is(
  (SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000006'),
  69::numeric,
  'rejected direct update preserves the measurement-derived weight'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$UPDATE public.profiles
      SET weight_kg = 74
    WHERE id = '10000000-0000-4000-8000-000000000003'$$,
  'service role may perform privileged profile weight maintenance'
);
RESET ROLE;

SELECT throws_ok(
  $$UPDATE public.measurements
      SET user_id = '10000000-0000-4000-8000-000000000002'
    WHERE id = '20000000-0000-4000-8000-000000000001'$$,
  'P0001', 'measurement owner cannot be changed',
  'measurement owner change is rejected with stable error'
);

SELECT * FROM finish();
ROLLBACK;

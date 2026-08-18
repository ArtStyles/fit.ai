BEGIN;
SET LOCAL search_path = public, extensions;
SELECT plan(7);

INSERT INTO auth.users (id, email)
VALUES ('10000000-0000-4000-8000-000000000001', 'weight-sync@example.test');
INSERT INTO public.profiles (id, weight_kg)
VALUES ('10000000-0000-4000-8000-000000000001', 80);

INSERT INTO public.measurements (id, user_id, recorded_at, notes)
VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '2026-08-01T12:00:00Z', 'solo nota');
SELECT is((SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000001'), 80::numeric, 'notes-only insert preserves onboarding weight');

INSERT INTO public.measurements (id, user_id, recorded_at, weight_kg)
VALUES ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '2026-08-02T12:00:00Z', 78);
SELECT is((SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000001'), 78::numeric, 'weighted insert updates profile');

INSERT INTO public.measurements (id, user_id, recorded_at, weight_kg)
VALUES ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '2026-08-03T12:00:00Z', 77);
SELECT is((SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000001'), 77::numeric, 'newest weighted measurement wins');

UPDATE public.measurements SET weight_kg = 76 WHERE id = '20000000-0000-4000-8000-000000000002';
SELECT is((SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000001'), 77::numeric, 'editing an older row keeps newest weight');

DELETE FROM public.measurements WHERE id = '20000000-0000-4000-8000-000000000003';
SELECT is((SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000001'), 76::numeric, 'deleting newest restores previous weight');

UPDATE public.measurements SET weight_kg = NULL WHERE id = '20000000-0000-4000-8000-000000000002';
SELECT is((SELECT weight_kg FROM profiles WHERE id = '10000000-0000-4000-8000-000000000001'), NULL::numeric, 'clearing last weighted row clears profile');

SELECT is((SELECT weight_kg::numeric FROM profiles WHERE id = '10000000-0000-4000-8000-000000000002'), 72::numeric, 'backfill leaves profile without weighted history unchanged');

SELECT * FROM finish();
ROLLBACK;

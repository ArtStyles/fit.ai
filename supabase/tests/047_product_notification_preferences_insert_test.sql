BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(4);

SELECT ok(
  has_column_privilege('authenticated', 'public.product_notification_preferences', 'user_id', 'INSERT'),
  'authenticated can supply its own user id'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('44444444-4444-4444-8444-444444444444', 'preference-upsert@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id) VALUES ('44444444-4444-4444-8444-444444444444');
DELETE FROM public.product_notification_preferences
WHERE user_id = '44444444-4444-4444-8444-444444444444';

SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.product_notification_preferences (user_id, professional_enabled, push_enabled)
    VALUES ('44444444-4444-4444-8444-444444444444', false, true)$$,
  'authenticated user inserts own missing preference row'
);
SELECT is(
  (SELECT count(*) FROM public.product_notification_preferences),
  1::bigint,
  'authenticated user sees the inserted own row'
);
SELECT throws_ok(
  $$INSERT INTO public.product_notification_preferences (user_id)
    VALUES ('33333333-3333-4333-8333-333333333333')$$,
  '42501', NULL,
  'authenticated user cannot insert another account preference'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;

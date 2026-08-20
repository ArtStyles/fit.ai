BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(9);

SELECT ok(
  NOT has_column_privilege('authenticated', 'public.product_notification_preferences', 'user_id', 'INSERT'),
  'authenticated cannot supply a notification preference owner'
);
SELECT ok(
  has_column_privilege('authenticated', 'public.product_notification_preferences', 'professional_enabled', 'INSERT')
    AND has_column_privilege('authenticated', 'public.product_notification_preferences', 'push_enabled', 'INSERT'),
  'authenticated can insert only notification preference values'
);
SELECT is(
  (
    SELECT column_default::text
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_notification_preferences'
      AND column_name = 'user_id'
  ),
  'auth.uid()'::text,
  'notification preference owner defaults to the authenticated user'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('44444444-4444-4444-8444-444444444444', 'preference-upsert@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id) VALUES ('44444444-4444-4444-8444-444444444444');
DELETE FROM public.product_notification_preferences
WHERE user_id = '44444444-4444-4444-8444-444444444444';

SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.product_notification_preferences (professional_enabled, push_enabled)
    VALUES (false, true)
    ON CONFLICT (user_id) DO UPDATE
      SET professional_enabled = EXCLUDED.professional_enabled,
          push_enabled = EXCLUDED.push_enabled$$,
  'application upsert inserts the authenticated user missing preference row'
);
SELECT is(
  (SELECT professional_enabled FROM public.product_notification_preferences),
  false,
  'missing-row upsert persists the professional preference'
);
SELECT lives_ok(
  $$INSERT INTO public.product_notification_preferences (professional_enabled, push_enabled)
    VALUES (true, false)
    ON CONFLICT (user_id) DO UPDATE
      SET professional_enabled = EXCLUDED.professional_enabled,
          push_enabled = EXCLUDED.push_enabled$$,
  'application upsert updates the authenticated user existing preference row'
);
SELECT is(
  (SELECT ROW(professional_enabled, push_enabled)::text FROM public.product_notification_preferences),
  '(t,f)'::text,
  'existing-row upsert updates only preference values'
);
SELECT throws_ok(
  $$INSERT INTO public.product_notification_preferences (user_id, professional_enabled, push_enabled)
    VALUES ('33333333-3333-4333-8333-333333333333', false, false)
    ON CONFLICT (user_id) DO UPDATE
      SET professional_enabled = EXCLUDED.professional_enabled,
          push_enabled = EXCLUDED.push_enabled$$,
  '42501', NULL,
  'authenticated user cannot choose another account for an upsert'
);
SELECT is(
  (SELECT count(*) FROM public.product_notification_preferences),
  1::bigint,
  'cross-account upsert leaves only the authenticated preference visible'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;

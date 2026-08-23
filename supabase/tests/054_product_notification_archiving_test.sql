BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(10);

SELECT has_column(
  'public',
  'product_notifications',
  'dismissed_at',
  'product notifications retain a soft-archive timestamp'
);
SELECT ok(
  has_column_privilege(
    'authenticated',
    'public.product_notifications',
    'dismissed_at',
    'UPDATE'
  ),
  'authenticated users can archive notifications'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.product_notifications', 'DELETE'),
  'authenticated users cannot hard-delete notification history'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('77777777-7777-4777-8777-777777777777', 'archive-owner@example.test', '{}'::jsonb),
  ('88888888-8888-4888-8888-888888888888', 'archive-other@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id)
VALUES
  ('77777777-7777-4777-8777-777777777777'),
  ('88888888-8888-4888-8888-888888888888');
INSERT INTO public.product_notifications (
  user_id, type, title, body, dedupe_key
)
VALUES
  (
    '77777777-7777-4777-8777-777777777777',
    'archive.test',
    'Own notification',
    'Owner can archive this row.',
    'archive:owner'
  ),
  (
    '88888888-8888-4888-8888-888888888888',
    'archive.test',
    'Other notification',
    'Another owner keeps this row.',
    'archive:other'
  );

SELECT set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE public.product_notifications
       SET dismissed_at = NOW()
     WHERE dedupe_key = 'archive:owner'$$,
  'authenticated user can archive an own notification'
);
SELECT is(
  (
    SELECT count(*)
      FROM public.product_notifications
     WHERE dedupe_key = 'archive:owner'
       AND dismissed_at IS NOT NULL
  ),
  1::bigint,
  'archived notification remains stored for its owner'
);
SELECT lives_ok(
  $$UPDATE public.product_notifications
       SET dismissed_at = NOW()
     WHERE dedupe_key = 'archive:other'$$,
  'cross-user archive affects no visible rows'
);
SELECT throws_ok(
  $$DELETE FROM public.product_notifications WHERE dedupe_key = 'archive:owner'$$,
  '42501',
  NULL,
  'authenticated user cannot delete archived evidence'
);
RESET ROLE;

SELECT is(
  (
    SELECT count(*)
      FROM public.product_notifications
     WHERE dedupe_key = 'archive:owner'
       AND dismissed_at IS NOT NULL
  ),
  1::bigint,
  'owner archive persists outside the RLS session'
);
SELECT is(
  (
    SELECT count(*)
      FROM public.product_notifications
     WHERE dedupe_key = 'archive:other'
       AND dismissed_at IS NULL
  ),
  1::bigint,
  'cross-user archive did not change the other owner row'
);

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$UPDATE public.product_notifications
       SET dismissed_at = NOW()
     WHERE dedupe_key = 'archive:owner'$$,
  '42501',
  NULL,
  'anonymous users cannot archive notifications'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(12);

SELECT has_table(
  'public',
  'notification_attention_dismissals',
  'notification attention dismissals table exists'
);
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.notification_attention_dismissals'::regclass
       AND contype = 'p'
       AND pg_get_constraintdef(oid) = 'PRIMARY KEY (user_id, notice_key)'
  ),
  'each notice key is unique per user'
);
SELECT is(
  (
    SELECT column_default::text
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'notification_attention_dismissals'
       AND column_name = 'user_id'
  ),
  'auth.uid()'::text,
  'dismissal owner defaults to the authenticated user'
);
SELECT ok(
  NOT has_column_privilege(
    'authenticated',
    'public.notification_attention_dismissals',
    'user_id',
    'INSERT'
  ),
  'authenticated users cannot supply a dismissal owner'
);
SELECT ok(
  has_column_privilege(
    'authenticated',
    'public.notification_attention_dismissals',
    'notice_key',
    'INSERT'
  ),
  'authenticated users can insert a notice key'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.notification_attention_dismissals', 'SELECT'),
  'authenticated users can read dismissals through RLS'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.notification_attention_dismissals', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.notification_attention_dismissals', 'DELETE'),
  'authenticated users cannot update or delete dismissal history'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('55555555-5555-4555-8555-555555555555', 'dismiss-owner@example.test', '{}'::jsonb),
  ('66666666-6666-4666-8666-666666666666', 'dismiss-other@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id)
VALUES
  ('55555555-5555-4555-8555-555555555555'),
  ('66666666-6666-4666-8666-666666666666');

INSERT INTO public.notification_attention_dismissals (user_id, notice_key)
VALUES (
  '66666666-6666-4666-8666-666666666666',
  'plan-update:66666666-6666-4666-8666-666666666666:2026-08-20T12:00:00.000Z'
);

SELECT set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.notification_attention_dismissals (notice_key)
    VALUES ('plan-update:55555555-5555-4555-8555-555555555555:2026-08-20T12:00:00.000Z')$$,
  'an authenticated user can dismiss their current notice'
);
SELECT lives_ok(
  $$INSERT INTO public.notification_attention_dismissals (notice_key)
    VALUES ('plan-update:55555555-5555-4555-8555-555555555555:2026-08-20T12:00:00.000Z')
    ON CONFLICT (user_id, notice_key) DO NOTHING$$,
  'repeating the same dismissal is idempotent'
);
SELECT is(
  (SELECT count(*) FROM public.notification_attention_dismissals),
  1::bigint,
  'RLS exposes only the authenticated user dismissal'
);
SELECT throws_ok(
  $$INSERT INTO public.notification_attention_dismissals (user_id, notice_key)
    VALUES (
      '66666666-6666-4666-8666-666666666666',
      'plan-update:66666666-6666-4666-8666-666666666666:2026-08-21T12:00:00.000Z'
    )$$,
  '42501',
  NULL,
  'an authenticated user cannot choose another owner'
);
RESET ROLE;

SELECT is(
  (SELECT count(*) FROM public.notification_attention_dismissals),
  2::bigint,
  'cross-account insertion was rejected and both owner fixtures remain isolated'
);

SELECT * FROM finish();
ROLLBACK;

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(68);

SELECT has_table('public', 'product_notifications', 'product notifications table exists');
SELECT has_table('public', 'product_push_tokens', 'product push tokens table exists');
SELECT has_table('public', 'product_notification_preferences', 'product notification preferences table exists');
SELECT has_table('public', 'professional_audit_logs', 'professional audit log table exists');
SELECT has_function(
  'public',
  'create_product_notification',
  ARRAY['uuid', 'text', 'text', 'text', 'text', 'text', 'jsonb'],
  'service notification creation RPC exists'
);
SELECT is(
  (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'public.create_product_notification(uuid,text,text,text,text,text,jsonb)'::regprocedure),
  'postgres',
  'notification RPC has a trusted database owner'
);
SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.create_product_notification(uuid,text,text,text,text,text,jsonb)'::regprocedure),
  'notification RPC executes with its trusted owner privileges'
);

SELECT has_index('public', 'product_notifications', 'product_notifications_user_created_idx', 'notification feed index exists');
SELECT has_index('public', 'product_push_tokens', 'product_push_tokens_user_enabled_idx', 'enabled token lookup index exists');
SELECT has_index('public', 'professional_audit_logs', 'professional_audit_logs_subject_created_idx', 'audit subject timeline index exists');

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.product_notifications'::regclass), 'notification RLS is enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.product_push_tokens'::regclass), 'push token RLS is enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.product_notification_preferences'::regclass), 'preference RLS is enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.professional_audit_logs'::regclass), 'audit RLS is enabled');

SELECT ok(has_function_privilege('service_role', 'public.create_product_notification(uuid,text,text,text,text,text,jsonb)', 'EXECUTE'), 'service role can execute notification creation RPC');
SELECT ok(NOT has_function_privilege('authenticated', 'public.create_product_notification(uuid,text,text,text,text,text,jsonb)', 'EXECUTE'), 'authenticated cannot execute notification creation RPC');
SELECT ok(NOT has_function_privilege('anon', 'public.create_product_notification(uuid,text,text,text,text,text,jsonb)', 'EXECUTE'), 'anonymous cannot execute notification creation RPC');

SELECT ok(has_table_privilege('authenticated', 'public.product_notifications', 'SELECT'), 'authenticated can select notifications');
SELECT ok(has_column_privilege('authenticated', 'public.product_notifications', 'read_at', 'UPDATE'), 'authenticated can mark notifications read');
SELECT ok(NOT has_column_privilege('authenticated', 'public.product_notifications', 'title', 'UPDATE'), 'authenticated cannot rewrite notification content');
SELECT ok(has_table_privilege('authenticated', 'public.product_push_tokens', 'SELECT'), 'authenticated can select own token rows through RLS');
SELECT ok(has_table_privilege('authenticated', 'public.product_push_tokens', 'INSERT'), 'authenticated can register a token');
SELECT ok(has_column_privilege('authenticated', 'public.product_push_tokens', 'enabled', 'UPDATE'), 'authenticated can disable own tokens');
SELECT ok(NOT has_table_privilege('authenticated', 'public.product_push_tokens', 'DELETE'), 'authenticated cannot delete token evidence');
SELECT ok(has_table_privilege('authenticated', 'public.product_notification_preferences', 'SELECT'), 'authenticated can select own preferences');
SELECT ok(has_column_privilege('authenticated', 'public.product_notification_preferences', 'push_enabled', 'UPDATE'), 'authenticated can update own preferences');
SELECT ok(NOT has_table_privilege('authenticated', 'public.product_notification_preferences', 'INSERT'), 'authenticated cannot create preference rows');
SELECT ok(NOT has_table_privilege('authenticated', 'public.professional_audit_logs', 'SELECT'), 'authenticated cannot enumerate audit logs');
SELECT ok(NOT has_table_privilege('authenticated', 'public.professional_audit_logs', 'INSERT'), 'authenticated cannot forge audit logs');
SELECT ok(has_table_privilege('service_role', 'public.professional_audit_logs', 'INSERT'), 'service role can append audit logs');

SELECT has_table('public', 'social_push_tokens', 'existing social push tokens remain present');
SELECT has_table('public', 'social_notification_preferences', 'existing social preferences remain present');
SELECT is(
  (SELECT count(*) FROM public.product_notification_preferences
    WHERE user_id = '33333333-3333-4333-8333-333333333333'),
  1::bigint,
  'migration backfills preferences for a profile that predates migration 040'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'trainer-foundation-a@example.test', '{}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', 'trainer-foundation-b@example.test', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id)
VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222')
ON CONFLICT (id) DO NOTHING;

SELECT is(
  (SELECT count(*) FROM public.product_notification_preferences WHERE user_id IN (
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222'
  )),
  2::bigint,
  'profile creation provisions product notification preferences'
);

SET LOCAL ROLE service_role;

SELECT lives_ok(
  $$SELECT public.create_product_notification(
    '11111111-1111-4111-8111-111111111111', 'professional_application', 'Solicitud recibida',
    'Tu solicitud profesional fue recibida.', '/professionals/application', 'application:111', '{"source":"test"}'::jsonb
  )$$,
  'service role creates a product notification'
);
SELECT lives_ok(
  $$SELECT public.create_product_notification(
    '22222222-2222-4222-8222-222222222222', 'professional_application', 'Solicitud recibida',
    'Tu solicitud profesional fue recibida.', '/professionals/application', 'application:222', '{}'::jsonb
  )$$,
  'service role creates a second user notification'
);
SELECT is((SELECT count(*) FROM public.product_notifications WHERE user_id = '11111111-1111-4111-8111-111111111111'), 1::bigint, 'service RPC persisted the notification');
SELECT lives_ok(
  $$SELECT public.create_product_notification(
    '11111111-1111-4111-8111-111111111111', 'professional_application', 'Ignored replacement',
    'Ignored replacement body.', '/ignored', 'application:111', '{}'::jsonb
  )$$,
  'dedupe retry succeeds idempotently'
);
SELECT is((SELECT count(*) FROM public.product_notifications WHERE user_id = '11111111-1111-4111-8111-111111111111'), 1::bigint, 'dedupe retry does not create a second row');
SELECT throws_ok(
  $$SELECT public.create_product_notification(
    '11111111-1111-4111-8111-111111111111', 'bad_url', 'Bad URL', 'Body',
    'https://example.test/escape', 'bad-url', '{}'::jsonb
  )$$,
  '23514', NULL,
  'external notification URLs violate the internal URL constraint'
);
SELECT throws_ok(
  $$INSERT INTO public.product_notifications (
    user_id, type, title, body, dedupe_key, created_at, read_at
  ) VALUES (
    '11111111-1111-4111-8111-111111111111', 'invalid_read', 'Invalid read', 'Body', 'invalid-read',
    '2026-08-07 12:00:00+00', '2026-08-07 11:59:59+00'
  )$$,
  '23514', NULL,
  'read timestamp cannot precede creation timestamp'
);
SELECT throws_ok(
  $$INSERT INTO public.product_notifications (user_id, type, title, body, dedupe_key)
    VALUES ('11111111-1111-4111-8111-111111111111', 'duplicate', 'Duplicate', 'Body', 'application:111')$$,
  '23505', NULL,
  'notification dedupe key is unique per user'
);

INSERT INTO public.product_push_tokens (user_id, token, platform, device_id)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'token-user-a', 'android', 'device-a'),
  ('22222222-2222-4222-8222-222222222222', 'token-user-b', 'ios', 'device-b');

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SET LOCAL ROLE authenticated;

SELECT is((SELECT count(*) FROM public.product_notifications), 1::bigint, 'authenticated sees only own notifications');
SELECT is((SELECT count(*) FROM public.product_notifications WHERE user_id = '22222222-2222-4222-8222-222222222222'), 0::bigint, 'authenticated cannot enumerate another user notifications');
SELECT lives_ok(
  $$UPDATE public.product_notifications SET read_at = now() WHERE dedupe_key = 'application:111'$$,
  'authenticated can mark an own notification read'
);
SELECT is((SELECT count(*) FROM public.product_notifications WHERE read_at IS NOT NULL), 1::bigint, 'own notification update is visible');
SELECT lives_ok(
  $$UPDATE public.product_notifications SET read_at = now() WHERE dedupe_key = 'application:222'$$,
  'cross-user notification update affects no visible rows'
);
SELECT throws_ok(
  $$SELECT public.create_product_notification(
    '11111111-1111-4111-8111-111111111111', 'forged', 'Forged', 'Body', '/forged', 'forged', '{}'::jsonb
  )$$,
  '42501', NULL,
  'authenticated cannot call the internal notification RPC directly'
);

SELECT is((SELECT count(*) FROM public.product_push_tokens), 1::bigint, 'authenticated sees only own push tokens');
SELECT is((SELECT count(*) FROM public.product_push_tokens WHERE user_id = '22222222-2222-4222-8222-222222222222'), 0::bigint, 'token enumeration is private');
SELECT lives_ok(
  $$INSERT INTO public.product_push_tokens (user_id, token, platform, device_id)
    VALUES ('11111111-1111-4111-8111-111111111111', 'token-user-a-2', 'ios', 'device-a-2')$$,
  'authenticated can register an own push token'
);
SELECT throws_ok(
  $$INSERT INTO public.product_push_tokens (user_id, token, platform, device_id)
    VALUES ('22222222-2222-4222-8222-222222222222', 'forged-other-token', 'ios', 'forged-device')$$,
  '42501', NULL,
  'authenticated cannot register a token for another user'
);
SELECT lives_ok(
  $$UPDATE public.product_push_tokens SET enabled = false WHERE token = 'token-user-a'$$,
  'authenticated can disable an own token'
);
SELECT is(
  (SELECT enabled FROM public.product_push_tokens WHERE token = 'token-user-a'),
  false,
  'own push token update persists the disabled state'
);
SELECT lives_ok(
  $$UPDATE public.product_push_tokens SET enabled = false WHERE token = 'token-user-b'$$,
  'cross-user token update affects no visible rows'
);

SELECT is((SELECT count(*) FROM public.product_notification_preferences), 1::bigint, 'authenticated sees only own notification preferences');
SELECT is((SELECT count(*) FROM public.product_notification_preferences WHERE user_id = '22222222-2222-4222-8222-222222222222'), 0::bigint, 'authenticated cannot enumerate another user preferences');
SELECT lives_ok(
  $$UPDATE public.product_notification_preferences SET push_enabled = false WHERE user_id = '11111111-1111-4111-8111-111111111111'$$,
  'authenticated can update own notification preferences'
);
SELECT is(
  (SELECT push_enabled FROM public.product_notification_preferences
    WHERE user_id = '11111111-1111-4111-8111-111111111111'),
  false,
  'own preference update persists the disabled push state'
);
SELECT lives_ok(
  $$UPDATE public.product_notification_preferences SET push_enabled = false WHERE user_id = '22222222-2222-4222-8222-222222222222'$$,
  'cross-user preference update affects no visible rows'
);
SELECT throws_ok($$SELECT * FROM public.professional_audit_logs$$, '42501', NULL, 'authenticated cannot read professional audit logs');
SELECT throws_ok(
  $$INSERT INTO public.professional_audit_logs (actor_user_id, subject_user_id, entity_type, entity_id, action)
    VALUES ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'application', '33333333-3333-4333-8333-333333333333', 'forged')$$,
  '42501', NULL,
  'authenticated cannot append professional audit logs'
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM public.product_notifications$$, '42501', NULL, 'anonymous has no notification table access');

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT is((SELECT read_at IS NULL FROM public.product_notifications WHERE dedupe_key = 'application:222'), true, 'cross-user notification update changed nothing');
SELECT is((SELECT enabled FROM public.product_push_tokens WHERE token = 'token-user-b'), true, 'cross-user token update changed nothing');
SELECT is((SELECT push_enabled FROM public.product_notification_preferences WHERE user_id = '22222222-2222-4222-8222-222222222222'), true, 'cross-user preference update changed nothing');
SELECT lives_ok(
  $$INSERT INTO public.professional_audit_logs (actor_user_id, subject_user_id, entity_type, entity_id, action, metadata)
    VALUES ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'application', '33333333-3333-4333-8333-333333333333', 'submitted', '{"source":"test"}'::jsonb)$$,
  'service role can append professional audit logs'
);
SELECT is((SELECT count(*) FROM public.professional_audit_logs), 1::bigint, 'service role can inspect professional audit logs');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;

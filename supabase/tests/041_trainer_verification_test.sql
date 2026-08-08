BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(58);

SELECT has_function('public', 'create_trainer_application_credential', ARRAY['uuid', 'uuid', 'text', 'text', 'text', 'date', 'date', 'text', 'text', 'bigint'], 'credential creation RPC exists');
SELECT has_function('public', 'prepare_trainer_credential_removal', ARRAY['uuid', 'uuid'], 'credential removal preparation RPC exists');
SELECT has_function('public', 'list_trainer_credential_cleanup', ARRAY[]::text[], 'cleanup outbox listing RPC exists');
SELECT has_function('public', 'finalize_trainer_credential_cleanup', ARRAY['uuid'], 'cleanup finalization RPC exists');
SELECT has_table('public', 'trainer_credential_storage_cleanup', 'durable storage cleanup outbox exists');

SELECT ok(NOT has_table_privilege('authenticated', 'public.trainer_application_credentials', 'INSERT'), 'authenticated cannot bypass credential creation RPC');
SELECT ok(NOT has_table_privilege('authenticated', 'public.trainer_application_credentials', 'UPDATE'), 'authenticated cannot forge credential metadata');
SELECT ok(NOT has_table_privilege('authenticated', 'public.trainer_application_credentials', 'DELETE'), 'authenticated cannot delete metadata before storage cleanup');
SELECT ok(NOT has_table_privilege('authenticated', 'public.trainer_applications', 'DELETE'), 'authenticated cannot cascade-delete credential storage references');
SELECT has_view('public', 'trainer_interviews_applicant_public', 'applicant-safe interview view exists');
SELECT ok(has_table_privilege('authenticated', 'public.trainer_interviews_applicant_public', 'SELECT'), 'authenticated can read the applicant-safe interview view');
SELECT ok(NOT has_table_privilege('anon', 'public.trainer_interviews_applicant_public', 'SELECT'), 'anonymous users cannot read applicant interview details');
SELECT ok(NOT has_table_privilege('authenticated', 'public.trainer_interviews', 'SELECT'), 'authenticated cannot read the private interview table directly');
SELECT is(
  (SELECT count(*) FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'trainer_interviews_applicant_public'
     AND column_name IN ('outcome', 'internal_note', 'created_by')),
  0::bigint,
  'applicant-safe interview view omits outcome, internal note and creator identity'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'verification-a@example.test', '{}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', 'verification-b@example.test', '{}'::jsonb),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'verification-c@example.test', '{}'::jsonb),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'verification-notification-rollback@example.test', '{}'::jsonb),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'verification-null-avatar@example.test', '{}'::jsonb),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'verification-admin@example.test', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, avatar_url, onboarding_done, is_admin, account_status)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'https://cdn.example.test/a.jpg', true, false, 'active'),
  ('22222222-2222-4222-8222-222222222222', 'https://cdn.example.test/b.jpg', true, false, 'active'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'https://cdn.example.test/c.jpg', true, false, 'active'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'https://cdn.example.test/e.jpg', true, false, 'active'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', NULL, true, false, 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'https://cdn.example.test/admin.jpg', true, true, 'active')
ON CONFLICT (id) DO UPDATE SET
  avatar_url = EXCLUDED.avatar_url,
  onboarding_done = EXCLUDED.onboarding_done,
  is_admin = EXCLUDED.is_admin,
  account_status = EXCLUDED.account_status;

INSERT INTO public.trainer_applications (
  id, user_id, professional_name, professional_photo_url, bio, specialties, modalities,
  experience_summary, general_location, languages, contact_email, contact_phone,
  preferred_contact, timezone, interview_availability
) VALUES
  (
    '31111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
    'Trainer A', 'https://cdn.example.test/a.jpg', repeat('bio ', 20), ARRAY['strength'], ARRAY['online'],
    repeat('experience ', 4), NULL, ARRAY['es'], 'a@example.test', NULL,
    'email', 'America/Havana', 'Weekdays after 14:00'
  ),
  (
    '32222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222',
    'Trainer B', 'https://cdn.example.test/b.jpg', repeat('bio ', 20), ARRAY['mobility'], ARRAY['online'],
    repeat('experience ', 4), NULL, ARRAY['es'], 'b@example.test', NULL,
    'email', 'America/Havana', 'Weekdays after 14:00'
  ),
  (
    '33333333-3333-4333-8333-333333333333', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'Bad Photo', 'https://attacker.example.test/not-owned.jpg', repeat('bio ', 20), ARRAY['strength'], ARRAY['online'],
    repeat('experience ', 4), NULL, ARRAY['es'], 'bad-photo@example.test', NULL,
    'email', 'America/Havana', 'Weekdays after 14:00'
  ),
  (
    '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'Rollback Notification', 'https://cdn.example.test/e.jpg', repeat('bio ', 20), ARRAY['strength'], ARRAY['online'],
    repeat('experience ', 4), NULL, ARRAY['es'], 'notification-rollback@example.test', NULL,
    'email', 'America/Havana', 'Weekdays after 14:00'
  ),
  (
    '3fffffff-ffff-4fff-8fff-ffffffffffff', 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    'Null Avatar', NULL, repeat('bio ', 20), ARRAY['strength'], ARRAY['online'],
    repeat('experience ', 4), NULL, ARRAY['es'], 'null-avatar@example.test', NULL,
    'email', 'America/Havana', 'Weekdays after 14:00'
  );

INSERT INTO public.trainer_application_credentials (
  id, application_id, credential_type, title, external_url
) VALUES
  (
    '44444444-4444-4444-8444-444444444444',
    '33333333-3333-4333-8333-333333333333',
    'link', 'Existing valid certificate', 'https://issuer.example.test/cert/c'
  ),
  (
    '4eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'link', 'Rollback certificate', 'https://issuer.example.test/cert/e'
  ),
  (
    '4fffffff-ffff-4fff-8fff-ffffffffffff',
    '3fffffff-ffff-4fff-8fff-ffffffffffff',
    'link', 'Null avatar certificate', 'https://issuer.example.test/cert/f'
  );

INSERT INTO public.trainer_interviews (
  id, application_id, proposed_at, timezone, medium, external_url, status,
  outcome, public_note, internal_note, created_by
) VALUES
  (
    '51111111-1111-4111-8111-111111111111',
    '31111111-1111-4111-8111-111111111111',
    '2026-08-10T18:30:00Z', 'Europe/Madrid', 'video_call',
    'https://meet.example.test/interview/a', 'scheduled', 'pending',
    'Bring your credentials.', 'Admin-only interview context.',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  (
    '52222222-2222-4222-8222-222222222222',
    '32222222-2222-4222-8222-222222222222',
    '2026-08-11T18:30:00Z', 'Europe/Madrid', 'phone', NULL,
    'proposed', NULL, 'We will call you.', 'Other applicant private context.',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );

SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT is((SELECT count(*) FROM public.trainer_applications), 1::bigint, 'RLS hides other applicant applications');
SELECT is((SELECT count(*) FROM public.trainer_interviews_applicant_public), 1::bigint, 'applicant interview view hides other owners');
SELECT is(
  (SELECT concat_ws('|', timezone, medium, external_url, status, public_note)
   FROM public.trainer_interviews_applicant_public),
  'Europe/Madrid|video_call|https://meet.example.test/interview/a|scheduled|Bring your credentials.',
  'applicant interview view exposes only the scheduling details needed by the owner experience'
);
SELECT throws_ok(
  $$SELECT public.submit_trainer_application('32222222-2222-4222-8222-222222222222')$$,
  '42501', NULL, 'applicant cannot submit another owner application'
);
SELECT throws_ok(
  $$INSERT INTO public.trainer_application_credentials (
      application_id, credential_type, title, external_url
    ) VALUES (
      '31111111-1111-4111-8111-111111111111', 'link', 'Bypass', 'https://'
    )$$,
  '42501', NULL, 'direct malformed credential bypass is denied'
);
SELECT throws_ok(
  $$SELECT public.create_trainer_application_credential(
      '41111111-1111-4111-8111-111111111111', '31111111-1111-4111-8111-111111111111',
      'link', 'Bad link', NULL, NULL, NULL, 'https://', NULL, NULL
    )$$,
  'P0001', NULL, 'credential RPC rejects an empty HTTPS origin'
);
SELECT throws_ok(
  $$SELECT public.create_trainer_application_credential(
      '42222222-2222-4222-8222-222222222222', '31111111-1111-4111-8111-111111111111',
      'document', 'Fake document', NULL, NULL, NULL, NULL, 'application/pdf', 42
    )$$,
  'P0001', NULL, 'credential RPC rejects metadata without a matching storage object'
);
SELECT lives_ok(
  $$SELECT public.create_trainer_application_credential(
      '43333333-3333-4333-8333-333333333333', '31111111-1111-4111-8111-111111111111',
      'link', 'Valid certificate', NULL, NULL, NULL, 'https://issuer.example.test/cert/1', NULL, NULL
    )$$,
  'credential RPC accepts a verifiable HTTPS link'
);
SELECT lives_ok(
  $$SELECT public.queue_trainer_credential_cleanup(
      '31111111-1111-4111-8111-111111111111',
      '46666666-6666-4666-8666-666666666666',
      '11111111-1111-4111-8111-111111111111/31111111-1111-4111-8111-111111111111/46666666-6666-4666-8666-666666666666.pdf'
    )$$,
  'upload cleanup can be queued before the storage object exists'
);
SELECT is(
  (SELECT count(*) FROM public.list_trainer_credential_cleanup()
   WHERE storage_path LIKE '%/46666666-6666-4666-8666-666666666666.pdf'),
  1::bigint,
  'pre-upload cleanup job is durably observable'
);
SELECT lives_ok(
  $$SELECT public.finalize_trainer_credential_cleanup((
      SELECT id FROM public.list_trainer_credential_cleanup()
      WHERE storage_path LIKE '%/46666666-6666-4666-8666-666666666666.pdf'
    ))$$,
  'pre-upload cleanup can finalize when upload never created an object'
);
SELECT is(
  (SELECT count(*) FROM public.list_trainer_credential_cleanup()
   WHERE storage_path LIKE '%/46666666-6666-4666-8666-666666666666.pdf'),
  0::bigint,
  'finalized pre-upload cleanup is removed from the outbox'
);
RESET ROLE;
INSERT INTO storage.objects (bucket_id, name, metadata)
VALUES (
  'trainer-credentials',
  '11111111-1111-4111-8111-111111111111/31111111-1111-4111-8111-111111111111/45555555-5555-4555-8555-555555555555.pdf',
  '{"mimetype":"application/pdf","size":3}'::jsonb
);
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.create_trainer_application_credential(
      '45555555-5555-4555-8555-555555555555', '31111111-1111-4111-8111-111111111111',
      'document', 'Valid document', NULL, NULL, NULL, NULL, 'application/pdf', 3
    )$$,
  'credential RPC accepts document metadata backed by the exact storage object'
);
SELECT lives_ok(
  $$SELECT public.prepare_trainer_credential_removal(
      '31111111-1111-4111-8111-111111111111', '45555555-5555-4555-8555-555555555555'
    )$$,
  'document removal first creates durable cleanup state'
);
SELECT is((SELECT count(*) FROM public.trainer_application_credentials WHERE id = '45555555-5555-4555-8555-555555555555'), 1::bigint, 'metadata remains until storage is gone');
SELECT throws_ok(
  $$SELECT public.finalize_trainer_credential_cleanup((
      public.prepare_trainer_credential_removal(
        '31111111-1111-4111-8111-111111111111', '45555555-5555-4555-8555-555555555555'
      )->>'cleanup_id'
    )::uuid)$$,
  'P0001', NULL, 'cleanup cannot finalize while storage object still exists'
);
RESET ROLE;
DELETE FROM storage.objects
WHERE bucket_id = 'trainer-credentials'
  AND name = '11111111-1111-4111-8111-111111111111/31111111-1111-4111-8111-111111111111/45555555-5555-4555-8555-555555555555.pdf';
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.finalize_trainer_credential_cleanup((
      public.prepare_trainer_credential_removal(
        '31111111-1111-4111-8111-111111111111', '45555555-5555-4555-8555-555555555555'
      )->>'cleanup_id'
    )::uuid)$$,
  'retry finalizes metadata after storage removal succeeds'
);
SELECT is((SELECT count(*) FROM public.trainer_application_credentials WHERE id = '45555555-5555-4555-8555-555555555555'), 0::bigint, 'finalized cleanup removes credential metadata');
SELECT lives_ok(
  $$SELECT public.submit_trainer_application('31111111-1111-4111-8111-111111111111')$$,
  'valid complete application submits'
);
RESET ROLE;
SELECT is((SELECT status FROM public.trainer_applications WHERE id = '31111111-1111-4111-8111-111111111111'), 'submitted', 'submit persists status');
SELECT is((SELECT count(*) FROM public.trainer_application_events WHERE application_id = '31111111-1111-4111-8111-111111111111' AND to_status = 'submitted'), 1::bigint, 'submit appends one event');
SELECT is((SELECT count(*) FROM public.product_notifications WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND payload->>'applicationId' = '31111111-1111-4111-8111-111111111111'), 1::bigint, 'submit persists admin notification in the same database');
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.submit_trainer_application('31111111-1111-4111-8111-111111111111')$$,
  'submit retry is idempotent'
);
RESET ROLE;
SELECT is((SELECT count(*) FROM public.trainer_application_events WHERE application_id = '31111111-1111-4111-8111-111111111111' AND to_status = 'submitted'), 1::bigint, 'submit retry does not duplicate event');
SELECT is((SELECT count(*) FROM public.product_notifications WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND payload->>'applicationId' = '31111111-1111-4111-8111-111111111111'), 1::bigint, 'submit retry does not duplicate notification');

SELECT set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.submit_trainer_application('33333333-3333-4333-8333-333333333333')$$,
  'P0001', NULL, 'submit rejects a professional photo that is not the owner avatar'
);
RESET ROLE;
SELECT is((SELECT status FROM public.trainer_applications WHERE id = '33333333-3333-4333-8333-333333333333'), 'draft', 'failed submit leaves status unchanged');
SELECT is((SELECT count(*) FROM public.trainer_application_events WHERE application_id = '33333333-3333-4333-8333-333333333333'), 0::bigint, 'failed submit leaves no event');
SELECT is((SELECT count(*) FROM public.product_notifications WHERE payload->>'applicationId' = '33333333-3333-4333-8333-333333333333'), 0::bigint, 'failed submit leaves no notification');

SELECT set_config('request.jwt.claim.sub', 'ffffffff-ffff-4fff-8fff-ffffffffffff', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE public.trainer_applications
    SET professional_photo_url = 'https://attacker.example.test/null-avatar-bypass.jpg'
    WHERE id = '3fffffff-ffff-4fff-8fff-ffffffffffff'$$,
  'draft owner can directly update the professional photo'
);
SELECT throws_ok(
  $$SELECT public.submit_trainer_application('3fffffff-ffff-4fff-8fff-ffffffffffff')$$,
  'P0001', NULL, 'submit rejects every professional photo when the owner avatar is NULL'
);
RESET ROLE;
SELECT is((SELECT status FROM public.trainer_applications WHERE id = '3fffffff-ffff-4fff-8fff-ffffffffffff'), 'draft', 'NULL-avatar bypass leaves status unchanged');
SELECT is((SELECT count(*) FROM public.trainer_application_events WHERE application_id = '3fffffff-ffff-4fff-8fff-ffffffffffff'), 0::bigint, 'NULL-avatar bypass leaves no event');
SELECT is((SELECT count(*) FROM public.product_notifications WHERE payload->>'applicationId' = '3fffffff-ffff-4fff-8fff-ffffffffffff'), 0::bigint, 'NULL-avatar bypass leaves no notification');

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.withdraw_trainer_application('32222222-2222-4222-8222-222222222222')$$,
  'owner can withdraw an editable application'
);
SELECT lives_ok(
  $$SELECT public.withdraw_trainer_application('32222222-2222-4222-8222-222222222222')$$,
  'withdraw retry is idempotent'
);
RESET ROLE;
SELECT is((SELECT count(*) FROM public.trainer_application_events WHERE application_id = '32222222-2222-4222-8222-222222222222' AND to_status = 'withdrawn'), 1::bigint, 'withdraw retry does not duplicate event');

SELECT dblink_connect('verification_c1', 'dbname=postgres user=supabase_admin');
SELECT dblink_connect('verification_c2', 'dbname=postgres user=supabase_admin');
SELECT dblink_exec('verification_c1', $$SET request.jwt.claim.sub = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'$$);
SELECT dblink_exec('verification_c1', $$SET request.jwt.claim.role = 'authenticated'$$);
SELECT dblink_exec('verification_c1', 'SET ROLE authenticated');
SELECT dblink_exec('verification_c2', $$SET request.jwt.claim.sub = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'$$);
SELECT dblink_exec('verification_c2', $$SET request.jwt.claim.role = 'authenticated'$$);
SELECT dblink_exec('verification_c2', 'SET ROLE authenticated');
SELECT dblink_send_query('verification_c1', $$SELECT public.submit_trainer_application('3ddddddd-dddd-4ddd-8ddd-dddddddddddd')$$);
SELECT dblink_send_query('verification_c2', $$SELECT public.submit_trainer_application('3ddddddd-dddd-4ddd-8ddd-dddddddddddd')$$);
CREATE TEMP TABLE concurrent_submit_results (result JSONB);
INSERT INTO concurrent_submit_results SELECT result FROM dblink_get_result('verification_c1') AS response(result JSONB);
INSERT INTO concurrent_submit_results SELECT result FROM dblink_get_result('verification_c2') AS response(result JSONB);
SELECT is((SELECT count(*) FROM concurrent_submit_results WHERE (result->>'transitioned')::boolean), 1::bigint, 'concurrent submit has exactly one effective transition');
SELECT is((SELECT count(*) FROM public.trainer_application_events WHERE application_id = '3ddddddd-dddd-4ddd-8ddd-dddddddddddd' AND to_status = 'submitted'), 1::bigint, 'concurrent submit creates one event');
SELECT is((SELECT count(*) FROM public.product_notifications WHERE payload->>'applicationId' = '3ddddddd-dddd-4ddd-8ddd-dddddddddddd'), 1::bigint, 'concurrent submit creates one durable notification per admin');
SELECT dblink_disconnect('verification_c1');
SELECT dblink_disconnect('verification_c2');

CREATE OR REPLACE FUNCTION public.fail_notification_after_submission_mutations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.payload->>'applicationId' = '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Injected notification persistence failure.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER fail_notification_after_submission_mutations
  BEFORE INSERT ON public.product_notifications
  FOR EACH ROW EXECUTE FUNCTION public.fail_notification_after_submission_mutations();

SELECT set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.submit_trainer_application('3eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')$$,
  'P0001', NULL, 'notification persistence failure aborts submit after status and event mutations'
);
RESET ROLE;
SELECT is((SELECT status FROM public.trainer_applications WHERE id = '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'), 'draft', 'notification failure rolls back the status transition');
SELECT is((SELECT count(*) FROM public.trainer_application_events WHERE application_id = '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'), 0::bigint, 'notification failure rolls back the appended event');
SELECT is((SELECT count(*) FROM public.product_notifications WHERE payload->>'applicationId' = '3eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'), 0::bigint, 'notification failure leaves no partial notification');
DROP TRIGGER fail_notification_after_submission_mutations ON public.product_notifications;
DROP FUNCTION public.fail_notification_after_submission_mutations();

SELECT * FROM finish();
ROLLBACK;

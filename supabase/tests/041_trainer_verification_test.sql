BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(177);

SELECT has_function('public', 'create_trainer_application_credential', ARRAY['uuid', 'uuid', 'text', 'text', 'text', 'date', 'date', 'text', 'text', 'bigint'], 'credential creation RPC exists');
SELECT has_function('public', 'prepare_trainer_credential_removal', ARRAY['uuid', 'uuid'], 'credential removal preparation RPC exists');
SELECT has_function('public', 'list_trainer_credential_cleanup', ARRAY[]::text[], 'cleanup outbox listing RPC exists');
SELECT has_function('public', 'finalize_trainer_credential_cleanup', ARRAY['uuid'], 'cleanup finalization RPC exists');
SELECT has_table('public', 'trainer_credential_storage_cleanup', 'durable storage cleanup outbox exists');
SELECT has_function('public', 'transition_trainer_application', ARRAY['uuid', 'uuid', 'text', 'jsonb'], 'atomic administrative transition RPC exists');
SELECT ok(
  CASE WHEN to_regprocedure('public.transition_trainer_application(uuid,uuid,text,jsonb)') IS NULL
    THEN FALSE
    ELSE has_function_privilege('service_role', 'public.transition_trainer_application(uuid,uuid,text,jsonb)', 'EXECUTE')
  END,
  'service role can execute administrative transitions'
);
SELECT ok(
  CASE WHEN to_regprocedure('public.transition_trainer_application(uuid,uuid,text,jsonb)') IS NULL
    THEN FALSE
    ELSE NOT has_function_privilege('authenticated', 'public.transition_trainer_application(uuid,uuid,text,jsonb)', 'EXECUTE')
  END,
  'authenticated users cannot execute administrative transitions directly'
);
SELECT has_column('public', 'trainer_applications', 'application_kind', 'applications identify initial and profile-update reviews');
SELECT has_column('public', 'trainer_applications', 'source_profile_id', 'profile updates reference the approved profile');
SELECT has_column('public', 'trainer_applications', 'credential_source_application_id', 'profile updates reference approved credentials without duplication');
SELECT has_function('public', 'save_trainer_profile_changes', ARRAY['jsonb'], 'owner-safe trainer profile save RPC exists');
SELECT has_function('public', 'save_trainer_application_draft', ARRAY['jsonb'], 'atomic initial draft save RPC exists');
SELECT ok(
  CASE WHEN to_regprocedure('public.save_trainer_profile_changes(jsonb)') IS NULL
    THEN FALSE
    ELSE has_function_privilege('authenticated', 'public.save_trainer_profile_changes(jsonb)', 'EXECUTE')
  END,
  'authenticated owners can execute trainer profile save'
);
SELECT ok(
  CASE WHEN to_regprocedure('public.save_trainer_application_draft(jsonb)') IS NULL
    THEN FALSE
    ELSE has_function_privilege('authenticated', 'public.save_trainer_application_draft(jsonb)', 'EXECUTE')
  END,
  'authenticated applicants can execute atomic initial draft save'
);
SELECT ok(
  CASE WHEN to_regprocedure('public.save_trainer_profile_changes(jsonb)') IS NULL
    THEN FALSE
    ELSE NOT has_function_privilege('anon', 'public.save_trainer_profile_changes(jsonb)', 'EXECUTE')
  END,
  'anonymous users cannot execute trainer profile save'
);

SELECT ok(NOT has_table_privilege('authenticated', 'public.trainer_application_credentials', 'INSERT'), 'authenticated cannot bypass credential creation RPC');
SELECT ok(NOT has_table_privilege('authenticated', 'public.trainer_application_credentials', 'UPDATE'), 'authenticated cannot forge credential metadata');
SELECT ok(NOT has_table_privilege('authenticated', 'public.trainer_application_credentials', 'DELETE'), 'authenticated cannot delete metadata before storage cleanup');
SELECT ok(NOT has_table_privilege('authenticated', 'public.trainer_applications', 'DELETE'), 'authenticated cannot cascade-delete credential storage references');
SELECT ok(NOT has_table_privilege('authenticated', 'public.trainer_applications', 'INSERT'), 'authenticated cannot race initial creation outside the atomic RPC');
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
  ('66666666-6666-4666-8666-666666666666', 'verification-approve@example.test', '{}'::jsonb),
  ('77777777-7777-4777-8777-777777777777', 'verification-reject@example.test', '{}'::jsonb),
  ('88888888-8888-4888-8888-888888888888', 'verification-admin-rollback@example.test', '{}'::jsonb),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'verification-interview@example.test', '{}'::jsonb),
  ('12121212-1212-4121-8121-121212121212', 'verification-review-cycle@example.test', '{}'::jsonb),
  ('99999999-9999-4999-8999-999999999999', 'verification-profile-update@example.test', '{}'::jsonb),
  ('90909090-9090-4090-8090-909090909090', 'verification-profile-source-other@example.test', '{}'::jsonb),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'verification-admin@example.test', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, avatar_url, onboarding_done, is_admin, account_status)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'https://cdn.example.test/a.jpg', true, false, 'active'),
  ('22222222-2222-4222-8222-222222222222', 'https://cdn.example.test/b.jpg', true, false, 'active'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'https://cdn.example.test/c.jpg', true, false, 'active'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'https://cdn.example.test/e.jpg', true, false, 'active'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', NULL, true, false, 'active'),
  ('66666666-6666-4666-8666-666666666666', 'https://cdn.example.test/approve.jpg', true, false, 'active'),
  ('77777777-7777-4777-8777-777777777777', 'https://cdn.example.test/reject.jpg', true, false, 'active'),
  ('88888888-8888-4888-8888-888888888888', 'https://cdn.example.test/admin-rollback.jpg', true, false, 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'https://cdn.example.test/interview.jpg', true, false, 'active'),
  ('12121212-1212-4121-8121-121212121212', 'https://cdn.example.test/review-cycle.jpg', true, false, 'active'),
  ('99999999-9999-4999-8999-999999999999', 'https://cdn.example.test/profile-update.jpg', true, false, 'active'),
  ('90909090-9090-4090-8090-909090909090', 'https://cdn.example.test/profile-source-other.jpg', true, false, 'active'),
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
  ),
  (
    '36666666-6666-4666-8666-666666666666', '66666666-6666-4666-8666-666666666666',
    'Approved Trainer', 'https://cdn.example.test/approve.jpg', repeat('bio ', 20), ARRAY['strength'], ARRAY['online'],
    repeat('experience ', 4), NULL, ARRAY['es'], 'approve@example.test', NULL,
    'email', 'America/Havana', 'Weekdays after 14:00'
  ),
  (
    '37777777-7777-4777-8777-777777777777', '77777777-7777-4777-8777-777777777777',
    'Rejected Trainer', 'https://cdn.example.test/reject.jpg', repeat('bio ', 20), ARRAY['mobility'], ARRAY['online'],
    repeat('experience ', 4), NULL, ARRAY['es'], 'reject@example.test', NULL,
    'email', 'America/Havana', 'Weekdays after 14:00'
  ),
  (
    '38888888-8888-4888-8888-888888888888', '88888888-8888-4888-8888-888888888888',
    'Rollback Trainer', 'https://cdn.example.test/admin-rollback.jpg', repeat('bio ', 20), ARRAY['strength'], ARRAY['online'],
    repeat('experience ', 4), NULL, ARRAY['es'], 'admin-rollback@example.test', NULL,
    'email', 'America/Havana', 'Weekdays after 14:00'
  ),
  (
    '3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'Interview Trainer', 'https://cdn.example.test/interview.jpg', repeat('bio ', 20), ARRAY['mobility'], ARRAY['online'],
    repeat('experience ', 4), NULL, ARRAY['es'], 'interview@example.test', NULL,
    'email', 'America/Havana', 'Weekdays after 14:00'
  ),
  (
    '31212121-1212-4121-8121-121212121212', '12121212-1212-4121-8121-121212121212',
    'Review Cycle Trainer', 'https://cdn.example.test/review-cycle.jpg', repeat('bio ', 20), ARRAY['strength'], ARRAY['online'],
    repeat('experience ', 4), NULL, ARRAY['es'], 'review-cycle@example.test', NULL,
    'email', 'America/Havana', 'Weekdays after 14:00'
  ),
  (
    '39999999-9999-4999-8999-999999999999', '99999999-9999-4999-8999-999999999999',
    'Approved Profile Trainer', 'https://cdn.example.test/profile-update.jpg', repeat('approved bio ', 8), ARRAY['strength'], ARRAY['online'],
    'Eight years of approved experience.', 'Old location', ARRAY['es'], 'profile-update@example.test', '+53 5555 9999',
    'email', 'America/Havana', 'Weekdays after 14:00'
  ),
  (
    '39090909-0909-4090-8090-909090909090', '90909090-9090-4090-8090-909090909090',
    'Other Approved Trainer', 'https://cdn.example.test/profile-source-other.jpg', repeat('other bio ', 8), ARRAY['mobility'], ARRAY['online'],
    'Other trainer approved experience.', 'Other location', ARRAY['en'], 'other-source@example.test', NULL,
    'email', 'America/Havana', 'Weekdays after 14:00'
  );

UPDATE public.trainer_applications
SET status = 'under_review', submitted_at = NOW()
WHERE id IN (
  '36666666-6666-4666-8666-666666666666',
  '37777777-7777-4777-8777-777777777777',
  '38888888-8888-4888-8888-888888888888',
  '3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
);

UPDATE public.trainer_applications
SET status = 'submitted', submitted_at = NOW()
WHERE id = '31212121-1212-4121-8121-121212121212';

UPDATE public.trainer_applications
SET status = 'approved', submitted_at = NOW(), decided_at = NOW()
WHERE id IN (
  '39999999-9999-4999-8999-999999999999',
  '39090909-0909-4090-8090-909090909090'
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
  ),
  (
    '41212121-1212-4121-8121-121212121212',
    '31212121-1212-4121-8121-121212121212',
    'link', 'Review cycle certificate', 'https://issuer.example.test/cert/review-cycle'
  ),
  (
    '49999999-9999-4999-8999-999999999999',
    '39999999-9999-4999-8999-999999999999',
    'link', 'Approved profile certificate', 'https://issuer.example.test/cert/profile-update'
  ),
  (
    '49090909-0909-4090-8090-909090909090',
    '39090909-0909-4090-8090-909090909090',
    'link', 'Other approved certificate', 'https://issuer.example.test/cert/other-source'
  );

INSERT INTO public.trainer_profiles (
  id, user_id, source_application_id, slug, status, professional_name,
  professional_photo_url, bio, specialties, modalities, experience_summary,
  general_location, languages
) VALUES (
  '59999999-9999-4999-8999-999999999999',
  '99999999-9999-4999-8999-999999999999',
  '39999999-9999-4999-8999-999999999999',
  'approved-profile-trainer', 'active', 'Approved Profile Trainer',
  'https://cdn.example.test/profile-update.jpg', repeat('approved bio ', 8),
  ARRAY['strength'], ARRAY['online'], 'Eight years of approved experience.',
  'Old location', ARRAY['es']
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

SELECT dblink_connect('initial_draft_race', 'dbname=postgres user=supabase_admin');
SELECT dblink_connect('initial_approve_race', 'dbname=postgres user=supabase_admin');
SELECT dblink_exec('initial_draft_race', $$SET request.jwt.claim.sub = 'abababab-abab-4bab-8bab-abababababab'$$);
SELECT dblink_exec('initial_draft_race', $$SET request.jwt.claim.role = 'authenticated'$$);
SELECT dblink_exec('initial_draft_race', 'SET ROLE authenticated');
SELECT dblink_exec('initial_approve_race', 'SET ROLE service_role');
SELECT dblink_send_query('initial_draft_race', $$SELECT public.save_trainer_application_draft(jsonb_build_object(
  'professional_name', 'Draft Race Trainer',
  'professional_photo_url', 'https://cdn.example.test/ab.jpg',
  'bio', repeat('updated bio ', 8),
  'specialties', jsonb_build_array('strength'),
  'modalities', jsonb_build_array('online'),
  'experience_summary', repeat('updated experience ', 3),
  'general_location', NULL,
  'languages', jsonb_build_array('es'),
  'contact_email', 'ab@example.test',
  'contact_phone', NULL,
  'preferred_contact', 'email',
  'timezone', 'America/Havana',
  'interview_availability', 'Weekdays after 15:00'
))$$);
SELECT dblink_send_query('initial_approve_race', $$SELECT public.transition_trainer_application(
  '3abababa-abab-4aba-8aba-abababababab',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'approve',
  '{"public_note":"Aprobacion concurrente con intento de segundo borrador."}'::jsonb
)$$);
CREATE TEMP TABLE initial_approve_race_result (result JSONB);
INSERT INTO initial_approve_race_result
SELECT result FROM dblink_get_result('initial_approve_race') AS response(result JSONB);
SELECT throws_ok(
  $$SELECT * FROM dblink_get_result('initial_draft_race') AS response(result JSONB)$$,
  'P0001', NULL,
  'atomic draft save loses safely against concurrent initial approval'
);
SELECT is(
  (SELECT count(*) FROM initial_approve_race_result WHERE (result->>'transitioned')::boolean),
  1::bigint,
  'concurrent initial approval still completes exactly once'
);
SELECT is(
  (SELECT count(*) FROM public.trainer_profiles WHERE user_id = 'abababab-abab-4bab-8bab-abababababab'),
  1::bigint,
  'concurrent initial approval creates the trainer profile'
);
SELECT is(
  (SELECT count(*) FROM public.trainer_applications
   WHERE user_id = 'abababab-abab-4bab-8bab-abababababab'
     AND application_kind = 'initial'),
  1::bigint,
  'concurrent draft save leaves no second initial after profile creation'
);
SELECT dblink_disconnect('initial_draft_race');
SELECT dblink_disconnect('initial_approve_race');

SELECT dblink_connect('verification_admin_c1', 'dbname=postgres user=supabase_admin');
SELECT dblink_connect('verification_admin_c2', 'dbname=postgres user=supabase_admin');
SELECT dblink_exec('verification_admin_c1', 'SET ROLE service_role');
SELECT dblink_exec('verification_admin_c2', 'SET ROLE service_role');
SELECT dblink_send_query('verification_admin_c1', $$SELECT public.transition_trainer_application(
  '3ddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'start_review',
  '{}'::jsonb
)$$);
CREATE TEMP TABLE admin_start_review_result (result JSONB);
INSERT INTO admin_start_review_result
SELECT result FROM dblink_get_result('verification_admin_c1') AS response(result JSONB);
SELECT dblink_disconnect('verification_admin_c1');
SELECT dblink_disconnect('verification_admin_c2');
SELECT dblink_connect('verification_admin_c1', 'dbname=postgres user=supabase_admin');
SELECT dblink_connect('verification_admin_c2', 'dbname=postgres user=supabase_admin');
SELECT dblink_exec('verification_admin_c1', 'SET ROLE service_role');
SELECT dblink_exec('verification_admin_c2', 'SET ROLE service_role');
SELECT dblink_send_query('verification_admin_c1', $$SELECT public.transition_trainer_application(
  '3ddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'approve',
  '{"public_note":"Aprobacion concurrente."}'::jsonb
)$$);
SELECT dblink_send_query('verification_admin_c2', $$SELECT public.transition_trainer_application(
  '3ddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'approve',
  '{"public_note":"Aprobacion concurrente."}'::jsonb
)$$);
CREATE TEMP TABLE concurrent_approval_results (result JSONB);
INSERT INTO concurrent_approval_results SELECT result FROM dblink_get_result('verification_admin_c1') AS response(result JSONB);
INSERT INTO concurrent_approval_results SELECT result FROM dblink_get_result('verification_admin_c2') AS response(result JSONB);
SELECT is((SELECT count(*) FROM concurrent_approval_results), 2::bigint, 'both concurrent approval commands return a result');
SELECT is((SELECT count(*) FROM concurrent_approval_results WHERE (result->>'transitioned')::boolean), 1::bigint, 'concurrent approval has exactly one effective transition');
SELECT is((SELECT count(*) FROM public.trainer_profiles WHERE user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' AND status = 'active'), 1::bigint, 'concurrent approval creates one active profile');
SELECT is((SELECT count(*) FROM public.trainer_application_events WHERE application_id = '3ddddddd-dddd-4ddd-8ddd-dddddddddddd' AND to_status = 'approved'), 1::bigint, 'concurrent approval creates one decision event');
SELECT is((SELECT count(*) FROM public.professional_audit_logs WHERE entity_id = '3ddddddd-dddd-4ddd-8ddd-dddddddddddd' AND action = 'trainer_application_approved'), 1::bigint, 'concurrent approval creates one audit row');
SELECT is((SELECT count(*) FROM public.product_notifications WHERE user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' AND dedupe_key = 'trainer-application:3ddddddd-dddd-4ddd-8ddd-dddddddddddd:approved'), 1::bigint, 'concurrent approval creates one notification');
SELECT dblink_disconnect('verification_admin_c1');
SELECT dblink_disconnect('verification_admin_c2');

SELECT dblink_connect('profile_update_c1', 'dbname=postgres user=supabase_admin');
SELECT dblink_connect('profile_update_c2', 'dbname=postgres user=supabase_admin');
SELECT dblink_exec('profile_update_c1', $$SET request.jwt.claim.sub = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'$$);
SELECT dblink_exec('profile_update_c2', $$SET request.jwt.claim.sub = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'$$);
SELECT dblink_exec('profile_update_c1', $$SET request.jwt.claim.role = 'authenticated'$$);
SELECT dblink_exec('profile_update_c2', $$SET request.jwt.claim.role = 'authenticated'$$);
SELECT dblink_exec('profile_update_c1', 'SET ROLE authenticated');
SELECT dblink_exec('profile_update_c2', 'SET ROLE authenticated');
SELECT dblink_send_query('profile_update_c1', $$SELECT public.save_trainer_profile_changes(jsonb_build_object(
  'professionalName', 'Concurrent Reviewed Name',
  'professionalPhotoUrl', 'https://cdn.example.test/concurrent-direct.jpg',
  'bio', repeat('concurrent direct bio ', 4),
  'specialties', jsonb_build_array('strength'),
  'modalities', jsonb_build_array('online'),
  'experienceSummary', 'Concurrent reviewed experience remains pending.',
  'generalLocation', 'Concurrent location',
  'languages', jsonb_build_array('es')
))$$);
SELECT dblink_send_query('profile_update_c2', $$SELECT public.save_trainer_profile_changes(jsonb_build_object(
  'professionalName', 'Concurrent Reviewed Name',
  'professionalPhotoUrl', 'https://cdn.example.test/concurrent-direct.jpg',
  'bio', repeat('concurrent direct bio ', 4),
  'specialties', jsonb_build_array('strength'),
  'modalities', jsonb_build_array('online'),
  'experienceSummary', 'Concurrent reviewed experience remains pending.',
  'generalLocation', 'Concurrent location',
  'languages', jsonb_build_array('es')
))$$);
CREATE TEMP TABLE concurrent_profile_update_results (result JSONB);
INSERT INTO concurrent_profile_update_results SELECT result FROM dblink_get_result('profile_update_c1') AS response(result JSONB);
INSERT INTO concurrent_profile_update_results SELECT result FROM dblink_get_result('profile_update_c2') AS response(result JSONB);
SELECT is((SELECT count(*) FROM concurrent_profile_update_results), 2::bigint, 'both concurrent profile saves return a result');
SELECT is((SELECT count(*) FROM concurrent_profile_update_results WHERE (result->>'review_created')::boolean), 1::bigint, 'exactly one concurrent profile save creates the review');
SELECT is(
  (SELECT count(*) FROM public.trainer_applications
   WHERE user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
     AND application_kind = 'profile_update'
     AND status = 'submitted'),
  1::bigint,
  'concurrent profile saves create one open review'
);
SELECT is(
  (SELECT count(*) FROM public.product_notifications notification
   JOIN public.trainer_applications application
     ON notification.payload->>'applicationId' = application.id::text
   WHERE application.user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
     AND application.application_kind = 'profile_update'),
  1::bigint,
  'concurrent profile saves create one deduplicated administrative notification'
);
SELECT dblink_disconnect('profile_update_c1');
SELECT dblink_disconnect('profile_update_c2');

SELECT dblink_connect('mixed_profile_admin', 'dbname=postgres user=supabase_admin');
SELECT dblink_exec('mixed_profile_admin', 'SET ROLE service_role');
SELECT dblink_send_query('mixed_profile_admin', $$SELECT public.transition_trainer_application(
  (SELECT id FROM public.trainer_applications
   WHERE user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
     AND application_kind = 'profile_update'
     AND status = 'submitted'),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'start_review',
  '{}'::jsonb
)$$);
CREATE TEMP TABLE mixed_profile_start_result (result JSONB);
INSERT INTO mixed_profile_start_result
SELECT result FROM dblink_get_result('mixed_profile_admin') AS response(result JSONB);
SELECT dblink_disconnect('mixed_profile_admin');

SELECT dblink_connect('mixed_profile_save', 'dbname=postgres user=supabase_admin');
SELECT dblink_connect('mixed_profile_approve', 'dbname=postgres user=supabase_admin');
SELECT dblink_exec('mixed_profile_save', $$SET request.jwt.claim.sub = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'$$);
SELECT dblink_exec('mixed_profile_save', $$SET request.jwt.claim.role = 'authenticated'$$);
SELECT dblink_exec('mixed_profile_save', 'SET ROLE authenticated');
SELECT dblink_exec('mixed_profile_approve', 'SET ROLE service_role');
SELECT dblink_send_query('mixed_profile_save', $$SELECT public.save_trainer_profile_changes(jsonb_build_object(
  'professionalName', 'Concurrent Reviewed Name',
  'professionalPhotoUrl', 'https://cdn.example.test/mixed-concurrent-direct.jpg',
  'bio', repeat('mixed concurrent direct bio ', 3),
  'specialties', jsonb_build_array('strength'),
  'modalities', jsonb_build_array('online'),
  'experienceSummary', 'Concurrent reviewed experience remains pending.',
  'generalLocation', 'Mixed concurrent location',
  'languages', jsonb_build_array('es', 'en')
))$$);
SELECT dblink_send_query('mixed_profile_approve', $$SELECT public.transition_trainer_application(
  (SELECT id FROM public.trainer_applications
   WHERE user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
     AND application_kind = 'profile_update'
     AND status = 'under_review'),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'approve',
  '{"public_note":"Aprobacion concurrente con guardado directo."}'::jsonb
)$$);
CREATE TEMP TABLE mixed_profile_results (operation TEXT, result JSONB);
INSERT INTO mixed_profile_results SELECT 'save', result FROM dblink_get_result('mixed_profile_save') AS response(result JSONB);
INSERT INTO mixed_profile_results SELECT 'approve', result FROM dblink_get_result('mixed_profile_approve') AS response(result JSONB);
SELECT is((SELECT count(*) FROM mixed_profile_results), 2::bigint, 'concurrent direct save and profile approval both complete without deadlock');
SELECT is(
  (SELECT status FROM public.trainer_applications
   WHERE user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
     AND application_kind = 'profile_update'),
  'approved',
  'mixed save and approval leaves the reviewed application approved'
);
SELECT is(
  (SELECT concat_ws('|', professional_name, professional_photo_url, array_to_string(languages, ','))
   FROM public.trainer_profiles WHERE user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'Concurrent Reviewed Name|https://cdn.example.test/mixed-concurrent-direct.jpg|es,en',
  'mixed save and approval applies reviewed fields and preserves direct fields'
);
SELECT dblink_disconnect('mixed_profile_save');
SELECT dblink_disconnect('mixed_profile_approve');

SELECT set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.trainer_applications (
    id, user_id, professional_name, professional_photo_url, bio, specialties, modalities,
    experience_summary, languages, contact_email, preferred_contact, timezone, interview_availability
  ) VALUES (
    '3d1ddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'Forbidden Second Initial', 'https://cdn.example.test/d.jpg', repeat('second bio ', 6),
    ARRAY['strength'], ARRAY['online'], repeat('second experience ', 3), ARRAY['es'],
    'd@example.test', 'email', 'America/Havana', 'Weekdays'
  )$$,
  '42501', NULL, 'RLS blocks creating a second initial application after any trainer profile exists'
);
RESET ROLE;
DELETE FROM public.trainer_applications
WHERE id = '3d1ddddd-dddd-4ddd-8ddd-dddddddddddd';

INSERT INTO public.trainer_applications (
  id, user_id, application_kind, status, professional_name, professional_photo_url, bio,
  specialties, modalities, experience_summary, languages, contact_email, preferred_contact,
  timezone, interview_availability
) VALUES (
  '3d2ddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'initial', 'draft', 'Manual Second Initial', 'https://cdn.example.test/d.jpg', repeat('second bio ', 6),
  ARRAY['strength'], ARRAY['online'], repeat('second experience ', 3), ARRAY['es'],
  'd@example.test', 'email', 'America/Havana', 'Weekdays'
);
INSERT INTO public.trainer_application_credentials (
  id, application_id, credential_type, title, external_url
) VALUES (
  '4d2ddddd-dddd-4ddd-8ddd-dddddddddddd', '3d2ddddd-dddd-4ddd-8ddd-dddddddddddd',
  'link', 'Manual second initial credential', 'https://issuer.example.test/second-initial'
);

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.submit_trainer_application('3d2ddddd-dddd-4ddd-8ddd-dddddddddddd')$$,
  '42501', NULL, 'submit rejects a second initial application when any trainer profile exists'
);
RESET ROLE;
SELECT is(
  (SELECT status FROM public.trainer_applications WHERE id = '3d2ddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'draft',
  'failed second-initial submit preserves draft state'
);

UPDATE public.trainer_applications SET status = 'under_review'
WHERE id = '3d2ddddd-dddd-4ddd-8ddd-dddddddddddd';
SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$SELECT public.transition_trainer_application(
    '3d2ddddd-dddd-4ddd-8ddd-dddddddddddd',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'approve',
    '{"public_note":"No debe reemplazar el perfil existente."}'::jsonb
  )$$,
  '42501', NULL, 'approval rejects a second initial application if a trainer profile appeared before decision'
);
RESET ROLE;
SELECT is(
  (SELECT status FROM public.trainer_applications WHERE id = '3d2ddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'under_review',
  'failed second-initial approval preserves application state'
);
SELECT is(
  (SELECT concat_ws('|', status, professional_name, source_application_id)
   FROM public.trainer_profiles WHERE user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'active|Concurrent Reviewed Name|' ||
    (SELECT id::text FROM public.trainer_applications
     WHERE user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
       AND application_kind = 'profile_update' AND status = 'approved'),
  'failed second-initial approval preserves the existing trainer profile'
);

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

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.transition_trainer_application(
      '36666666-6666-4666-8666-666666666666',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'approve',
      '{"public_note":"Aprobada."}'::jsonb
    )$$,
  '42501', NULL, 'even an authenticated admin cannot invoke the service-only transition RPC'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$SELECT public.transition_trainer_application(
      '36666666-6666-4666-8666-666666666666',
      '66666666-6666-4666-8666-666666666666',
      'approve',
      '{"public_note":"Forged actor."}'::jsonb
    )$$,
  '42501', NULL, 'RPC rejects a non-admin actor even from the service boundary'
);
SELECT throws_ok(
  $$SELECT public.transition_trainer_application(
      '3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'request_changes',
      '{}'::jsonb
    )$$,
  'P0001', NULL, 'requesting changes requires a public note in the RPC'
);
SELECT is((SELECT status FROM public.trainer_applications WHERE id = '3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'under_review', 'invalid change request leaves application status unchanged');
SELECT throws_ok(
  $$SELECT public.transition_trainer_application(
      '3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'schedule_interview',
      jsonb_build_object(
        'interview_id', '5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'proposed_at', NOW() - INTERVAL '1 minute',
        'timezone', 'America/Havana',
        'medium', 'video_call'
      )
    )$$,
  'P0001', NULL, 'RPC rejects an interview that is not in the future'
);
SELECT throws_ok(
  $$SELECT public.transition_trainer_application(
      '3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'schedule_interview',
      jsonb_build_object(
        'interview_id', '5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'proposed_at', NOW() + INTERVAL '1 day',
        'timezone', 'America/Havana',
        'medium', 'video_call',
        'external_url', 'http://meet.example.test/insecure'
      )
    )$$,
  'P0001', NULL, 'RPC rejects a non-HTTPS external interview URL'
);
SELECT lives_ok(
  $$SELECT public.transition_trainer_application(
      '3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'schedule_interview',
      jsonb_build_object(
        'interview_id', '5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'proposed_at', NOW() + INTERVAL '1 day',
        'timezone', 'America/Havana',
        'medium', 'video_call',
        'external_url', 'https://meet.example.test/interview',
        'public_note', 'Usaremos coordinacion externa.',
        'internal_note', 'Contexto solo administrativo.'
      )
    )$$,
  'administrator can schedule an external interview'
);
SELECT lives_ok(
  $$SELECT public.transition_trainer_application(
      '3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'schedule_interview',
      jsonb_build_object(
        'interview_id', '5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'proposed_at', NOW() + INTERVAL '1 day',
        'timezone', 'America/Havana',
        'medium', 'video_call',
        'external_url', 'https://meet.example.test/interview',
        'public_note', 'Usaremos coordinacion externa.',
        'internal_note', 'Contexto solo administrativo.'
      )
    )$$,
  'scheduling retry with the same interview ID is idempotent'
);
RESET ROLE;
SELECT is((SELECT count(*) FROM public.trainer_interviews WHERE id = '5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 1::bigint, 'interview retry creates exactly one interview');
SELECT is((SELECT status FROM public.trainer_applications WHERE id = '3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'interview_required', 'scheduling marks the application as interview required');
SELECT is((SELECT count(*) FROM public.product_notifications WHERE user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND dedupe_key = 'trainer-interview:5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:scheduled'), 1::bigint, 'interview scheduling notification is deduplicated by interview ID');
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$SELECT public.transition_trainer_application(
      '3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'record_interview_outcome',
      jsonb_build_object(
        'interview_id', '5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'interview_status', 'completed',
        'outcome', 'La experiencia declarada fue confirmada.',
        'public_note', 'Entrevista completada.'
      )
    )$$,
  'administrator can record an interview outcome'
);
SELECT lives_ok(
  $$SELECT public.transition_trainer_application(
      '3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'record_interview_outcome',
      jsonb_build_object(
        'interview_id', '5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'interview_status', 'completed',
        'outcome', 'La experiencia declarada fue confirmada.',
        'public_note', 'Entrevista completada.'
      )
    )$$,
  'interview outcome retry is idempotent'
);
RESET ROLE;
SELECT is((SELECT status || '|' || outcome FROM public.trainer_interviews WHERE id = '5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'completed|La experiencia declarada fue confirmada.', 'interview result persists once');

SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$SELECT public.transition_trainer_application(
      '31212121-1212-4121-8121-121212121212',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'start_review',
      '{}'::jsonb
    )$$,
  'administrator can start the first review cycle'
);
SELECT lives_ok(
  $$SELECT public.transition_trainer_application(
      '31212121-1212-4121-8121-121212121212',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'start_review',
      '{}'::jsonb
    )$$,
  'first review start retry is idempotent'
);
SELECT lives_ok(
  $$SELECT public.transition_trainer_application(
      '31212121-1212-4121-8121-121212121212',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'request_changes',
      '{"public_note":"Aclara la experiencia del primer ciclo."}'::jsonb
    )$$,
  'administrator can request changes in the first cycle'
);
SELECT lives_ok(
  $$SELECT public.transition_trainer_application(
      '31212121-1212-4121-8121-121212121212',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'request_changes',
      '{"public_note":"Aclara la experiencia del primer ciclo."}'::jsonb
    )$$,
  'first change request retry is idempotent'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '12121212-1212-4121-8121-121212121212', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.submit_trainer_application('31212121-1212-4121-8121-121212121212')$$,
  'applicant can resubmit between review cycles'
);
SELECT lives_ok(
  $$SELECT public.submit_trainer_application('31212121-1212-4121-8121-121212121212')$$,
  'resubmission retry is idempotent'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$SELECT public.transition_trainer_application(
      '31212121-1212-4121-8121-121212121212',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'start_review',
      '{}'::jsonb
    )$$,
  'administrator can start the second review cycle'
);
SELECT lives_ok(
  $$SELECT public.transition_trainer_application(
      '31212121-1212-4121-8121-121212121212',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'start_review',
      '{}'::jsonb
    )$$,
  'second review start retry is idempotent'
);
SELECT lives_ok(
  $$SELECT public.transition_trainer_application(
      '31212121-1212-4121-8121-121212121212',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'request_changes',
      '{"public_note":"Aclara la experiencia del segundo ciclo."}'::jsonb
    )$$,
  'administrator can request changes in the second cycle'
);
SELECT lives_ok(
  $$SELECT public.transition_trainer_application(
      '31212121-1212-4121-8121-121212121212',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'request_changes',
      '{"public_note":"Aclara la experiencia del segundo ciclo."}'::jsonb
    )$$,
  'second change request retry is idempotent'
);
RESET ROLE;
SELECT is((SELECT count(*) FROM public.trainer_application_events WHERE application_id = '31212121-1212-4121-8121-121212121212' AND to_status = 'under_review'), 2::bigint, 'two review cycles append two under-review events');
SELECT is((SELECT count(*) FROM public.trainer_application_events WHERE application_id = '31212121-1212-4121-8121-121212121212' AND to_status = 'changes_requested'), 2::bigint, 'two review cycles append two change-request events');
SELECT is((SELECT count(*) FROM public.product_notifications WHERE user_id = '12121212-1212-4121-8121-121212121212' AND payload->>'status' = 'under_review'), 2::bigint, 'two legitimate review starts create two applicant notifications');
SELECT is((SELECT count(*) FROM public.product_notifications WHERE user_id = '12121212-1212-4121-8121-121212121212' AND payload->>'status' = 'changes_requested'), 2::bigint, 'two legitimate change requests create two applicant notifications');
SELECT is((
  SELECT count(DISTINCT dedupe_key)
  FROM public.product_notifications
  WHERE user_id = '12121212-1212-4121-8121-121212121212'
    AND payload->>'status' IN ('under_review', 'changes_requested')
), 4::bigint, 'repeatable transitions use one distinct notification key per event without retry duplicates');

SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$SELECT public.transition_trainer_application(
      '36666666-6666-4666-8666-666666666666',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'approve',
      '{"public_note":"Solicitud aprobada."}'::jsonb
    )$$,
  'administrator can approve an application'
);
SELECT lives_ok(
  $$SELECT public.transition_trainer_application(
      '36666666-6666-4666-8666-666666666666',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'approve',
      '{"public_note":"Solicitud aprobada."}'::jsonb
    )$$,
  'approval retry is idempotent'
);
RESET ROLE;
SELECT is((SELECT status FROM public.trainer_applications WHERE id = '36666666-6666-4666-8666-666666666666'), 'approved', 'approval persists terminal status');
SELECT is((SELECT count(*) FROM public.trainer_profiles WHERE user_id = '66666666-6666-4666-8666-666666666666' AND status = 'active'), 1::bigint, 'approval creates exactly one active trainer profile');
SELECT is((SELECT count(*) FROM public.trainer_application_events WHERE application_id = '36666666-6666-4666-8666-666666666666' AND to_status = 'approved'), 1::bigint, 'approval appends exactly one event');
SELECT is((SELECT count(*) FROM public.professional_audit_logs WHERE entity_id = '36666666-6666-4666-8666-666666666666' AND action = 'trainer_application_approved'), 1::bigint, 'approval appends exactly one audit row');
SELECT is((SELECT count(*) FROM public.product_notifications WHERE user_id = '66666666-6666-4666-8666-666666666666' AND dedupe_key = 'trainer-application:36666666-6666-4666-8666-666666666666:approved'), 1::bigint, 'approval persists one deduplicated applicant notification');

SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$SELECT public.transition_trainer_application(
      '37777777-7777-4777-8777-777777777777',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'reject',
      '{"public_note":"No cumple los requisitos publicados."}'::jsonb
    )$$,
  'administrator can reject with a public reason'
);
RESET ROLE;
SELECT is((SELECT status FROM public.trainer_applications WHERE id = '37777777-7777-4777-8777-777777777777'), 'rejected', 'rejection persists terminal status');
SELECT is((SELECT count(*) FROM public.trainer_profiles WHERE user_id = '77777777-7777-4777-8777-777777777777'), 0::bigint, 'rejection never creates a trainer profile');
SELECT is((SELECT count(*) FROM public.product_notifications WHERE user_id = '77777777-7777-4777-8777-777777777777' AND dedupe_key = 'trainer-application:37777777-7777-4777-8777-777777777777:rejected'), 1::bigint, 'rejection preserves the exact terminal dedupe key');

CREATE OR REPLACE FUNCTION public.fail_admin_decision_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.dedupe_key = 'trainer-application:38888888-8888-4888-8888-888888888888:approved' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Injected administrative notification failure.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER fail_admin_decision_notification
  BEFORE INSERT ON public.product_notifications
  FOR EACH ROW EXECUTE FUNCTION public.fail_admin_decision_notification();
SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$SELECT public.transition_trainer_application(
      '38888888-8888-4888-8888-888888888888',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'approve',
      '{"public_note":"Rollback completo."}'::jsonb
    )$$,
  'P0001', NULL, 'notification failure aborts the entire administrative decision'
);
RESET ROLE;
SELECT is((SELECT status FROM public.trainer_applications WHERE id = '38888888-8888-4888-8888-888888888888'), 'under_review', 'failed approval rolls back application status');
SELECT is((SELECT count(*) FROM public.trainer_profiles WHERE user_id = '88888888-8888-4888-8888-888888888888'), 0::bigint, 'failed approval rolls back trainer profile');
SELECT is((SELECT count(*) FROM public.trainer_application_events WHERE application_id = '38888888-8888-4888-8888-888888888888'), 0::bigint, 'failed approval rolls back event');
SELECT is((SELECT count(*) FROM public.professional_audit_logs WHERE entity_id = '38888888-8888-4888-8888-888888888888'), 0::bigint, 'failed approval rolls back audit');
SELECT is((SELECT count(*) FROM public.product_notifications WHERE payload->>'applicationId' = '38888888-8888-4888-8888-888888888888'), 0::bigint, 'failed approval leaves no notification');
DROP TRIGGER fail_admin_decision_notification ON public.product_notifications;
DROP FUNCTION public.fail_admin_decision_notification();

SELECT set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.save_trainer_profile_changes(jsonb_build_object(
    'professionalName', 'Updated Name Pending Review',
    'professionalPhotoUrl', 'https://cdn.example.test/profile-update-new.jpg',
    'bio', repeat('direct bio ', 8),
    'specialties', jsonb_build_array('strength', 'mobility'),
    'modalities', jsonb_build_array('online', 'hybrid'),
    'experienceSummary', 'Updated experience pending administrative review.',
    'generalLocation', 'New location',
    'languages', jsonb_build_array('es', 'en')
  ))$$,
  'active trainer can save direct fields and submit reviewed changes'
);
RESET ROLE;
SELECT is(
  (SELECT concat_ws('|', professional_photo_url, bio, general_location, array_to_string(languages, ','))
   FROM public.trainer_profiles WHERE id = '59999999-9999-4999-8999-999999999999'),
  'https://cdn.example.test/profile-update-new.jpg|' || btrim(repeat('direct bio ', 8)) || '|New location|es,en',
  'direct profile fields update immediately'
);
SELECT is(
  (SELECT concat_ws('|', professional_name, array_to_string(specialties, ','), array_to_string(modalities, ','), experience_summary)
   FROM public.trainer_profiles WHERE id = '59999999-9999-4999-8999-999999999999'),
  'Approved Profile Trainer|strength|online|Eight years of approved experience.',
  'reviewed profile fields remain approved while review is pending'
);
SELECT is(
  (SELECT count(*) FROM public.trainer_applications
   WHERE user_id = '99999999-9999-4999-8999-999999999999'
     AND application_kind = 'profile_update'
     AND status = 'submitted'),
  1::bigint,
  'profile change creates one submitted profile-update review'
);
SELECT is(
  (SELECT concat_ws('|', source_profile_id, credential_source_application_id, application_kind, status)
   FROM public.trainer_applications
   WHERE user_id = '99999999-9999-4999-8999-999999999999'
     AND application_kind = 'profile_update'),
  '59999999-9999-4999-8999-999999999999|39999999-9999-4999-8999-999999999999|profile_update|submitted',
  'profile-update review references its active profile and approved credential source'
);
SELECT is(
  (SELECT concat_ws('|', professional_name, professional_photo_url, bio, contact_email, contact_phone, timezone)
   FROM public.trainer_applications
   WHERE user_id = '99999999-9999-4999-8999-999999999999'
     AND application_kind = 'profile_update'),
  'Updated Name Pending Review|https://cdn.example.test/profile-update-new.jpg|' || btrim(repeat('direct bio ', 8)) || '|profile-update@example.test|+53 5555 9999|America/Havana',
  'review stores a complete profile snapshot with contact copied from the approved source'
);
SELECT is(
  (SELECT count(*) FROM public.trainer_application_credentials credential
   JOIN public.trainer_applications application ON application.id = credential.application_id
   WHERE application.user_id = '99999999-9999-4999-8999-999999999999'
     AND application.application_kind = 'profile_update'),
  0::bigint,
  'profile review does not duplicate credential metadata'
);
SELECT is(
  (SELECT count(*) FROM public.trainer_application_credentials credential
   JOIN public.trainer_applications review
     ON review.credential_source_application_id = credential.application_id
   WHERE review.user_id = '99999999-9999-4999-8999-999999999999'
     AND review.application_kind = 'profile_update'),
  1::bigint,
  'profile review resolves the approved source credential by reference'
);
SELECT is(
  (SELECT count(*) FROM public.trainer_application_events event
   JOIN public.trainer_applications application ON application.id = event.application_id
   WHERE application.user_id = '99999999-9999-4999-8999-999999999999'
     AND application.application_kind = 'profile_update'
     AND event.to_status = 'submitted'),
  1::bigint,
  'profile review appends one submitted event'
);
SELECT is(
  (SELECT count(*) FROM public.product_notifications notification
   JOIN public.trainer_applications application
     ON notification.payload->>'applicationId' = application.id::text
   WHERE application.user_id = '99999999-9999-4999-8999-999999999999'
     AND application.application_kind = 'profile_update'),
  1::bigint,
  'profile review creates one deduplicated administrative notification'
);

SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.save_trainer_profile_changes(jsonb_build_object(
    'professionalName', 'Updated Name Reused Review',
    'professionalPhotoUrl', 'https://cdn.example.test/profile-update-new.jpg',
    'bio', repeat('direct bio ', 8),
    'specialties', jsonb_build_array('strength'),
    'modalities', jsonb_build_array('hybrid'),
    'experienceSummary', 'Updated experience in the same submitted review.',
    'generalLocation', 'New location',
    'languages', jsonb_build_array('es', 'en')
  ))$$,
  'a submitted profile-update review is safely reused'
);
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.trainer_applications
   WHERE user_id = '99999999-9999-4999-8999-999999999999'
     AND application_kind = 'profile_update'
     AND status = 'submitted'),
  1::bigint,
  'reuse preserves the single open profile review'
);
SELECT is(
  (SELECT count(*) FROM public.product_notifications notification
   JOIN public.trainer_applications application
     ON notification.payload->>'applicationId' = application.id::text
   WHERE application.user_id = '99999999-9999-4999-8999-999999999999'
     AND application.application_kind = 'profile_update'),
  1::bigint,
  'reuse keeps the administrative notification deduplicated'
);

SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.save_trainer_profile_changes(jsonb_build_object(
    'professionalName', 'Approved Profile Trainer',
    'professionalPhotoUrl', 'https://cdn.example.test/reverted-direct.jpg',
    'bio', repeat('reverted direct bio ', 5),
    'specialties', jsonb_build_array('strength'),
    'modalities', jsonb_build_array('online'),
    'experienceSummary', 'Eight years of approved experience.',
    'generalLocation', 'Reverted direct location',
    'languages', jsonb_build_array('es')
  ))$$,
  'owner can revert an editable reviewed proposal to approved values'
);
RESET ROLE;
SELECT is(
  (SELECT status FROM public.trainer_applications
   WHERE user_id = '99999999-9999-4999-8999-999999999999'
     AND application_kind = 'profile_update'
     AND status = 'withdrawn'),
  'withdrawn',
  'reverting reviewed fields withdraws the stale proposal'
);
SELECT is(
  (SELECT count(*) FROM public.trainer_applications
   WHERE user_id = '99999999-9999-4999-8999-999999999999'
     AND application_kind = 'profile_update'
     AND status IN ('draft', 'submitted', 'under_review', 'changes_requested', 'interview_required')),
  0::bigint,
  'reverting reviewed fields leaves no open profile review'
);

SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.save_trainer_profile_changes(jsonb_build_object(
    'professionalName', 'Updated Name Recreated Review',
    'professionalPhotoUrl', 'https://cdn.example.test/reverted-direct.jpg',
    'bio', repeat('reverted direct bio ', 5),
    'specialties', jsonb_build_array('strength', 'mobility'),
    'modalities', jsonb_build_array('hybrid'),
    'experienceSummary', 'Recreated reviewed experience after reverting the prior proposal.',
    'generalLocation', 'Reverted direct location',
    'languages', jsonb_build_array('es')
  ))$$,
  'a later reviewed change creates a fresh profile review'
);
RESET ROLE;

UPDATE public.trainer_applications SET status = 'changes_requested'
WHERE user_id = '99999999-9999-4999-8999-999999999999'
  AND application_kind = 'profile_update'
  AND status = 'submitted';
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.queue_trainer_credential_cleanup(
    (SELECT id FROM public.trainer_applications
     WHERE user_id = '99999999-9999-4999-8999-999999999999'
       AND application_kind = 'profile_update' AND status = 'changes_requested'),
    '40999999-9999-4999-8999-999999999999',
    '99999999-9999-4999-8999-999999999999/40999999-9999-4999-8999-999999999999/40999999-9999-4999-8999-999999999999.pdf'
  )$$,
  '42501', NULL, 'profile updates cannot queue new credential storage objects'
);
SELECT throws_ok(
  $$SELECT public.create_trainer_application_credential(
    '40999999-9999-4999-8999-999999999999',
    (SELECT id FROM public.trainer_applications
     WHERE user_id = '99999999-9999-4999-8999-999999999999'
       AND application_kind = 'profile_update' AND status = 'changes_requested'),
    'link', 'Forbidden duplicate credential', NULL, NULL, NULL,
    'https://issuer.example.test/forbidden-duplicate', NULL, NULL
  )$$,
  '42501', NULL, 'profile updates cannot create duplicate credential metadata'
);
SELECT throws_ok(
  $$SELECT public.prepare_trainer_credential_removal(
    (SELECT id FROM public.trainer_applications
     WHERE user_id = '99999999-9999-4999-8999-999999999999'
       AND application_kind = 'profile_update' AND status = 'changes_requested'),
    '49999999-9999-4999-8999-999999999999'
  )$$,
  '42501', NULL, 'profile updates cannot remove referenced credential metadata'
);
RESET ROLE;
UPDATE public.trainer_applications SET status = 'submitted'
WHERE user_id = '99999999-9999-4999-8999-999999999999'
  AND application_kind = 'profile_update'
  AND status = 'changes_requested';

UPDATE public.trainer_profiles SET status = 'suspended'
WHERE id = '59999999-9999-4999-8999-999999999999';
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.save_trainer_profile_changes(jsonb_build_object(
    'professionalName', 'Invalid Source Review',
    'professionalPhotoUrl', 'https://cdn.example.test/profile-update-new.jpg',
    'bio', repeat('valid direct bio ', 6),
    'specialties', jsonb_build_array('strength'),
    'modalities', jsonb_build_array('online'),
    'experienceSummary', 'A valid changed experience for source validation.',
    'generalLocation', 'New location',
    'languages', jsonb_build_array('es')
  ))$$,
  '42501', NULL, 'profile save rejects a trainer profile that is not active'
);
RESET ROLE;
UPDATE public.trainer_profiles SET status = 'active'
WHERE id = '59999999-9999-4999-8999-999999999999';

UPDATE public.trainer_profiles
SET source_application_id = '39090909-0909-4090-8090-909090909090'
WHERE id = '59999999-9999-4999-8999-999999999999';
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.save_trainer_profile_changes(jsonb_build_object(
    'professionalName', 'Invalid Approved Source Review',
    'professionalPhotoUrl', 'https://cdn.example.test/profile-update-new.jpg',
    'bio', repeat('valid direct bio ', 6),
    'specialties', jsonb_build_array('strength'),
    'modalities', jsonb_build_array('online'),
    'experienceSummary', 'A valid changed experience for approval validation.',
    'generalLocation', 'New location',
    'languages', jsonb_build_array('es')
  ))$$,
  '42501', NULL, 'profile save rejects an approved source owned by another trainer'
);
RESET ROLE;
UPDATE public.trainer_profiles
SET source_application_id = '39999999-9999-4999-8999-999999999999'
WHERE id = '59999999-9999-4999-8999-999999999999';

UPDATE public.trainer_applications SET status = 'rejected'
WHERE id = '39999999-9999-4999-8999-999999999999';
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.save_trainer_profile_changes(jsonb_build_object(
    'professionalName', 'Invalid Credential Source Review',
    'professionalPhotoUrl', 'https://cdn.example.test/profile-update-new.jpg',
    'bio', repeat('valid direct bio ', 6),
    'specialties', jsonb_build_array('strength'),
    'modalities', jsonb_build_array('online'),
    'experienceSummary', 'A valid changed experience for credential validation.',
    'generalLocation', 'New location',
    'languages', jsonb_build_array('es')
  ))$$,
  '42501', NULL, 'profile save rejects a credential source that is no longer approved'
);
RESET ROLE;
UPDATE public.trainer_applications SET status = 'approved'
WHERE id = '39999999-9999-4999-8999-999999999999';

DELETE FROM public.trainer_application_credentials
WHERE id = '49999999-9999-4999-8999-999999999999';
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.save_trainer_profile_changes(jsonb_build_object(
    'professionalName', 'Invalid Missing Credential Review',
    'professionalPhotoUrl', 'https://cdn.example.test/profile-update-new.jpg',
    'bio', repeat('valid direct bio ', 6),
    'specialties', jsonb_build_array('strength'),
    'modalities', jsonb_build_array('online'),
    'experienceSummary', 'A valid changed experience for missing credential validation.',
    'generalLocation', 'New location',
    'languages', jsonb_build_array('es')
  ))$$,
  '42501', NULL, 'profile save rejects an approved source without credentials'
);
RESET ROLE;
INSERT INTO public.trainer_application_credentials (
  id, application_id, credential_type, title, external_url
) VALUES (
  '49999999-9999-4999-8999-999999999999',
  '39999999-9999-4999-8999-999999999999',
  'link', 'Approved profile certificate', 'https://issuer.example.test/cert/profile-update'
);

SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.save_trainer_profile_changes(jsonb_build_object(
    'professionalName', 'Updated Name Recreated Review',
    'professionalPhotoUrl', 'https://cdn.example.test/latest-direct.jpg',
    'bio', repeat('latest direct bio ', 6),
    'specialties', jsonb_build_array('strength', 'mobility'),
    'modalities', jsonb_build_array('hybrid'),
    'experienceSummary', 'Recreated reviewed experience after reverting the prior proposal.',
    'generalLocation', 'Latest direct location',
    'languages', jsonb_build_array('es', 'fr')
  ))$$,
  'direct fields can change again while a sensitive review remains pending'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$SELECT public.transition_trainer_application(
    (SELECT id FROM public.trainer_applications
     WHERE user_id = '99999999-9999-4999-8999-999999999999'
       AND application_kind = 'profile_update'
       AND status = 'submitted'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'start_review',
    '{}'::jsonb
  )$$,
  'administrator can start review of a profile update'
);
SELECT set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.save_trainer_profile_changes(jsonb_build_object(
    'professionalName', 'Approved Profile Trainer',
    'professionalPhotoUrl', 'https://cdn.example.test/latest-direct.jpg',
    'bio', repeat('latest direct bio ', 6),
    'specialties', jsonb_build_array('strength'),
    'modalities', jsonb_build_array('online'),
    'experienceSummary', 'Eight years of approved experience.',
    'generalLocation', NULL,
    'languages', jsonb_build_array('es', 'fr')
  ))$$,
  'P0001',
    'General location is required while approved or pending modalities include in-person or hybrid coaching.',
  'direct save validates location against the locked effective pending modalities'
);
RESET ROLE;
SELECT is(
  (SELECT general_location FROM public.trainer_profiles
   WHERE id = '59999999-9999-4999-8999-999999999999'),
  'Latest direct location',
  'failed direct location removal preserves the approved profile location'
);

UPDATE public.trainer_profiles SET modalities = ARRAY['hybrid']
WHERE id = '59999999-9999-4999-8999-999999999999';
UPDATE public.trainer_applications SET modalities = ARRAY['online']
WHERE user_id = '99999999-9999-4999-8999-999999999999'
  AND application_kind = 'profile_update'
  AND status = 'under_review';
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.save_trainer_profile_changes(jsonb_build_object(
    'professionalName', 'Approved Profile Trainer',
    'professionalPhotoUrl', 'https://cdn.example.test/latest-direct.jpg',
    'bio', repeat('latest direct bio ', 6),
    'specialties', jsonb_build_array('strength'),
    'modalities', jsonb_build_array('online'),
    'experienceSummary', 'Eight years of approved experience.',
    'generalLocation', NULL,
    'languages', jsonb_build_array('es', 'fr')
  ))$$,
  'P0001',
  'General location is required while approved or pending modalities include in-person or hybrid coaching.',
  'direct save also validates location against currently approved hybrid modalities'
);
RESET ROLE;
SELECT is(
  (SELECT general_location FROM public.trainer_profiles
   WHERE id = '59999999-9999-4999-8999-999999999999'),
  'Latest direct location',
  'failed removal under approved hybrid modalities preserves the profile location'
);
UPDATE public.trainer_profiles SET modalities = ARRAY['online']
WHERE id = '59999999-9999-4999-8999-999999999999';
UPDATE public.trainer_applications SET modalities = ARRAY['hybrid']
WHERE user_id = '99999999-9999-4999-8999-999999999999'
  AND application_kind = 'profile_update'
  AND status = 'under_review';

UPDATE public.trainer_profiles SET general_location = ''
WHERE id = '59999999-9999-4999-8999-999999999999';
SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$SELECT public.transition_trainer_application(
    (SELECT id FROM public.trainer_applications
     WHERE user_id = '99999999-9999-4999-8999-999999999999'
       AND application_kind = 'profile_update'
       AND status = 'under_review'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'approve',
    '{"public_note":"Debe fallar sin ubicacion final."}'::jsonb
  )$$,
  'P0001',
  'Add a general location before approving in-person or hybrid coaching modalities.',
  'profile-update approval rejects an invalid final modality and location combination'
);
RESET ROLE;
SELECT is(
  (SELECT status FROM public.trainer_applications
   WHERE user_id = '99999999-9999-4999-8999-999999999999'
     AND application_kind = 'profile_update'
     AND status = 'under_review'),
  'under_review',
  'invalid final profile combination leaves the profile update under review'
);
SELECT is(
  (SELECT concat_ws('|', status, professional_name, array_to_string(modalities, ','))
   FROM public.trainer_profiles WHERE id = '59999999-9999-4999-8999-999999999999'),
  'active|Approved Profile Trainer|online',
  'rejected profile-update approval preserves the active approved profile'
);
UPDATE public.trainer_profiles SET general_location = 'Restored final location'
WHERE id = '59999999-9999-4999-8999-999999999999';
UPDATE public.trainer_profiles SET status = 'suspended'
WHERE id = '59999999-9999-4999-8999-999999999999';
SELECT throws_ok(
  $$SELECT public.transition_trainer_application(
    (SELECT id FROM public.trainer_applications
     WHERE user_id = '99999999-9999-4999-8999-999999999999'
       AND application_kind = 'profile_update'
       AND status = 'under_review'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'approve',
    '{"public_note":"No debe reactivar un perfil suspendido."}'::jsonb
  )$$,
  '42501', NULL, 'profile-update approval rejects a source profile that is no longer active'
);
SELECT is(
  (SELECT status FROM public.trainer_profiles WHERE id = '59999999-9999-4999-8999-999999999999'),
  'suspended',
  'failed profile-update approval preserves professional suspension'
);
SELECT is(
  (SELECT status FROM public.trainer_applications
   WHERE user_id = '99999999-9999-4999-8999-999999999999'
     AND application_kind = 'profile_update'
     AND status = 'under_review'),
  'under_review',
  'failed profile-update approval leaves review state unchanged'
);
UPDATE public.trainer_profiles SET status = 'active'
WHERE id = '59999999-9999-4999-8999-999999999999';
SELECT lives_ok(
  $$SELECT public.transition_trainer_application(
    (SELECT id FROM public.trainer_applications
     WHERE user_id = '99999999-9999-4999-8999-999999999999'
       AND application_kind = 'profile_update'
       AND status = 'under_review'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'approve',
    '{"public_note":"Actualizacion de perfil aprobada."}'::jsonb
  )$$,
  'administrator can approve a profile update through the existing transition flow'
);
RESET ROLE;
SELECT is(
  (SELECT concat_ws('|', professional_name, array_to_string(specialties, ','),
    array_to_string(modalities, ','), experience_summary, professional_photo_url,
    bio, general_location, array_to_string(languages, ','))
   FROM public.trainer_profiles
   WHERE id = '59999999-9999-4999-8999-999999999999'),
  'Updated Name Recreated Review|strength,mobility|hybrid|Recreated reviewed experience after reverting the prior proposal.|https://cdn.example.test/latest-direct.jpg|'
    || btrim(repeat('latest direct bio ', 6)) || '|Restored final location|es,fr',
  'profile-update approval applies reviewed fields without reverting newer direct fields'
);

SELECT * FROM finish();
ROLLBACK;

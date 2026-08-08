BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(139);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'relationship-owner@example.test', '{}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', 'relationship-other-trainer@example.test', '{}'::jsonb),
  ('33333333-3333-4333-8333-333333333333', 'relationship-client@example.test', '{}'::jsonb),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'relationship-suspended@example.test', '{}'::jsonb),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'relationship-inactive@example.test', '{}'::jsonb);

INSERT INTO public.profiles (id, avatar_url, onboarding_done, account_status)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'https://example.test/owner.webp', TRUE, 'active'),
  ('22222222-2222-4222-8222-222222222222', 'https://example.test/other.webp', TRUE, 'active'),
  ('33333333-3333-4333-8333-333333333333', 'https://example.test/client.webp', TRUE, 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'https://example.test/suspended.webp', TRUE, 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'https://example.test/inactive.webp', TRUE, 'active');

INSERT INTO public.trainer_applications (id, user_id)
VALUES
  ('44444444-4444-4444-8444-444444444441', '11111111-1111-4111-8111-111111111111'),
  ('44444444-4444-4444-8444-444444444442', '22222222-2222-4222-8222-222222222222'),
  ('44444444-4444-4444-8444-444444444443', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  ('44444444-4444-4444-8444-444444444444', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2');

INSERT INTO public.trainer_profiles (
  id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary
) VALUES
  ('55555555-5555-4555-8555-555555555551', '11111111-1111-4111-8111-111111111111',
   '44444444-4444-4444-8444-444444444441', 'relationship-owner', 'active', 'Owner trainer', 'Owner bio', 'Owner experience'),
  ('55555555-5555-4555-8555-555555555552', '22222222-2222-4222-8222-222222222222',
   '44444444-4444-4444-8444-444444444442', 'relationship-other-trainer', 'active', 'Other trainer', 'Other bio', 'Other experience'),
  ('55555555-5555-4555-8555-555555555553', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   '44444444-4444-4444-8444-444444444443', 'relationship-suspended', 'suspended', 'Suspended trainer', 'Private bio', 'Private experience'),
  ('55555555-5555-4555-8555-555555555554', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
   '44444444-4444-4444-8444-444444444444', 'relationship-inactive', 'inactive', 'Inactive trainer', 'Private bio', 'Private experience');

SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.trainer_service_offerings (trainer_profile_id, name, modality, duration_minutes)
    VALUES ('55555555-5555-4555-8555-555555555551', 'Owner service', 'online', 60)$$,
  'active trainer owner can create a service directly'
);
SELECT is(
  (SELECT count(*) FROM public.trainer_service_offerings),
  1::bigint,
  'active trainer owner can read only their service'
);
SELECT lives_ok(
  $$UPDATE public.trainer_service_offerings SET description = 'Owner-managed update'
    WHERE name = 'Owner service'$$,
  'active trainer owner can update their own service'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM public.trainer_service_offerings),
  0::bigint,
  'client cannot read service offerings directly before the directory projection exists'
);
SELECT throws_ok(
  $$INSERT INTO public.trainer_service_offerings (trainer_profile_id, name, modality, duration_minutes)
    VALUES ('55555555-5555-4555-8555-555555555551', 'Client injection', 'online', 60)$$,
  NULL, NULL, 'client cannot write another trainer service'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM public.trainer_service_offerings),
  0::bigint,
  'other trainer cannot read owner services directly'
);
SELECT throws_ok(
  $$INSERT INTO public.trainer_service_offerings (trainer_profile_id, name, modality, duration_minutes)
    VALUES ('55555555-5555-4555-8555-555555555551', 'Other trainer injection', 'online', 60)$$,
  NULL, NULL, 'other trainer cannot write owner service'
);
RESET ROLE;

SET LOCAL ROLE service_role;
UPDATE public.trainer_profiles
SET specialties = ARRAY['Fuerza'], modalities = ARRAY['online'], general_location = 'La Habana', languages = ARRAY['Español']
WHERE id = '55555555-5555-4555-8555-555555555551';
UPDATE public.trainer_service_offerings
SET description = 'Acompañamiento semanal', content = 'Seguimiento de entrenamiento', capacity = 99,
    created_at = '2026-01-01T00:00:00Z'
WHERE name = 'Owner service';
INSERT INTO public.trainer_service_offerings (
  trainer_profile_id, name, description, modality, duration_minutes, content, created_at
) VALUES (
  '55555555-5555-4555-8555-555555555551', 'Second active service', 'Second description', 'hybrid', 45, 'Second content',
  '2026-01-02T00:00:00Z'
);
INSERT INTO public.trainer_service_offerings (trainer_profile_id, name, modality, duration_minutes, is_active)
VALUES ('55555555-5555-4555-8555-555555555551', 'Inactive service', 'online', 45, FALSE);
UPDATE public.trainer_profiles
SET professional_name = 'Duplicate trainer'
WHERE id IN ('55555555-5555-4555-8555-555555555551', '55555555-5555-4555-8555-555555555552');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM public.active_trainer_directory),
  2::bigint,
  'authenticated clients can discover active trainer profiles, including profiles without services'
);
SELECT is(
  (SELECT count(*) FROM public.active_trainer_directory WHERE slug IN ('relationship-suspended', 'relationship-inactive')),
  0::bigint,
  'directory excludes suspended and inactive profiles'
);
SELECT is(
  (SELECT active_services -> 0 ->> 'name' FROM public.active_trainer_directory WHERE slug = 'relationship-owner'),
  'Owner service',
  'directory projects active services for an active trainer'
);
SELECT is(
  (SELECT jsonb_array_length(active_services) FROM public.active_trainer_directory WHERE slug = 'relationship-owner'),
  2,
  'directory omits inactive services while retaining each active service'
);
SELECT is(
  (SELECT active_services FROM public.active_trainer_directory WHERE slug = 'relationship-owner'),
  '[
    {"name":"Owner service","description":"Acompañamiento semanal","modality":"online","duration_minutes":60,"content":"Seguimiento de entrenamiento"},
    {"name":"Second active service","description":"Second description","modality":"hybrid","duration_minutes":45,"content":"Second content"}
  ]'::jsonb,
  'directory projects exactly the public service shape in creation order'
);
SELECT is(
  (SELECT active_services FROM public.active_trainer_directory WHERE slug = 'relationship-other-trainer'),
  '[]'::jsonb,
  'active trainer without services remains visible with an empty service list'
);
SELECT ok(
  NOT ((SELECT active_services -> 0 FROM public.active_trainer_directory WHERE slug = 'relationship-owner') ?| ARRAY['id', 'capacity', 'price_minor', 'currency', 'billing_interval']),
  'directory service projection omits ids, capacity, and commercial fields'
);
SELECT ok(
  (SELECT professional_photo_url IS NULL AND general_location IS NULL FROM public.active_trainer_directory WHERE slug = 'relationship-other-trainer'),
  'directory preserves null public profile fields'
);
SELECT is(
  (SELECT string_agg(user_id::text, ',' ORDER BY professional_name, user_id) FROM public.active_trainer_directory),
  '11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222',
  'directory ordering uses user id as a deterministic duplicate-name tie-breaker'
);
SELECT is(
  (SELECT user_id FROM public.active_trainer_directory
    WHERE (professional_name, user_id) > ('Duplicate trainer', '11111111-1111-4111-8111-111111111111'::uuid)
    ORDER BY professional_name, user_id
    LIMIT 1),
  '22222222-2222-4222-8222-222222222222'::uuid,
  'keyset cursor advances through duplicate professional names without a gap'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.active_trainer_directory', 'SELECT')
  AND has_table_privilege('authenticated', 'public.active_trainer_directory', 'SELECT'),
  'directory projection is authenticated-only'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'anon', true);
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM public.active_trainer_directory$$,
  NULL, NULL,
  'anonymous users cannot read the trainer directory projection'
);
RESET ROLE;

SET LOCAL ROLE service_role;
INSERT INTO public.coaching_requests (
  id, service_id, trainer_user_id, client_user_id, training_profile_consent_version, status
) VALUES (
  '66666666-6666-4666-8666-666666666661',
  (SELECT id FROM public.trainer_service_offerings WHERE name = 'Owner service'),
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  'training-v1', 'accepted'
);
INSERT INTO public.coaching_relationships (
  id, source_request_id, service_id, trainer_user_id, client_user_id, status
) VALUES (
  '77777777-7777-4777-8777-777777777771',
  '66666666-6666-4666-8666-666666666661',
  (SELECT id FROM public.trainer_service_offerings WHERE name = 'Owner service'),
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  'active'
);
INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by)
VALUES ('77777777-7777-4777-8777-777777777771', 'training_profile', 'training-v1', '33333333-3333-4333-8333-333333333333');
RESET ROLE;

SELECT ok(
  has_function_privilege('authenticated', 'public.has_active_coaching_scope(uuid,uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.has_active_coaching_scope(uuid,uuid,text)', 'EXECUTE'),
  'scope helper uses the minimum authenticated-only execute grant'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.coaching_requests', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.coaching_relationships', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.coaching_consents', 'DELETE'),
  'relationship records keep direct participant mutation grants revoked'
);

SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT ok(
  public.has_active_coaching_scope(
    '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333',
    'training_profile'
  ),
  'correct authenticated trainer receives active training profile access'
);
SELECT ok(
  NOT public.has_active_coaching_scope(
    '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333',
    'body_measurements'
  ),
  'body measurements remain separate until their consent exists'
);
RESET ROLE;

SET LOCAL ROLE service_role;
INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by)
VALUES ('77777777-7777-4777-8777-777777777771', 'body_measurements', 'body-v1', '33333333-3333-4333-8333-333333333333');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT ok(
  public.has_active_coaching_scope('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'body_measurements'),
  'body measurements require and honor their own active consent'
);
RESET ROLE;

SET LOCAL ROLE service_role;
UPDATE public.coaching_consents
SET revoked_at = NOW(), revoked_by = '33333333-3333-4333-8333-333333333333'
WHERE relationship_id = '77777777-7777-4777-8777-777777777771' AND scope = 'body_measurements';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT ok(
  NOT public.has_active_coaching_scope('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'body_measurements'),
  'revoked body measurement consent denies only that scope'
);
RESET ROLE;

SET LOCAL ROLE service_role;
UPDATE public.trainer_profiles SET status = 'suspended'
WHERE id = '55555555-5555-4555-8555-555555555551';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT ok(
  NOT public.has_active_coaching_scope('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'training_profile'),
  'inactive trainer profile denies access even with an active relationship'
);
RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE public.trainer_profiles SET status = 'active'
WHERE id = '55555555-5555-4555-8555-555555555551';
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT ok(
  NOT public.has_active_coaching_scope(
    '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333',
    'training_profile'
  ),
  'another trainer cannot query or authorize as the relationship trainer'
);
RESET ROLE;

SET LOCAL ROLE service_role;
UPDATE public.coaching_consents
SET revoked_at = NOW(), revoked_by = '33333333-3333-4333-8333-333333333333'
WHERE relationship_id = '77777777-7777-4777-8777-777777777771' AND scope = 'training_profile';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT ok(
  NOT public.has_active_coaching_scope('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'training_profile'),
  'revoked training consent immediately denies access'
);
RESET ROLE;

SET LOCAL ROLE service_role;
UPDATE public.coaching_consents SET revoked_at = NULL, revoked_by = NULL
WHERE relationship_id = '77777777-7777-4777-8777-777777777771' AND scope = 'training_profile';
UPDATE public.coaching_relationships SET status = 'paused_by_platform', paused_at = NOW()
WHERE id = '77777777-7777-4777-8777-777777777771';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT ok(
  NOT public.has_active_coaching_scope('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'training_profile'),
  'paused relationship denies access'
);
RESET ROLE;

SET LOCAL ROLE service_role;
UPDATE public.coaching_relationships
SET status = 'ended', ended_at = NOW(), ended_by = '33333333-3333-4333-8333-333333333333', paused_at = NULL
WHERE id = '77777777-7777-4777-8777-777777777771';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT ok(
  NOT public.has_active_coaching_scope('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'training_profile'),
  'ended relationship denies access'
);
RESET ROLE;

RESET ROLE;

SELECT ok(
  has_function_privilege('authenticated', 'public.create_coaching_request(uuid,text,text,uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.cancel_coaching_request(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.create_coaching_request(uuid,text,text,uuid)', 'EXECUTE'),
  'request and cancellation RPCs are authenticated-only'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.coaching_requests', 'UPDATE'),
  'clients cannot bypass cancellation RPC with a direct request update'
);

SET LOCAL ROLE service_role;
DELETE FROM public.coaching_consents;
DELETE FROM public.coaching_relationships;
DELETE FROM public.coaching_requests;
UPDATE public.trainer_service_offerings
SET id = '88888888-8888-4888-8888-888888888800'
WHERE name = 'Owner service';
INSERT INTO public.trainer_service_offerings (id, trainer_profile_id, name, modality, duration_minutes)
VALUES ('88888888-8888-4888-8888-888888888801', '55555555-5555-4555-8555-555555555552', 'Other trainer service', 'online', 50);
INSERT INTO public.trainer_service_offerings (id, trainer_profile_id, name, modality, duration_minutes, is_active)
VALUES ('88888888-8888-4888-8888-888888888802', '55555555-5555-4555-8555-555555555551', 'Inactive request service', 'online', 50, FALSE);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT * FROM public.create_coaching_request(
    '88888888-8888-4888-8888-888888888800',
    '', 'training-profile-v1', '88888888-8888-4888-8888-888888888881'
  )$$,
  'client can create a pending request with an empty message'
);
SELECT is(
  (SELECT count(*) FROM public.coaching_requests WHERE status = 'pending'),
  1::bigint,
  'request creation persists one pending request'
);
SELECT is(
  (SELECT count(*) FROM public.coaching_consents),
  0::bigint,
  'request creation grants no coaching scope before acceptance'
);
SELECT is(
  (SELECT count(*) FROM public.professional_audit_logs WHERE action = 'created' AND entity_type = 'coaching_request'),
  1::bigint,
  'request creation writes one audit row in its transaction'
);
SELECT is(
  (SELECT count(*) FROM public.product_notifications WHERE type = 'coaching_request_created'),
  1::bigint,
  'request creation writes one deduplicated trainer notification'
);
SELECT is(
  (SELECT created FROM public.create_coaching_request(
    '88888888-8888-4888-8888-888888888800',
    '', 'training-profile-v1', '88888888-8888-4888-8888-888888888881'
  )),
  FALSE,
  'the same idempotency key returns the original request without another write'
);
SELECT is(
  (SELECT count(*) FROM public.coaching_requests WHERE status = 'pending'),
  1::bigint,
  'idempotent retry does not duplicate the pending request'
);
SELECT is(
  (SELECT count(*) FROM public.professional_audit_logs WHERE action = 'created' AND entity_type = 'coaching_request'),
  1::bigint,
  'idempotent retry does not duplicate the audit row'
);
SELECT is(
  (SELECT count(*) FROM public.product_notifications WHERE type = 'coaching_request_created'),
  1::bigint,
  'idempotent retry does not duplicate the notification'
);
SELECT throws_ok(
  $$SELECT * FROM public.create_coaching_request(
    '88888888-8888-4888-8888-888888888800',
    '', 'training-profile-v1', '88888888-8888-4888-8888-888888888882'
  )$$,
  'COACHING_PENDING_REQUEST_EXISTS',
  'an equivalent pending request is rejected'
);
SELECT lives_ok(
  $$SELECT * FROM public.create_coaching_request(
    '88888888-8888-4888-8888-888888888801',
    'Solicitud a otro entrenador', 'training-profile-v1', '88888888-8888-4888-8888-888888888883'
  )$$,
  'a client may have a pending request to a different trainer'
);
SELECT is(
  (SELECT count(*) FROM public.coaching_requests WHERE status = 'pending'),
  2::bigint,
  'multiple pending requests to distinct trainers coexist'
);
SELECT throws_ok(
  $$SELECT * FROM public.create_coaching_request(
    '88888888-8888-4888-8888-888888888802',
    '', 'training-profile-v1', '88888888-8888-4888-8888-888888888884'
  )$$,
  'COACHING_SERVICE_NOT_AVAILABLE',
  'inactive services cannot receive a request'
);
SELECT throws_ok(
  $$SELECT * FROM public.create_coaching_request(
    '88888888-8888-4888-8888-888888888800',
    '', 'wrong-consent-version', '88888888-8888-4888-8888-888888888885'
  )$$,
  'COACHING_CONSENT_VERSION_INVALID',
  'request RPC rejects an unrecognized consent version'
);
SELECT throws_ok(
  $$SELECT * FROM public.create_coaching_request(
    '88888888-8888-4888-8888-888888888800',
    repeat('m', 1001), 'training-profile-v1', '88888888-8888-4888-8888-888888888886'
  )$$,
  'COACHING_REQUEST_INVALID',
  'request RPC rejects a message beyond 1000 characters'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
UPDATE public.profiles SET account_status = 'suspended'
WHERE id = '33333333-3333-4333-8333-333333333333';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM public.create_coaching_request(
    '88888888-8888-4888-8888-888888888800', '', 'training-profile-v1', '88888888-8888-4888-8888-888888888889'
  )$$,
  'COACHING_CLIENT_NOT_ACTIVE',
  'an inactive client account cannot create a request'
);
SELECT is(
  (SELECT count(*) FROM public.coaching_requests WHERE idempotency_key = '88888888-8888-4888-8888-888888888889'),
  0::bigint,
  'inactive client rejection writes no request'
);
SELECT is(
  (SELECT count(*) FROM public.professional_audit_logs WHERE metadata ->> 'idempotency_key' = '88888888-8888-4888-8888-888888888889'),
  0::bigint,
  'inactive client rejection writes no audit row'
);
SELECT is(
  (SELECT count(*) FROM public.product_notifications WHERE type = 'coaching_request_created'),
  2::bigint,
  'inactive client rejection writes no notification'
);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
UPDATE public.profiles SET account_status = 'active'
WHERE id = '33333333-3333-4333-8333-333333333333';
UPDATE public.profiles SET account_status = 'suspended'
WHERE id = '11111111-1111-4111-8111-111111111111';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM public.create_coaching_request(
    '88888888-8888-4888-8888-888888888800', '', 'training-profile-v1', '88888888-8888-4888-8888-888888888890'
  )$$,
  'COACHING_TRAINER_NOT_ACTIVE',
  'a globally suspended trainer account cannot receive a request despite an active profile'
);
SELECT is(
  (SELECT count(*) FROM public.coaching_requests WHERE idempotency_key = '88888888-8888-4888-8888-888888888890'),
  0::bigint,
  'globally suspended trainer rejection writes no request'
);
SELECT is(
  (SELECT count(*) FROM public.professional_audit_logs WHERE metadata ->> 'idempotency_key' = '88888888-8888-4888-8888-888888888890'),
  0::bigint,
  'globally suspended trainer rejection writes no audit row'
);
SELECT is(
  (SELECT count(*) FROM public.product_notifications WHERE type = 'coaching_request_created'),
  2::bigint,
  'globally suspended trainer rejection writes no notification'
);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
UPDATE public.profiles SET account_status = 'active'
WHERE id = '11111111-1111-4111-8111-111111111111';
RESET ROLE;

SET LOCAL ROLE service_role;
UPDATE public.trainer_profiles SET status = 'inactive'
WHERE id = '55555555-5555-4555-8555-555555555552';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM public.create_coaching_request(
    '88888888-8888-4888-8888-888888888801',
    '', 'training-profile-v1', '88888888-8888-4888-8888-888888888887'
  )$$,
  'COACHING_TRAINER_NOT_ACTIVE',
  'inactive trainer profiles cannot receive a request'
);
RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE public.trainer_profiles SET status = 'active'
WHERE id = '55555555-5555-4555-8555-555555555552';
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM public.create_coaching_request(
    '88888888-8888-4888-8888-888888888800',
    '', 'training-profile-v1', '88888888-8888-4888-8888-888888888888'
  )$$,
  'COACHING_SELF_REQUEST_FORBIDDEN',
  'a trainer cannot request their own service'
);
RESET ROLE;

SET LOCAL ROLE service_role;
INSERT INTO public.coaching_relationships (service_id, trainer_user_id, client_user_id, status)
VALUES (
  '88888888-8888-4888-8888-888888888800',
  '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'active'
);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM public.create_coaching_request(
    '88888888-8888-4888-8888-888888888801',
    '', 'training-profile-v1', '99999999-9999-4999-8999-999999999991'
  )$$,
  'COACHING_ACTIVE_RELATIONSHIP_EXISTS',
  'an active relationship blocks all new pending requests'
);
RESET ROLE;
SET LOCAL ROLE service_role;
DELETE FROM public.coaching_relationships
WHERE client_user_id = '33333333-3333-4333-8333-333333333333';
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT * FROM public.cancel_coaching_request(
    (SELECT id FROM public.coaching_requests WHERE trainer_user_id = '11111111-1111-4111-8111-111111111111' AND status = 'pending')
  )$$,
  'a client can cancel only their own pending request through the RPC'
);
SELECT is(
  (SELECT status FROM public.coaching_requests WHERE trainer_user_id = '11111111-1111-4111-8111-111111111111'),
  'cancelled',
  'cancellation atomically changes the request status'
);
SELECT is(
  (SELECT count(*) FROM public.professional_audit_logs WHERE action = 'cancelled' AND entity_type = 'coaching_request'),
  1::bigint,
  'cancellation writes one audit row'
);
SELECT is(
  (SELECT count(*) FROM public.product_notifications WHERE type = 'coaching_request_cancelled'),
  1::bigint,
  'cancellation writes one trainer notification'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM public.cancel_coaching_request(
    (SELECT id FROM public.coaching_requests WHERE trainer_user_id = '22222222-2222-4222-8222-222222222222' AND status = 'pending')
  )$$,
  'COACHING_REQUEST_NOT_CANCELLABLE',
  'another participant cannot cancel the client request'
);
SELECT is(
  (SELECT status FROM public.coaching_requests WHERE trainer_user_id = '22222222-2222-4222-8222-222222222222'),
  'pending',
  'failed cancellation leaves the request pending'
);
RESET ROLE;

SELECT ok(
  has_function_privilege('authenticated', 'public.accept_coaching_request(uuid,uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.decline_coaching_request(uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.accept_coaching_request(uuid,uuid)', 'EXECUTE'),
  'accept and decline RPCs are authenticated-only'
);

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT * FROM public.decline_coaching_request(
    (SELECT id FROM public.coaching_requests WHERE trainer_user_id = '22222222-2222-4222-8222-222222222222' AND status = 'pending'),
    'Sin disponibilidad'
  )$$,
  'the owning active trainer can decline a pending request'
);
SELECT is(
  (SELECT status FROM public.coaching_requests WHERE trainer_user_id = '22222222-2222-4222-8222-222222222222'),
  'declined',
  'decline changes only the owned pending request'
);
SELECT is(
  (SELECT count(*) FROM public.coaching_relationships), 0::bigint,
  'decline creates no relationship'
);
SELECT is(
  (SELECT count(*) FROM public.coaching_consents), 0::bigint,
  'decline creates no consent'
);
SELECT is(
  (SELECT count(*) FROM public.professional_audit_logs WHERE action = 'declined' AND entity_type = 'coaching_request'), 1::bigint,
  'decline writes one audit row'
);
SELECT is(
  (SELECT count(*) FROM public.product_notifications WHERE type = 'coaching_request_declined'), 1::bigint,
  'decline writes one safe client notification'
);
RESET ROLE;

SET LOCAL ROLE service_role;
INSERT INTO public.coaching_requests (
  id, service_id, trainer_user_id, client_user_id, message, training_profile_consent_version, idempotency_key, status
) VALUES
  ('99999999-9999-4999-8999-999999999993', '88888888-8888-4888-8888-888888888800', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'mensaje privado', 'training-profile-v1', '99999999-9999-4999-8999-999999999994', 'pending'),
  ('99999999-9999-4999-8999-999999999995', '88888888-8888-4888-8888-888888888801', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'otro mensaje privado', 'training-profile-v1', '99999999-9999-4999-8999-999999999996', 'pending');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT accepted_request_id FROM public.accept_coaching_request(
    '99999999-9999-4999-8999-999999999993', '99999999-9999-4999-8999-999999999997'
  )),
  '99999999-9999-4999-8999-999999999993'::uuid,
  'accept returns the accepted request id'
);
SELECT is(
  (SELECT count(*) FROM public.coaching_relationships WHERE status = 'active'), 1::bigint,
  'accept creates exactly one active relationship'
);
SELECT is(
  (SELECT status FROM public.coaching_requests WHERE id = '99999999-9999-4999-8999-999999999993'), 'accepted',
  'accept marks the winner accepted'
);
SELECT is(
  (SELECT acceptance_cancelled_request_ids FROM public.coaching_requests WHERE id = '99999999-9999-4999-8999-999999999993'), ARRAY['99999999-9999-4999-8999-999999999995'::uuid],
  'accept atomically cancels every other pending request for the client'
);
SELECT is(
  (SELECT count(*) FROM public.coaching_consents WHERE scope = 'training_profile' AND text_version = 'training-profile-v1' AND granted_by = '33333333-3333-4333-8333-333333333333'), 1::bigint,
  'accept grants exactly one captured training profile consent'
);
SELECT is(
  (SELECT count(*) FROM public.professional_audit_logs WHERE action = 'accepted' AND entity_id = '99999999-9999-4999-8999-999999999993'), 1::bigint,
  'accept writes one audit record'
);
SELECT is(
  (SELECT count(*) FROM public.product_notifications WHERE type = 'coaching_request_accepted' AND body NOT LIKE '%privado%'), 1::bigint,
  'accept notification does not leak the request message'
);
SELECT is(
  (SELECT cancelled_request_ids FROM public.accept_coaching_request(
    '99999999-9999-4999-8999-999999999993', '99999999-9999-4999-8999-999999999997'
  )),
  ARRAY['99999999-9999-4999-8999-999999999995'::uuid],
  'same acceptance key retries with the original cancellation result'
);
SELECT is(
  (SELECT count(*) FROM public.coaching_relationships WHERE status = 'active'), 1::bigint,
  'accept retry creates no duplicate relationship'
);
SELECT is(
  (SELECT count(*) FROM public.coaching_consents WHERE scope = 'training_profile'), 1::bigint,
  'accept retry creates no duplicate consent'
);
RESET ROLE;

SET LOCAL ROLE service_role;
DELETE FROM public.coaching_consents;
DELETE FROM public.coaching_relationships;
RESET ROLE;

CREATE FUNCTION public.fail_coaching_request_notification_test()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.type = 'coaching_request_created' THEN
    RAISE EXCEPTION 'COACHING_TEST_NOTIFICATION_FAILURE';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_fail_coaching_request_notification_test
  BEFORE INSERT ON public.product_notifications
  FOR EACH ROW EXECUTE FUNCTION public.fail_coaching_request_notification_test();
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM public.create_coaching_request(
    '88888888-8888-4888-8888-888888888800',
    'rollback', 'training-profile-v1', '99999999-9999-4999-8999-999999999992'
  )$$,
  'COACHING_TEST_NOTIFICATION_FAILURE',
  'a notification failure aborts the request transaction'
);
SELECT is(
  (SELECT count(*) FROM public.coaching_requests WHERE idempotency_key = '99999999-9999-4999-8999-999999999992'),
  0::bigint,
  'a failed notification leaves no partial request'
);
SELECT is(
  (SELECT count(*) FROM public.professional_audit_logs WHERE metadata ->> 'idempotency_key' = '99999999-9999-4999-8999-999999999992'),
  0::bigint,
  'a failed notification rolls back the audit row'
);
SELECT is(
  (SELECT count(*) FROM public.product_notifications WHERE type = 'coaching_request_created'),
  2::bigint,
  'a failed notification leaves no partial notification'
);
RESET ROLE;

-- Scoped consent changes must be client-owned, atomic, and retry-safe.
SET LOCAL ROLE service_role;
DELETE FROM public.coaching_consents;
DELETE FROM public.coaching_relationships;
DELETE FROM public.coaching_requests;
INSERT INTO public.coaching_requests (
  id, service_id, trainer_user_id, client_user_id, training_profile_consent_version, idempotency_key, status
) VALUES (
  'aaaaaaaa-0000-4000-8000-000000000001', '88888888-8888-4888-8888-888888888800',
  '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333',
  'training-profile-v1', 'aaaaaaaa-0000-4000-8000-000000000002', 'accepted'
);
INSERT INTO public.coaching_relationships (
  id, source_request_id, service_id, trainer_user_id, client_user_id, status
) VALUES (
  'aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001',
  '88888888-8888-4888-8888-888888888800', '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333', 'active'
);
INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by)
VALUES ('aaaaaaaa-0000-4000-8000-000000000003', 'training_profile', 'training-profile-v1', '33333333-3333-4333-8333-333333333333');
RESET ROLE;

SELECT ok(
  has_function_privilege('authenticated', 'public.grant_body_measurements_consent(uuid,text,uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.revoke_body_measurements_consent(uuid,uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.revoke_training_profile_consent(uuid,uuid)', 'EXECUTE'),
  'scoped consent RPCs are authenticated-only entry points'
);

SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT * FROM public.grant_body_measurements_consent(
    'aaaaaaaa-0000-4000-8000-000000000003', 'body-measurements-v1', 'aaaaaaaa-0000-4000-8000-000000000004'
  )$$,
  'client can grant body measurements on their own active relationship'
);
SELECT is(
  (SELECT status FROM public.coaching_relationships WHERE id = 'aaaaaaaa-0000-4000-8000-000000000003'), 'active',
  'granting body measurements does not end the relationship'
);
SELECT ok(
  public.has_active_coaching_scope('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'body_measurements') IS FALSE,
  'client cannot impersonate the trainer through the scope helper'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT ok(
  public.has_active_coaching_scope('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'body_measurements'),
  'granted body measurements authorize the correct active trainer'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT changed FROM public.grant_body_measurements_consent(
    'aaaaaaaa-0000-4000-8000-000000000003', 'body-measurements-v1', 'aaaaaaaa-0000-4000-8000-000000000004'
  )), FALSE,
  'grant retry with the same key does not perform duplicate work'
);
SELECT lives_ok(
  $$SELECT * FROM public.revoke_body_measurements_consent(
    'aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000005'
  )$$,
  'client can revoke only body measurements while keeping the relationship'
);
SELECT is(
  (SELECT status FROM public.coaching_relationships WHERE id = 'aaaaaaaa-0000-4000-8000-000000000003'), 'active',
  'revoking body measurements does not end the relationship'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT ok(
  NOT public.has_active_coaching_scope('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'body_measurements'),
  'body revocation immediately denies only that scope'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT * FROM public.revoke_training_profile_consent(
    'aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000006'
  )$$,
  'revoking training data atomically ends the active relationship'
);
SELECT is(
  (SELECT status FROM public.coaching_relationships WHERE id = 'aaaaaaaa-0000-4000-8000-000000000003'), 'ended',
  'training profile revocation persists the ended relationship state'
);
SELECT is(
  (SELECT count(*) FROM public.coaching_consents WHERE relationship_id = 'aaaaaaaa-0000-4000-8000-000000000003' AND revoked_at IS NULL), 0::bigint,
  'ending revokes every remaining scoped grant in the same transaction'
);
SELECT is(
  (SELECT changed FROM public.revoke_training_profile_consent(
    'aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000006'
  )), FALSE,
  'training revocation retry with the same key does not perform duplicate work'
);
SELECT is(
  (SELECT count(*) FROM public.professional_audit_logs WHERE entity_id = 'aaaaaaaa-0000-4000-8000-000000000003' AND action = 'training_profile_consent_revoked'), 1::bigint,
  'training revocation retry does not duplicate its audit event'
);
SELECT is(
  (SELECT count(*) FROM public.product_notifications WHERE dedupe_key = 'coaching-training-profile-revoked:aaaaaaaa-0000-4000-8000-000000000003'), 1::bigint,
  'training revocation retry does not duplicate its notification'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM public.grant_body_measurements_consent(
    'aaaaaaaa-0000-4000-8000-000000000003', 'body-measurements-v1', 'aaaaaaaa-0000-4000-8000-000000000007'
  )$$,
  'COACHING_RELATIONSHIP_NOT_ACTIVE',
  'another account cannot grant consent after the relationship ended'
);
RESET ROLE;

-- Ending and resuming are participant-controlled, atomic, and preserve consent history.
SET LOCAL ROLE service_role;
INSERT INTO public.coaching_relationships (id, service_id, trainer_user_id, client_user_id, status)
VALUES ('aaaaaaaa-0000-4000-8000-000000000010', '88888888-8888-4888-8888-888888888800',
  '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'active');
INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by)
VALUES
  ('aaaaaaaa-0000-4000-8000-000000000010', 'training_profile', 'training-profile-v1', '33333333-3333-4333-8333-333333333333'),
  ('aaaaaaaa-0000-4000-8000-000000000010', 'body_measurements', 'body-measurements-v1', '33333333-3333-4333-8333-333333333333');
RESET ROLE;

SELECT ok(
  has_function_privilege('authenticated', 'public.end_coaching_relationship(uuid,text,uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.resume_paused_coaching_relationship(uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.end_coaching_relationship(uuid,text,uuid)', 'EXECUTE'),
  'end and resume RPCs are authenticated-only entry points'
);
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT * FROM public.end_coaching_relationship('aaaaaaaa-0000-4000-8000-000000000010', '  Objetivo cumplido  ', 'aaaaaaaa-0000-4000-8000-000000000011')$$,
  'a client can end their active relationship'
);
SELECT is((SELECT status FROM public.coaching_relationships WHERE id = 'aaaaaaaa-0000-4000-8000-000000000010'), 'ended', 'end persists a terminal relationship');
SELECT is((SELECT end_reason FROM public.coaching_relationships WHERE id = 'aaaaaaaa-0000-4000-8000-000000000010'), 'Objetivo cumplido', 'end stores a normalized optional reason');
SELECT is((SELECT ended_by FROM public.coaching_relationships WHERE id = 'aaaaaaaa-0000-4000-8000-000000000010'), '33333333-3333-4333-8333-333333333333'::uuid, 'end records the authenticated participant');
SELECT is((SELECT count(*) FROM public.coaching_consents WHERE relationship_id = 'aaaaaaaa-0000-4000-8000-000000000010' AND revoked_at IS NULL), 0::bigint, 'end revokes every active grant in its transaction');
SELECT is((SELECT changed FROM public.end_coaching_relationship('aaaaaaaa-0000-4000-8000-000000000010', NULL, 'aaaaaaaa-0000-4000-8000-000000000011')), FALSE, 'end retry is terminal and does not duplicate work');
SELECT is((SELECT count(*) FROM public.professional_audit_logs WHERE entity_id = 'aaaaaaaa-0000-4000-8000-000000000010' AND action = 'ended'), 1::bigint, 'end retry does not duplicate its audit event');
SELECT is((SELECT count(*) FROM public.product_notifications WHERE dedupe_key LIKE 'coaching-relationship-ended:aaaaaaaa-0000-4000-8000-000000000010:%'), 2::bigint, 'end notifies both participants without a reason payload');
SELECT throws_ok(
  $$SELECT * FROM public.end_coaching_relationship('aaaaaaaa-0000-4000-8000-000000000010', repeat('x', 501), 'aaaaaaaa-0000-4000-8000-000000000013')$$,
  'COACHING_RELATIONSHIP_END_INVALID', 'end rejects a reason longer than 500 characters before mutating state'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM public.end_coaching_relationship('aaaaaaaa-0000-4000-8000-000000000010', NULL, 'aaaaaaaa-0000-4000-8000-000000000012')$$,
  'COACHING_RELATIONSHIP_NOT_FOUND', 'a non-participant cannot end a relationship'
);
RESET ROLE;

SET LOCAL ROLE service_role;
INSERT INTO public.coaching_relationships (id, service_id, trainer_user_id, client_user_id, status, paused_at)
VALUES ('aaaaaaaa-0000-4000-8000-000000000020', '88888888-8888-4888-8888-888888888800',
  '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'paused_by_platform', NOW());
INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by, revoked_at, revoked_by)
VALUES
  ('aaaaaaaa-0000-4000-8000-000000000020', 'training_profile', 'training-profile-v1', '33333333-3333-4333-8333-333333333333', NOW(), '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-0000-4000-8000-000000000020', 'body_measurements', 'body-measurements-v1', '33333333-3333-4333-8333-333333333333', NOW(), '11111111-1111-4111-8111-111111111111');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM public.resume_paused_coaching_relationship('aaaaaaaa-0000-4000-8000-000000000020', 'aaaaaaaa-0000-4000-8000-000000000021')$$,
  'COACHING_RELATIONSHIP_NOT_FOUND', 'the trainer cannot resume without client confirmation'
);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT * FROM public.resume_paused_coaching_relationship('aaaaaaaa-0000-4000-8000-000000000020', 'aaaaaaaa-0000-4000-8000-000000000021')$$,
  'the client can resume only a platform-paused relationship after the trainer is active'
);
SELECT is((SELECT status FROM public.coaching_relationships WHERE id = 'aaaaaaaa-0000-4000-8000-000000000020'), 'active', 'resume makes the paused relationship active');
SELECT ok((SELECT paused_at IS NULL FROM public.coaching_relationships WHERE id = 'aaaaaaaa-0000-4000-8000-000000000020'), 'active relationships clear paused_at');
SELECT is((SELECT count(*) FROM public.coaching_consents WHERE relationship_id = 'aaaaaaaa-0000-4000-8000-000000000020' AND scope = 'training_profile'), 2::bigint, 'resume creates a new versioned training consent');
SELECT is((SELECT count(*) FROM public.coaching_consents WHERE relationship_id = 'aaaaaaaa-0000-4000-8000-000000000020' AND scope = 'body_measurements' AND revoked_at IS NULL), 0::bigint, 'resume does not silently restore optional body measurements');
SELECT is((SELECT changed FROM public.resume_paused_coaching_relationship('aaaaaaaa-0000-4000-8000-000000000020', 'aaaaaaaa-0000-4000-8000-000000000021')), FALSE, 'resume retry does not duplicate the new grant');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT * FROM public.end_coaching_relationship('aaaaaaaa-0000-4000-8000-000000000020', NULL, 'aaaaaaaa-0000-4000-8000-000000000022')$$,
  'the relationship trainer can also end an active relationship'
);
SELECT is((SELECT ended_by FROM public.coaching_relationships WHERE id = 'aaaaaaaa-0000-4000-8000-000000000020'), '11111111-1111-4111-8111-111111111111'::uuid, 'trainer end records the authenticated trainer');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM public.resume_paused_coaching_relationship('aaaaaaaa-0000-4000-8000-000000000020', 'aaaaaaaa-0000-4000-8000-000000000023')$$,
  'COACHING_RELATIONSHIP_NOT_PAUSED', 'an ended relationship can never be resumed'
);
RESET ROLE;

-- Administrative suspension is a single transaction: it pauses each active
-- client relationship, revokes every scope, and leaves the history intact.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'relationship-admin@example.test', '{}'::jsonb),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', 'suspension-trainer@example.test', '{}'::jsonb),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3', 'suspension-client@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id, avatar_url, onboarding_done, account_status, is_admin) VALUES
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'https://example.test/admin.webp', TRUE, 'active', TRUE),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', 'https://example.test/trainer.webp', TRUE, 'active', FALSE),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3', 'https://example.test/client.webp', TRUE, 'active', FALSE);
INSERT INTO public.trainer_applications (id, user_id)
VALUES ('ffffffff-ffff-4fff-8fff-fffffffffff4', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2');
INSERT INTO public.trainer_profiles (id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary)
VALUES ('12121212-1212-4121-8121-121212121215', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
  'ffffffff-ffff-4fff-8fff-fffffffffff4', 'suspension-trainer', 'active', 'Suspension trainer', 'Visible only while active', 'Suspension evidence');
INSERT INTO public.trainer_service_offerings (id, trainer_profile_id, name, modality, duration_minutes)
VALUES ('13131313-1313-4131-8131-131313131316', '12121212-1212-4121-8121-121212121215', 'Suspension service', 'online', 60);
INSERT INTO public.coaching_relationships (id, service_id, trainer_user_id, client_user_id, status)
VALUES ('14141414-1414-4141-8141-141414141417', '13131313-1313-4131-8131-131313131316',
  'dddddddd-dddd-4ddd-8ddd-ddddddddddd2', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3', 'active');
INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by) VALUES
  ('14141414-1414-4141-8141-141414141417', 'training_profile', 'training-profile-v1', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3'),
  ('14141414-1414-4141-8141-141414141417', 'body_measurements', 'body-measurements-v1', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3');

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.suspend_account_and_professional(uuid,uuid,text,timestamptz)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.reinstate_trainer_profile(uuid,uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.suspend_account_and_professional(uuid,uuid,text,timestamptz)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.reinstate_trainer_profile(uuid,uuid)', 'EXECUTE'),
  'administrative coaching RPCs are service-role-only after server-side admin verification'
);
SELECT set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM public.suspend_account_and_professional('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'Policy breach', NULL)$$,
  '42501', 'permission denied for function suspend_account_and_professional',
  'an authenticated non-admin cannot invoke administrative suspension'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT lives_ok(
  $$SELECT * FROM public.suspend_account_and_professional('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'Policy breach', NULL)$$,
  'an authenticated active admin can suspend a trainer atomically'
);
RESET ROLE;
SELECT is((SELECT account_status FROM public.profiles WHERE id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2'), 'suspended', 'suspension updates the global account state');
SELECT is((SELECT status FROM public.trainer_profiles WHERE user_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2'), 'suspended', 'suspension updates the trainer profile state');
SELECT is((SELECT count(*) FROM public.active_trainer_directory WHERE slug = 'suspension-trainer'), 0::bigint, 'suspension removes trainer services from public discovery');
SELECT is((SELECT status FROM public.coaching_relationships WHERE id = '14141414-1414-4141-8141-141414141417'), 'paused_by_platform', 'suspension pauses active coaching relationships');
SELECT ok((SELECT paused_at IS NOT NULL FROM public.coaching_relationships WHERE id = '14141414-1414-4141-8141-141414141417'), 'suspension timestamps the platform pause');
SELECT is((SELECT count(*) FROM public.coaching_consents WHERE relationship_id = '14141414-1414-4141-8141-141414141417' AND revoked_at IS NULL), 0::bigint, 'suspension revokes every active coaching scope');
SELECT is((SELECT count(*) FROM public.admin_audit_logs WHERE target_user_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2' AND action = 'account_suspended'), 1::bigint, 'suspension writes one administrative audit record');
SELECT is((SELECT count(*) FROM public.product_notifications WHERE dedupe_key LIKE 'coaching-trainer-suspended:14141414-1414-4141-8141-141414141417:%'), 2::bigint, 'suspension notifies the trainer and client without leaking request messages');
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT is((SELECT account_suspended FROM public.suspend_account_and_professional('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'Policy breach', NULL)), FALSE, 'repeated suspension is idempotent');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.admin_audit_logs WHERE target_user_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2' AND action = 'account_suspended'), 1::bigint, 'repeated suspension does not duplicate the audit record');

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
UPDATE public.profiles SET account_status = 'active', suspension_reason = NULL, suspended_at = NULL, suspended_until = NULL, suspended_by = NULL
WHERE id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT lives_ok(
  $$SELECT * FROM public.reinstate_trainer_profile('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1')$$,
  'an active admin can explicitly reinstate the trainer profile'
);
RESET ROLE;
SELECT is((SELECT status FROM public.trainer_profiles WHERE user_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2'), 'active', 'reinstatement restores only the trainer profile');
SELECT is((SELECT status FROM public.coaching_relationships WHERE id = '14141414-1414-4141-8141-141414141417'), 'paused_by_platform', 'reinstatement never reactivates a client relationship');
SELECT is((SELECT count(*) FROM public.coaching_consents WHERE relationship_id = '14141414-1414-4141-8141-141414141417' AND revoked_at IS NULL), 0::bigint, 'reinstatement never restores coaching grants');

SELECT * FROM finish();
ROLLBACK;

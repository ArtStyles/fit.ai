BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(68);

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
UPDATE public.coaching_relationships SET status = 'paused_by_platform'
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
SET status = 'ended', ended_at = NOW(), ended_by = '33333333-3333-4333-8333-333333333333'
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

SELECT * FROM finish();
ROLLBACK;

-- Every fixture and probe rolls back. Run with psql --set ON_ERROR_STOP=1.
-- Apply the avatar policy migration first. Only the synthetic UUID paths below
-- are ever changed; real objects and the exercise catalog are never updated.
BEGIN;
-- Match Storage's internal delete context for metadata-only RLS probes.
-- It is transaction-local; all rows below are synthetic and rolled back.
SET LOCAL storage.allow_delete_query = 'true';
DO $$ BEGIN
  ASSERT (SELECT file_size_limit=5242880 AND allowed_mime_types @> ARRAY['image/webp','image/jpeg','image/png']
    AND cardinality(allowed_mime_types)=3 AND public FROM storage.buckets WHERE id='avatars'),
    'Avatar bucket must enforce image types and 5 MiB while retaining public delivery';
END $$;

CREATE TEMP TABLE avatar_storage_before AS
SELECT count(*) AS objects_count,
  md5(COALESCE(string_agg(to_jsonb(o)::text, '' ORDER BY id), '')) AS objects_digest
FROM storage.objects o;

INSERT INTO auth.users(id,email)
SELECT ('71000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'avatar-storage-'||n||'@example.test' FROM generate_series(1,3)n;
-- The linked environment can provision profiles with an auth trigger.
INSERT INTO public.profiles(id,full_name,account_status,suspended_until)
SELECT ('71000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'Avatar RLS fixture',CASE WHEN n=3 THEN 'suspended' ELSE 'active' END,NULL
FROM generate_series(1,3)n
ON CONFLICT(id) DO UPDATE SET account_status=EXCLUDED.account_status,suspended_until=NULL;

INSERT INTO storage.objects(bucket_id,name,owner_id,metadata) VALUES
('avatars','71000000-0000-4000-8000-000000000001/avatar.webp',NULL,'{"fixture":"legacy"}'),
('avatars','71000000-0000-4000-8000-000000000002/avatar.webp','71000000-0000-4000-8000-000000000002','{"fixture":"other"}'),
('avatars','71000000-0000-4000-8000-000000000003/avatar.webp',NULL,'{"fixture":"suspended"}');

CREATE FUNCTION pg_temp.expect_avatar_denied(statement text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN;
  END;
  RAISE EXCEPTION 'Expected RLS denial: %', statement;
END;
$$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role"='authenticated';
SET LOCAL "request.jwt.claim.sub"='71000000-0000-4000-8000-000000000001';

DO $$
DECLARE n integer; target text;
BEGIN
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='avatars';
  ASSERT n=1, 'Account must list only its own avatar';
  UPDATE storage.objects SET metadata='{"fixture":"updated"}' WHERE bucket_id='avatars' AND name='71000000-0000-4000-8000-000000000001/avatar.webp';
  GET DIAGNOSTICS n=ROW_COUNT;
  ASSERT n=1, 'Owner must update legacy object with NULL owner_id';
  INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ('avatars','71000000-0000-4000-8000-000000000001/avatar.webp','{"fixture":"upserted"}')
  ON CONFLICT(bucket_id,name) DO UPDATE SET metadata=EXCLUDED.metadata;
  ASSERT (SELECT metadata->>'fixture'='upserted' FROM storage.objects WHERE bucket_id='avatars' AND name='71000000-0000-4000-8000-000000000001/avatar.webp'), 'Owner upsert must succeed';
  DELETE FROM storage.objects WHERE bucket_id='avatars' AND name='71000000-0000-4000-8000-000000000001/avatar.webp';
  GET DIAGNOSTICS n=ROW_COUNT;
  ASSERT n=1, 'Owner must delete its avatar';
  INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ('avatars','71000000-0000-4000-8000-000000000001/avatar.webp','{"fixture":"new"}');

  UPDATE storage.objects SET metadata='{}' WHERE bucket_id='avatars' AND name='71000000-0000-4000-8000-000000000002/avatar.webp';
  GET DIAGNOSTICS n=ROW_COUNT; ASSERT n=0, 'Cross-account update must affect no rows';
  DELETE FROM storage.objects WHERE bucket_id='avatars' AND name='71000000-0000-4000-8000-000000000002/avatar.webp';
  GET DIAGNOSTICS n=ROW_COUNT; ASSERT n=0, 'Cross-account delete must affect no rows';

  FOREACH target IN ARRAY ARRAY[
    '71000000-0000-4000-8000-000000000002/avatar.webp',
    '71000000-0000-4000-8000-000000000001/other.webp',
    '71000000-0000-4000-8000-000000000001/folder/avatar.webp',
    '71000000-0000-4000-8000-000000000001/../000000000002/avatar.webp',
    'avatar.webp'
  ] LOOP
    PERFORM pg_temp.expect_avatar_denied(format('INSERT INTO storage.objects(bucket_id,name) VALUES (%L,%L)', 'avatars',target));
    PERFORM pg_temp.expect_avatar_denied(format('UPDATE storage.objects SET name=%L WHERE bucket_id=%L AND name=%L',target,'avatars','71000000-0000-4000-8000-000000000001/avatar.webp'));
  END LOOP;
  PERFORM pg_temp.expect_avatar_denied($q$INSERT INTO storage.objects(bucket_id,name) VALUES ('exercise-media','71000000-0000-4000-8000-000000000001/avatar.webp')$q$);
  PERFORM pg_temp.expect_avatar_denied($q$UPDATE storage.objects SET bucket_id='exercise-media' WHERE bucket_id='avatars' AND name='71000000-0000-4000-8000-000000000001/avatar.webp'$q$);
  PERFORM pg_temp.expect_avatar_denied($q$INSERT INTO storage.objects(bucket_id,name) VALUES ('avatars','71000000-0000-4000-8000-000000000002/avatar.webp') ON CONFLICT(bucket_id,name) DO UPDATE SET metadata='{}'$q$);
END;
$$;

SET LOCAL "request.jwt.claim.sub"='71000000-0000-4000-8000-000000000003';
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='avatars';
  ASSERT n=0, 'Suspended account must not list avatars';
  UPDATE storage.objects SET metadata='{}' WHERE bucket_id='avatars' AND name='71000000-0000-4000-8000-000000000003/avatar.webp';
  GET DIAGNOSTICS n=ROW_COUNT; ASSERT n=0, 'Suspended update must affect no rows';
  DELETE FROM storage.objects WHERE bucket_id='avatars' AND name='71000000-0000-4000-8000-000000000003/avatar.webp';
  GET DIAGNOSTICS n=ROW_COUNT; ASSERT n=0, 'Suspended delete must affect no rows';
  PERFORM pg_temp.expect_avatar_denied($q$INSERT INTO storage.objects(bucket_id,name) VALUES ('avatars','71000000-0000-4000-8000-000000000003/avatar.webp')$q$);
END;
$$;

SET LOCAL "request.jwt.claim.sub"='71000000-0000-4000-8000-000000000004';
SELECT pg_temp.expect_avatar_denied($q$INSERT INTO storage.objects(bucket_id,name) VALUES ('avatars','71000000-0000-4000-8000-000000000004/avatar.webp')$q$);
SET LOCAL "request.jwt.claim.sub"='';
SELECT pg_temp.expect_avatar_denied($q$INSERT INTO storage.objects(bucket_id,name) VALUES ('avatars','71000000-0000-4000-8000-000000000001/avatar.webp')$q$);
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claim.role"='anon';
SELECT pg_temp.expect_avatar_denied($q$INSERT INTO storage.objects(bucket_id,name) VALUES ('avatars','71000000-0000-4000-8000-000000000001/avatar.webp')$q$);
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='avatars';
  ASSERT n=0, 'Anonymous API must not enumerate avatar metadata';
  UPDATE storage.objects SET metadata='{}' WHERE bucket_id='avatars' AND name='71000000-0000-4000-8000-000000000001/avatar.webp';
  GET DIAGNOSTICS n=ROW_COUNT; ASSERT n=0, 'Anonymous update must affect no rows';
  DELETE FROM storage.objects WHERE bucket_id='avatars' AND name='71000000-0000-4000-8000-000000000001/avatar.webp';
  GET DIAGNOSTICS n=ROW_COUNT; ASSERT n=0, 'Anonymous delete must affect no rows';
END;
$$;

RESET ROLE;
DO $$
BEGIN
  ASSERT (SELECT md5(COALESCE(string_agg(to_jsonb(o)::text,'' ORDER BY id),'')) FROM storage.objects o
    WHERE NOT (bucket_id='avatars' AND name IN ('71000000-0000-4000-8000-000000000001/avatar.webp','71000000-0000-4000-8000-000000000002/avatar.webp','71000000-0000-4000-8000-000000000003/avatar.webp')))
    = (SELECT objects_digest FROM avatar_storage_before), 'Existing objects, including exercise catalog, must remain unchanged';
END;
$$;
ROLLBACK;
SELECT 'PASS: avatar owner CRUD/upsert, inactive/anonymous/cross-account/path denial; all fixtures rolled back' AS result;

INSERT INTO auth.users(id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
DO $$
DECLARE
  p jsonb := '{"version":1,"accountId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","remoteUserId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","email":"a@example.invalid","revision":2,"lastSyncedRevision":0,"remoteRevision":null,"tables":{"measurements":[{"weight_kg":null,"body_fat_percentage":21,"muscle_mass_kg":48,"chest_cm":90,"waist_cm":71,"hips_cm":98,"arms_cm":29,"legs_cm":52}],"progress_logs":[{"session_context_snapshot":{"untouched":"yes"}}]}}';
  first_revision uuid;
  retry_revision uuid;
  next_revision uuid;
  received jsonb;
BEGIN
  SELECT revision INTO first_revision FROM public.original_app_snapshot_push_v1(null, repeat('a',64), p);
  SELECT revision INTO retry_revision FROM public.original_app_snapshot_push_v1(null, repeat('a',64), p);
  IF first_revision IS DISTINCT FROM retry_revision THEN RAISE EXCEPTION 'Lost-response retry changed revision'; END IF;
  SELECT payload INTO received FROM public.original_app_snapshot_read_v1();
  IF received IS DISTINCT FROM p THEN RAISE EXCEPTION 'Complete original state did not round trip'; END IF;
  BEGIN
    PERFORM public.original_app_snapshot_push_v1(null, repeat('a',64), jsonb_set(p,'{revision}','3'));
    RAISE EXCEPTION 'Expected immutable operation mismatch';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'ORIGINAL_SNAPSHOT_IDEMPOTENCY_MISMATCH' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.original_app_snapshot_push_v1(null, repeat('b',64), p);
    RAISE EXCEPTION 'Expected stale revision conflict';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'ORIGINAL_SNAPSHOT_CONFLICT' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.original_app_snapshot_push_v1(first_revision, repeat('c',64), jsonb_set(p,'{accountId}','"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"'));
    RAISE EXCEPTION 'Expected owner rejection';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'ORIGINAL_SNAPSHOT_INVALID_PAYLOAD' THEN RAISE; END IF; END;
  SELECT revision INTO next_revision FROM public.original_app_snapshot_push_v1(first_revision, repeat('d',64), jsonb_set(p,'{revision}','3'));
  IF next_revision IS NOT DISTINCT FROM first_revision THEN RAISE EXCEPTION 'CAS update did not advance revision'; END IF;
  -- Retrying an earlier receipt returns its receipt without rolling the head back.
  PERFORM public.original_app_snapshot_push_v1(null, repeat('a',64), p);
  IF (SELECT revision FROM public.original_app_snapshot_read_v1()) IS DISTINCT FROM next_revision THEN RAISE EXCEPTION 'Old retry rolled back the head'; END IF;
  BEGIN
    DELETE FROM public.original_app_snapshots;
    RAISE EXCEPTION 'Expected direct-write denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
DO $$ BEGIN
  IF EXISTS (SELECT FROM public.original_app_snapshots) OR EXISTS (SELECT FROM public.original_app_snapshot_read_v1()) THEN RAISE EXCEPTION 'Cross-account snapshot exposure'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF has_function_privilege('anon','public.original_app_snapshot_read_v1()','EXECUTE')
    OR has_function_privilege('anon','public.original_app_snapshot_push_v1(uuid,text,jsonb)','EXECUTE')
    OR has_table_privilege('authenticated','public.original_app_snapshot_operations','SELECT')
  THEN RAISE EXCEPTION 'Unexpected snapshot privileges'; END IF;
END $$;
UPDATE public.original_snapshot_test_access SET active = false WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
DO $$ BEGIN
  IF EXISTS (SELECT FROM public.original_app_snapshots) THEN RAISE EXCEPTION 'Suspended account read exposed'; END IF;
  BEGIN PERFORM public.original_app_snapshot_read_v1(); RAISE EXCEPTION 'Expected suspension denial';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'ORIGINAL_SNAPSHOT_AUTH_REQUIRED' THEN RAISE; END IF; END;
END $$;
RESET ROLE;

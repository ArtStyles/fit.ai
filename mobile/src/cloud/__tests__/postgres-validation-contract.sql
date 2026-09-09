\set ON_ERROR_STOP on
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
DO $$ DECLARE value jsonb; entity uuid := gen_random_uuid(); BEGIN
  SELECT jsonb_set(payload,'{id}',to_jsonb(entity::text)) INTO value FROM public.mobile_sync_entities WHERE kind='plan' LIMIT 1;
  BEGIN
    PERFORM public.mobile_sync_push_v1(gen_random_uuid(),'plan',entity,value - 'name','2026-09-01');
    RAISE EXCEPTION 'missing plan name accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'MOBILE_SYNC_INVALID_PAYLOAD' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.mobile_sync_push_v1(gen_random_uuid(),'plan',entity,value - 'createdAt','2026-09-01');
    RAISE EXCEPTION 'missing timestamp accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'MOBILE_SYNC_INVALID_PAYLOAD' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.mobile_sync_push_v1(gen_random_uuid(),'profile',auth.uid(),jsonb_build_object('id',auth.uid(),'remoteUserId',auth.uid(),'profile','{}'::jsonb),'2026-09-01');
    RAISE EXCEPTION 'invalid profile accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'MOBILE_SYNC_INVALID_PAYLOAD' THEN RAISE; END IF; END;
  SELECT e.payload INTO value FROM public.mobile_sync_entities e WHERE kind='plan' LIMIT 1;
  BEGIN
    PERFORM public.mobile_sync_push_v1(gen_random_uuid(),'plan',(value->>'id')::uuid,value || '{"name":"conflicting same timestamp"}', '2026-09-01');
    RAISE EXCEPTION 'equal version silently acknowledged';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'MOBILE_SYNC_VERSION_CONFLICT' THEN RAISE; END IF; END;
END $$;
SELECT 'mobile payload validation contracts passed' AS result;

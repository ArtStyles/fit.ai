\set ON_ERROR_STOP on
-- Execute after postgres-contract.sql on its disposable fixture database.
INSERT INTO public.workout_plans(id,user_id,source_type) VALUES ('66666666-6666-4666-8666-666666666666','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','trainer_assigned');
INSERT INTO public.workouts(id,plan_id,user_id) VALUES ('77777777-7777-4777-8777-777777777777','66666666-6666-4666-8666-666666666666','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO public.workout_exercises VALUES ('88888888-8888-4888-8888-888888888888','77777777-7777-4777-8777-777777777777','99999999-9999-4999-8999-999999999999',1,8,null,60,10,7);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
DO $$
DECLARE
  measurement_id uuid := gen_random_uuid();
  session_id uuid := gen_random_uuid();
  payload jsonb; session_value jsonb;
BEGIN
  payload := jsonb_build_object('id',measurement_id,'accountId',auth.uid(),'date','2026-09-01','weightKg',75,'waistCm',null,'notes','','updatedAt','2026-09-02T00:00:00Z','deletedAt',null);
  PERFORM public.mobile_sync_push_v1(gen_random_uuid(),'measurement',measurement_id,payload,'2026-09-02');
  PERFORM public.mobile_sync_push_v1(gen_random_uuid(),'measurement',measurement_id,payload || '{"weightKg":60,"updatedAt":"2026-09-01T00:00:00Z"}', '2026-09-01');
  IF (SELECT e.payload->>'weightKg' FROM public.mobile_sync_entities e WHERE e.entity_id=measurement_id) <> '75' THEN RAISE EXCEPTION 'stale write won'; END IF;
  payload := payload || '{"deletedAt":"2026-09-03T00:00:00Z","updatedAt":"2026-09-03T00:00:00Z"}';
  PERFORM public.mobile_sync_push_v1(gen_random_uuid(),'measurement',measurement_id,payload,'2026-09-03');
  IF (SELECT e.payload->>'deletedAt' FROM public.mobile_sync_entities e WHERE e.entity_id=measurement_id) IS NULL THEN RAISE EXCEPTION 'deletion not retained'; END IF;
  session_value := jsonb_build_object('id',session_id,'accountId',auth.uid(),'remoteId',null,'planId','66666666-6666-4666-8666-666666666666','workoutId','77777777-7777-4777-8777-777777777777','workoutName','Profesional','source','trainer','startedAt','2026-09-01T10:00:00Z','finishedAt','2026-09-01T10:30:00Z','rpe',7,'notes','','exercises',jsonb_build_array(jsonb_build_object('prescription','{"id":"88888888-8888-4888-8888-888888888888","exerciseId":"99999999-9999-4999-8999-999999999999","name":"Sentadilla","imageUrl":null,"instructions":"","sets":1,"reps":8,"durationSeconds":null,"restSeconds":60,"weightKg":10,"targetRpe":7}'::jsonb,'sets',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'reps',7,'weightKg',11,'durationSeconds',null,'completed',true)))));
  PERFORM public.mobile_sync_push_v1(gen_random_uuid(),'session',session_id,session_value,'2026-09-01');
  BEGIN
    PERFORM public.mobile_sync_push_v1(gen_random_uuid(),'session',session_id,jsonb_set(session_value,'{exercises,0,prescription,weightKg}','20'),'2026-09-02');
    RAISE EXCEPTION 'trainer prescription changed';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'MOBILE_SYNC_CANONICAL_MISMATCH' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.mobile_sync_push_v1(gen_random_uuid(),'measurement',measurement_id,payload - 'weightKg','2026-09-03');
    RAISE EXCEPTION 'missing weight accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'MOBILE_SYNC_INVALID_PAYLOAD' THEN RAISE; END IF; END;
  PERFORM set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
  BEGIN
    PERFORM public.mobile_sync_push_v1(gen_random_uuid(),'session',session_id,jsonb_set(session_value,'{accountId}',to_jsonb(auth.uid()::text)),'2026-09-01');
    RAISE EXCEPTION 'stolen trainer workout accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'MOBILE_SYNC_CANONICAL_MISMATCH' THEN RAISE; END IF; END;
  PERFORM set_config('request.jwt.claim.sub','',true);
  BEGIN
    PERFORM public.mobile_sync_push_v1(gen_random_uuid(),'measurement',measurement_id,payload,'2026-09-03');
    RAISE EXCEPTION 'missing auth accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'MOBILE_SYNC_AUTH_REQUIRED' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
SELECT 'mobile trainer, stale-write, tombstone and auth contracts passed' AS result;

-- Private, explicitly created fitness identity and directed consent. Evidence is
-- a bounded projection of self-recorded training, never a verified achievement.
BEGIN;
CREATE TABLE private.fitness_cards (
 owner_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 artistic_name text NOT NULL DEFAULT '' CHECK(char_length(artistic_name)<=60),
 theme text NOT NULL CHECK(theme IN ('violet','ember','ice')),
 evidence jsonb NOT NULL,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.fitness_card_access (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES private.fitness_cards(owner_id) ON DELETE CASCADE,
 viewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 status text NOT NULL CHECK(status IN ('pending','accepted','rejected','revoked')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,viewer_id), CHECK(owner_id<>viewer_id)
);
CREATE INDEX fitness_card_access_viewer ON private.fitness_card_access(viewer_id);
REVOKE ALL ON private.fitness_cards,private.fitness_card_access FROM PUBLIC,anon,authenticated;
CREATE TABLE public.fitness_card_updates (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 revision bigint NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fitness_card_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fitness_card_updates FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.fitness_card_updates TO authenticated;
CREATE POLICY "fitness card own signal" ON public.fitness_card_updates FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()));
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_publication WHERE pubname='supabase_realtime') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.fitness_card_updates;
 END IF;
END $$;

CREATE FUNCTION private.fitness_actor() RETURNS uuid LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); BEGIN
 IF actor IS NULL OR NOT public.is_account_active(actor) THEN RAISE EXCEPTION 'FITNESS_CARD_AUTH_REQUIRED'; END IF;
 RETURN actor;
END $$;
CREATE FUNCTION private.fitness_lock() RETURNS void LANGUAGE sql SET search_path='' AS $$
 -- One feature-specific lock gives edits, photo touches and directed consent a
 -- common order. These small, infrequent mutations never lock training writes.
 SELECT pg_advisory_xact_lock(9120400);
$$;
CREATE FUNCTION private.fitness_signal(person uuid) RETURNS void LANGUAGE sql SET search_path='' AS $$
 INSERT INTO public.fitness_card_updates(user_id) VALUES(person)
 ON CONFLICT(user_id) DO UPDATE SET revision=fitness_card_updates.revision+1,updated_at=clock_timestamp();
$$;
CREATE FUNCTION private.fitness_signal_owner(person uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE viewer uuid; BEGIN
 PERFORM private.fitness_signal(person);
 FOR viewer IN SELECT viewer_id FROM private.fitness_card_access WHERE owner_id=person AND status='accepted' LOOP
  PERFORM private.fitness_signal(viewer);
 END LOOP;
END $$;
CREATE FUNCTION private.fitness_identity(person uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('userId',id,'name',coalesce(nullif(btrim(full_name),''),username,'Vekira'),
 'username',username,'avatarUrl',avatar_url) FROM public.profiles WHERE id=person;
$$;
CREATE FUNCTION private.fitness_can_read(person uuid,viewer uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT viewer IS NOT NULL AND public.is_account_active(viewer) AND public.is_account_active(person)
 AND EXISTS(SELECT FROM private.fitness_cards WHERE owner_id=person)
 AND (viewer=person OR EXISTS(SELECT FROM private.fitness_card_access WHERE owner_id=person AND viewer_id=viewer AND status='accepted'));
$$;
CREATE FUNCTION private.fitness_card_json(person uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('owner',private.fitness_identity(person),'artisticName',c.artistic_name,'theme',c.theme,
 'revision',c.revision,'evidence',c.evidence,'updatedAt',c.updated_at,'photos',coalesce((
 SELECT jsonb_agg(jsonb_build_object('slot',substring(o.name from '/([123])\.webp$')::int,'path',o.name) ORDER BY o.name)
 FROM storage.objects o WHERE o.bucket_id='fitness-card-photos' AND o.name IN(person::text||'/1.webp',person::text||'/2.webp',person::text||'/3.webp')),'[]'::jsonb))
 FROM private.fitness_cards c WHERE c.owner_id=person;
$$;
CREATE FUNCTION private.fitness_hub(viewer uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('viewerId',viewer,'own',private.fitness_card_json(viewer),
 'received',coalesce((SELECT jsonb_agg(jsonb_build_object('owner',private.fitness_identity(c.owner_id),'artisticName',c.artistic_name,'theme',c.theme,'updatedAt',c.updated_at) ORDER BY c.updated_at DESC,c.owner_id)
 FROM private.fitness_card_access a JOIN private.fitness_cards c ON c.owner_id=a.owner_id WHERE a.viewer_id=viewer AND a.status='accepted' AND public.is_account_active(a.owner_id)),'[]'::jsonb),
 'access',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'owner',private.fitness_identity(a.owner_id),'viewer',private.fitness_identity(a.viewer_id),'status',a.status,'updatedAt',a.updated_at) ORDER BY a.updated_at DESC,a.id)
 FROM private.fitness_card_access a WHERE (a.owner_id=viewer OR a.viewer_id=viewer) AND public.is_account_active(a.owner_id) AND public.is_account_active(a.viewer_id)),'[]'::jsonb));
$$;
CREATE FUNCTION private.fitness_handle(raw text) RETURNS uuid LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE handle text:=lower(regexp_replace(btrim(raw),'^@','')); person uuid; matches int;
BEGIN
 IF handle IS NULL OR handle !~ '^[a-z][a-z0-9_]{2,19}$' THEN RAISE EXCEPTION 'FITNESS_CARD_HANDLE_UNAVAILABLE'; END IF;
 SELECT count(*),min(id::text)::uuid INTO matches,person FROM public.profiles WHERE lower(username)=handle;
 IF matches<>1 OR NOT public.is_account_active(person) THEN RAISE EXCEPTION 'FITNESS_CARD_HANDLE_UNAVAILABLE'; END IF;
 RETURN person;
END $$;
CREATE FUNCTION public.get_fitness_card_state() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT private.fitness_hub(private.fitness_actor());
$$;
CREATE FUNCTION public.get_fitness_card(p_owner_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.fitness_can_read(p_owner_id,private.fitness_actor()) THEN RAISE EXCEPTION 'FITNESS_CARD_NOT_ALLOWED'; END IF;
 RETURN private.fitness_card_json(p_owner_id);
END $$;
CREATE FUNCTION public.save_fitness_card(p_artistic_name text,p_theme text,p_expected_revision bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.fitness_actor(); current_revision bigint; username text;
BEGIN
 PERFORM private.fitness_lock();
 IF p_artistic_name IS NULL OR char_length(p_artistic_name)>60 OR p_theme IS NULL OR p_theme NOT IN('violet','ember','ice') THEN RAISE EXCEPTION 'FITNESS_CARD_INVALID'; END IF;
 SELECT revision INTO current_revision FROM private.fitness_cards WHERE owner_id=actor FOR UPDATE;
 IF p_expected_revision IS NULL OR p_expected_revision<>coalesce(current_revision,0) THEN RAISE EXCEPTION 'FITNESS_CARD_CONFLICT'; END IF;
 IF current_revision IS NULL THEN
  SELECT p.username INTO username FROM public.profiles p WHERE id=actor;
  IF private.fitness_handle(username)<>actor THEN RAISE EXCEPTION 'FITNESS_CARD_HANDLE_UNAVAILABLE'; END IF;
  INSERT INTO private.fitness_cards(owner_id,artistic_name,theme,evidence) VALUES(actor,btrim(p_artistic_name),p_theme,
   jsonb_build_object('records','[]'::jsonb,'muscles','[]'::jsonb,'totalSessions',0,'partialSessions',0,
    'rangeFrom',(current_date-83)::text,'rangeTo',current_date::text,'updatedAt',now()));
 ELSE
  UPDATE private.fitness_cards SET artistic_name=btrim(p_artistic_name),theme=p_theme,revision=revision+1,updated_at=clock_timestamp() WHERE owner_id=actor;
 END IF;
 PERFORM private.fitness_signal_owner(actor);
 RETURN private.fitness_card_json(actor);
END $$;

CREATE FUNCTION private.fitness_validate_evidence(e jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE item jsonb; from_day date; to_day date; seen text[]:='{}'; total int;
BEGIN
 IF e IS NULL OR octet_length(e::text)>32768 OR jsonb_typeof(e)<>'object' OR e - ARRAY['records','muscles','totalSessions','partialSessions','rangeFrom','rangeTo','updatedAt']<>'{}'::jsonb
 OR NOT e ?& ARRAY['records','muscles','totalSessions','partialSessions','rangeFrom','rangeTo','updatedAt']
 OR jsonb_typeof(e->'records')<>'array' OR jsonb_array_length(e->'records')>12
 OR jsonb_typeof(e->'muscles')<>'array' OR jsonb_array_length(e->'muscles')>18
 OR e->>'totalSessions' !~ '^(0|[1-9][0-9]{0,5})$' OR jsonb_typeof(e->'totalSessions')<>'number'
 OR e->>'partialSessions' !~ '^(0|[1-9][0-9]{0,5})$' OR jsonb_typeof(e->'partialSessions')<>'number'
 OR jsonb_typeof(e->'rangeFrom')<>'string' OR jsonb_typeof(e->'rangeTo')<>'string' OR jsonb_typeof(e->'updatedAt')<>'string'
 OR e->>'rangeFrom' !~ '^\d{4}-\d{2}-\d{2}$' OR e->>'rangeTo' !~ '^\d{4}-\d{2}-\d{2}$'
 OR e->>'updatedAt' !~ '^\d{4}-\d{2}-\d{2}T' THEN RETURN false; END IF;
 from_day:=(e->>'rangeFrom')::date; to_day:=(e->>'rangeTo')::date; total:=(e->>'totalSessions')::int;
 IF to_day-from_day<>83 OR (e->>'partialSessions')::int>total OR (e->>'updatedAt')::timestamptz IS NULL THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(e->'muscles') LOOP
  IF jsonb_typeof(item)<>'object' OR item - ARRAY['id','sessions']<>'{}'::jsonb OR NOT item ?& ARRAY['id','sessions']
   OR jsonb_typeof(item->'id')<>'string' OR item->>'id' NOT IN('chest','back','traps','lower_back','shoulders','biceps','triceps','forearms','core','glutes','quads','hamstrings','calves','hips','neck','tibialis','rotator_cuff','anconeus')
   OR item->>'id'=ANY(seen) OR jsonb_typeof(item->'sessions')<>'number' OR item->>'sessions' !~ '^(0|[1-9][0-9]{0,5})$' OR (item->>'sessions')::int>total THEN RETURN false; END IF;
  seen:=array_append(seen,item->>'id');
 END LOOP;
 seen:='{}';
 FOR item IN SELECT value FROM jsonb_array_elements(e->'records') LOOP
  IF jsonb_typeof(item)<>'object' OR item - ARRAY['exerciseId','name','kind','weightKg','reps','seconds','date']<>'{}'::jsonb
   OR NOT item ?& ARRAY['exerciseId','name','kind','weightKg','reps','seconds','date']
   OR jsonb_typeof(item->'exerciseId')<>'string' OR char_length(item->>'exerciseId') NOT BETWEEN 1 AND 160
   OR item->>'exerciseId'=ANY(seen) OR jsonb_typeof(item->'name')<>'string' OR char_length(btrim(item->>'name')) NOT BETWEEN 1 AND 160
   OR jsonb_typeof(item->'kind')<>'string' OR jsonb_typeof(item->'date')<>'string'
   OR item->>'kind' NOT IN('strength','duration') OR item->>'date' !~ '^\d{4}-\d{2}-\d{2}$' OR (item->>'date')::date>to_day THEN RETURN false; END IF;
  IF item->>'kind'='strength' THEN
   IF jsonb_typeof(item->'weightKg')<>'number' OR (item->>'weightKg')::numeric NOT BETWEEN 0 AND 500
   OR jsonb_typeof(item->'reps')<>'number' OR item->>'reps' !~ '^[1-9][0-9]{0,2}$' OR (item->>'reps')::numeric>100 OR item->'seconds'<>'null'::jsonb THEN RETURN false; END IF;
  ELSE
   IF item->'weightKg'<>'null'::jsonb OR item->'reps'<>'null'::jsonb OR jsonb_typeof(item->'seconds')<>'number'
   OR (item->>'seconds')::numeric<1 OR (item->>'seconds')::numeric>43200 THEN RETURN false; END IF;
  END IF;
  seen:=array_append(seen,item->>'exerciseId');
 END LOOP;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
CREATE FUNCTION public.publish_fitness_card_evidence(p_evidence jsonb,p_expected_revision bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.fitness_actor(); current_revision bigint;
BEGIN
 PERFORM private.fitness_lock();
 IF NOT private.fitness_validate_evidence(p_evidence) THEN RAISE EXCEPTION 'FITNESS_CARD_INVALID'; END IF;
 -- Civil day can be tomorrow in the owner's timezone, but never further.
 IF (p_evidence->>'rangeTo')::date>current_date+1 OR (p_evidence->>'updatedAt')::timestamptz>now()+interval '5 minutes' THEN RAISE EXCEPTION 'FITNESS_CARD_INVALID'; END IF;
 SELECT revision INTO current_revision FROM private.fitness_cards WHERE owner_id=actor FOR UPDATE;
 IF current_revision IS NULL THEN RAISE EXCEPTION 'FITNESS_CARD_NOT_FOUND'; END IF;
 IF p_expected_revision IS NULL OR p_expected_revision<>current_revision THEN RAISE EXCEPTION 'FITNESS_CARD_CONFLICT'; END IF;
 UPDATE private.fitness_cards SET evidence=p_evidence,revision=revision+1,updated_at=clock_timestamp() WHERE owner_id=actor;
 PERFORM private.fitness_signal_owner(actor);
 RETURN private.fitness_card_json(actor);
END $$;
CREATE FUNCTION public.fitness_card_access(p_action text,p_handle text DEFAULT NULL,p_request_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.fitness_actor(); target uuid; owner_person uuid; viewer_person uuid; link private.fitness_card_access%ROWTYPE; next_status text;
BEGIN
 PERFORM private.fitness_lock();
 IF p_action IN('share','request') THEN
  IF p_request_id IS NOT NULL THEN RAISE EXCEPTION 'FITNESS_CARD_INVALID'; END IF;
  target:=private.fitness_handle(p_handle);
  IF target=actor THEN RAISE EXCEPTION 'FITNESS_CARD_INVALID'; END IF;
  IF p_action='share' THEN owner_person:=actor; viewer_person:=target; ELSE owner_person:=target; viewer_person:=actor; END IF;
  IF NOT EXISTS(SELECT FROM private.fitness_cards WHERE owner_id=owner_person) THEN RAISE EXCEPTION 'FITNESS_CARD_NOT_FOUND'; END IF;
  -- Both ends must possess an unambiguous valid account handle.
  IF private.fitness_handle((SELECT username FROM public.profiles WHERE id=actor))<>actor THEN RAISE EXCEPTION 'FITNESS_CARD_HANDLE_UNAVAILABLE'; END IF;
  SELECT * INTO link FROM private.fitness_card_access WHERE owner_id=owner_person AND viewer_id=viewer_person FOR UPDATE;
  IF link.status='accepted' OR (link.status='pending' AND p_action='request') THEN RETURN private.fitness_hub(actor); END IF;
  next_status:=CASE WHEN p_action='share' THEN 'accepted' ELSE 'pending' END;
  INSERT INTO private.fitness_card_access(owner_id,viewer_id,status) VALUES(owner_person,viewer_person,next_status)
  ON CONFLICT(owner_id,viewer_id) DO UPDATE SET id=gen_random_uuid(),status=excluded.status,updated_at=clock_timestamp();
 ELSE
  IF p_action IS NULL OR p_action NOT IN('accept','reject','revoke','cancel','leave') OR p_handle IS NOT NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'FITNESS_CARD_INVALID'; END IF;
  SELECT * INTO link FROM private.fitness_card_access WHERE id=p_request_id FOR UPDATE;
  IF link.id IS NULL OR NOT public.is_account_active(link.owner_id) OR NOT public.is_account_active(link.viewer_id) THEN RAISE EXCEPTION 'FITNESS_CARD_NOT_ALLOWED'; END IF;
  IF p_action IN('accept','reject','revoke') THEN
   IF actor<>link.owner_id OR (p_action IN('accept','reject') AND link.status<>'pending') OR (p_action='revoke' AND link.status<>'accepted') THEN RAISE EXCEPTION 'FITNESS_CARD_NOT_ALLOWED'; END IF;
  ELSE
   IF actor<>link.viewer_id OR (p_action='cancel' AND link.status<>'pending') OR (p_action='leave' AND link.status<>'accepted') THEN RAISE EXCEPTION 'FITNESS_CARD_NOT_ALLOWED'; END IF;
  END IF;
  owner_person:=link.owner_id; viewer_person:=link.viewer_id;
  UPDATE private.fitness_card_access SET status=CASE WHEN p_action='accept' THEN 'accepted' WHEN p_action='reject' THEN 'rejected' ELSE 'revoked' END,updated_at=clock_timestamp() WHERE id=link.id;
 END IF;
 PERFORM private.fitness_signal(owner_person); PERFORM private.fitness_signal(viewer_person);
 RETURN private.fitness_hub(actor);
END $$;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('fitness-card-photos','fitness-card-photos',false,2097152,ARRAY['image/webp']);
CREATE FUNCTION public.fitness_card_photo_allowed(object_name text,writing boolean) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE person uuid;
BEGIN
 IF object_name IS NULL OR object_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[123]\.webp$' THEN RETURN false; END IF;
 person:=split_part(object_name,'/',1)::uuid;
 RETURN private.fitness_can_read(person,auth.uid()) AND (NOT writing OR person=auth.uid());
END $$;
CREATE POLICY "fitness photo select" ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='fitness-card-photos' AND public.fitness_card_photo_allowed(name,false));
CREATE POLICY "fitness photo insert" ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='fitness-card-photos' AND public.fitness_card_photo_allowed(name,true));
CREATE POLICY "fitness photo update" ON storage.objects FOR UPDATE TO authenticated
 USING(bucket_id='fitness-card-photos' AND public.fitness_card_photo_allowed(name,true))
 WITH CHECK(bucket_id='fitness-card-photos' AND public.fitness_card_photo_allowed(name,true));
CREATE POLICY "fitness photo delete" ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='fitness-card-photos' AND public.fitness_card_photo_allowed(name,true));
CREATE FUNCTION private.fitness_photo_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE path text; bucket text; person uuid;
BEGIN
 IF TG_OP='DELETE' THEN path:=OLD.name; bucket:=OLD.bucket_id; ELSE path:=NEW.name; bucket:=NEW.bucket_id; END IF;
 IF TG_OP='UPDATE' AND (NEW.bucket_id='fitness-card-photos' OR OLD.bucket_id='fitness-card-photos') AND (NEW.name IS DISTINCT FROM OLD.name OR NEW.bucket_id IS DISTINCT FROM OLD.bucket_id) THEN RAISE EXCEPTION 'FITNESS_CARD_INVALID'; END IF;
 IF bucket<>'fitness-card-photos' THEN RETURN NULL; END IF;
 IF path !~ '^[0-9a-f-]{36}/[123]\.webp$' THEN RAISE EXCEPTION 'FITNESS_CARD_INVALID'; END IF;
 person:=split_part(path,'/',1)::uuid;
 PERFORM private.fitness_lock();
 UPDATE private.fitness_cards SET revision=revision+1,updated_at=clock_timestamp() WHERE owner_id=person;
 IF FOUND THEN PERFORM private.fitness_signal_owner(person); END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER fitness_photo_changed AFTER INSERT OR UPDATE OR DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION private.fitness_photo_changed();
CREATE FUNCTION private.fitness_profile_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE counterpart uuid;
BEGIN
 IF NEW.full_name IS DISTINCT FROM OLD.full_name OR NEW.username IS DISTINCT FROM OLD.username OR NEW.avatar_url IS DISTINCT FROM OLD.avatar_url OR NEW.account_status IS DISTINCT FROM OLD.account_status OR NEW.suspended_until IS DISTINCT FROM OLD.suspended_until THEN
  PERFORM private.fitness_lock();
  UPDATE private.fitness_cards SET revision=revision+1,updated_at=clock_timestamp() WHERE owner_id=NEW.id;
  PERFORM private.fitness_signal(NEW.id);
  FOR counterpart IN SELECT DISTINCT CASE WHEN owner_id=NEW.id THEN viewer_id ELSE owner_id END FROM private.fitness_card_access WHERE owner_id=NEW.id OR viewer_id=NEW.id LOOP
   PERFORM private.fitness_signal(counterpart);
  END LOOP;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER fitness_profile_changed AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.fitness_profile_changed();
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'fitness_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.get_fitness_card_state(),public.get_fitness_card(uuid),public.save_fitness_card(text,text,bigint),public.publish_fitness_card_evidence(jsonb,bigint),public.fitness_card_access(text,text,uuid),public.fitness_card_photo_allowed(text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_fitness_card_state(),public.get_fitness_card(uuid),public.save_fitness_card(text,text,bigint),public.publish_fitness_card_evidence(jsonb,bigint),public.fitness_card_access(text,text,uuid),public.fitness_card_photo_allowed(text,boolean) TO authenticated;
COMMIT;

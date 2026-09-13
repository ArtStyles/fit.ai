-- Optional external profile links and stable-ID QR requests. A scan grants no access.
BEGIN;
CREATE FUNCTION private.fitness_social_links_valid(links jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE item record; handle text;
BEGIN
 IF links IS NULL OR jsonb_typeof(links)<>'object' OR links-ARRAY['instagram','x','facebook']<>'{}'::jsonb THEN RETURN false; END IF;
 FOR item IN SELECT key,value FROM jsonb_each(links) LOOP
  IF jsonb_typeof(item.value)<>'string' OR char_length(item.value#>>'{}')>300 THEN RETURN false; END IF;
  handle:=item.value#>>'{}';
  IF item.key='facebook' AND handle ~ '^https://facebook\.com/profile\.php\?id=[0-9]{1,20}$' THEN CONTINUE; END IF;
  IF item.key='instagram' THEN
   IF handle !~ '^https://instagram\.com/[a-z0-9_]([a-z0-9_.]{0,28}[a-z0-9_])?$' THEN RETURN false; END IF;
  ELSIF item.key='x' THEN
   IF handle !~ '^https://x\.com/[a-z0-9_]{1,15}$' THEN RETURN false; END IF;
  ELSE
   IF handle !~ '^https://facebook\.com/[a-z0-9]([a-z0-9.]{0,98}[a-z0-9])?$' THEN RETURN false; END IF;
  END IF;
  handle:=split_part(handle,'/',4);
  IF item.key='facebook' AND handle LIKE '%.php' THEN RETURN false; END IF;
  IF position('..' in handle)>0 OR handle IN('login','logout','signup','signin','share','sharing','sharer','sharer.php','intent','home','explore','p','reel','reels','stories','accounts','account','direct','settings','search','i','compose','messages','notifications','hashtag','watch','marketplace','groups','events','pages','plugins','dialog','dialogs','l.php','business','developers','help','privacy','terms','about','legal','oauth','tos') THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
ALTER TABLE private.fitness_cards ADD COLUMN social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD CONSTRAINT fitness_card_social_links_valid CHECK(private.fitness_social_links_valid(social_links));

CREATE OR REPLACE FUNCTION private.fitness_card_json(person uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('owner',private.fitness_identity(person),'artisticName',c.artistic_name,'theme',c.theme,'socialLinks',c.social_links,
 'revision',c.revision,'evidence',c.evidence,'updatedAt',c.updated_at,'photos',coalesce((
 SELECT jsonb_agg(jsonb_build_object('slot',substring(o.name from '/([123])\.webp$')::int,'path',o.name) ORDER BY o.name)
 FROM storage.objects o WHERE o.bucket_id='fitness-card-photos' AND o.name IN(person::text||'/1.webp',person::text||'/2.webp',person::text||'/3.webp')),'[]'::jsonb))
 FROM private.fitness_cards c WHERE c.owner_id=person;
$$;
CREATE OR REPLACE FUNCTION private.fitness_hub(viewer uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('viewerId',viewer,'own',private.fitness_card_json(viewer),
 'received',coalesce((SELECT jsonb_agg(jsonb_build_object('owner',private.fitness_identity(c.owner_id),'artisticName',c.artistic_name,'theme',c.theme,'socialLinks',c.social_links,'updatedAt',c.updated_at) ORDER BY c.updated_at DESC,c.owner_id)
 FROM private.fitness_card_access a JOIN private.fitness_cards c ON c.owner_id=a.owner_id WHERE a.viewer_id=viewer AND a.status='accepted' AND public.is_account_active(a.owner_id)),'[]'::jsonb),
 'access',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'owner',private.fitness_identity(a.owner_id),'viewer',private.fitness_identity(a.viewer_id),'status',a.status,'updatedAt',a.updated_at) ORDER BY a.updated_at DESC,a.id)
 FROM private.fitness_card_access a WHERE (a.owner_id=viewer OR a.viewer_id=viewer) AND public.is_account_active(a.owner_id) AND public.is_account_active(a.viewer_id)),'[]'::jsonb));
$$;
CREATE FUNCTION public.save_fitness_card_v2(p_artistic_name text,p_theme text,p_expected_revision bigint,p_social_links jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.fitness_actor();
BEGIN
 IF NOT private.fitness_social_links_valid(p_social_links) THEN RAISE EXCEPTION 'FITNESS_CARD_INVALID'; END IF;
 -- Existing implementation owns the lock, exact CAS, identity validation and
 -- revision signal. This additional write commits atomically with that revision.
 PERFORM public.save_fitness_card(p_artistic_name,p_theme,p_expected_revision);
 UPDATE private.fitness_cards SET social_links=p_social_links WHERE owner_id=actor;
 RETURN private.fitness_card_json(actor);
END $$;
CREATE FUNCTION public.get_fitness_card_invite(p_owner_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.fitness_actor(); state text;
BEGIN
 IF p_owner_id IS NULL OR NOT public.is_account_active(p_owner_id) OR NOT EXISTS(SELECT FROM private.fitness_cards WHERE owner_id=p_owner_id) THEN RAISE EXCEPTION 'FITNESS_CARD_NOT_ALLOWED'; END IF;
 IF actor=p_owner_id THEN state:='self'; ELSE
  SELECT status INTO state FROM private.fitness_card_access WHERE owner_id=p_owner_id AND viewer_id=actor AND status IN('accepted','pending');
 END IF;
 RETURN jsonb_build_object('owner',private.fitness_identity(p_owner_id),'status',coalesce(state,'available'));
END $$;
CREATE FUNCTION public.request_fitness_card_by_id(p_owner_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.fitness_actor(); handle text;
BEGIN
 PERFORM private.fitness_lock();
 IF actor=p_owner_id THEN RAISE EXCEPTION 'FITNESS_CARD_INVALID'; END IF;
 IF p_owner_id IS NULL OR NOT public.is_account_active(p_owner_id) OR NOT EXISTS(SELECT FROM private.fitness_cards WHERE owner_id=p_owner_id) THEN RAISE EXCEPTION 'FITNESS_CARD_NOT_ALLOWED'; END IF;
 SELECT username INTO handle FROM public.profiles WHERE id=p_owner_id;
 IF private.fitness_handle(handle)<>p_owner_id THEN RAISE EXCEPTION 'FITNESS_CARD_HANDLE_UNAVAILABLE'; END IF;
 RETURN public.fitness_card_access('request',handle,NULL);
END $$;
REVOKE ALL ON FUNCTION private.fitness_social_links_valid(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.save_fitness_card_v2(text,text,bigint,jsonb),public.get_fitness_card_invite(uuid),public.request_fitness_card_by_id(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_fitness_card_v2(text,text,bigint,jsonb),public.get_fitness_card_invite(uuid),public.request_fitness_card_by_id(uuid) TO authenticated;
COMMIT;

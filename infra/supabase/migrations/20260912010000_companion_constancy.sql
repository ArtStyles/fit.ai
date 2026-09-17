-- One private, mutually accepted companion. No social feed or training-detail sharing.
BEGIN;

CREATE TABLE private.companion_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','declined','cancelled','expired','ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  ended_at timestamptz,
  CHECK (requester_id <> recipient_id)
);
-- A single primary key covers both invitation roles, including pending invitations.
CREATE TABLE private.companion_memberships (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  relationship_id uuid NOT NULL REFERENCES private.companion_relationships(id) ON DELETE CASCADE
);
CREATE INDEX companion_memberships_relationship_idx ON private.companion_memberships(relationship_id);
CREATE TABLE private.companion_invite_codes (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE CHECK (code ~ '^VKR-[A-F0-9]{12}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Only the latest receipt per sender. It survives unlink and relationship cleanup
-- to prevent daily quota bypass; immutable retries are retained until the next send.
CREATE TABLE private.companion_greetings (
  sender_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  sent_day date NOT NULL,
  relationship_id uuid NOT NULL,
  request_id uuid NOT NULL,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 120 AND octet_length(message) <= 2048),
  sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.companion_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.companion_relationships FORCE ROW LEVEL SECURITY;
ALTER TABLE private.companion_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.companion_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE private.companion_invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.companion_invite_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE private.companion_greetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.companion_greetings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.companion_relationships, private.companion_memberships,
  private.companion_invite_codes, private.companion_greetings FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.companion_actor() RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE result uuid := auth.uid();
BEGIN
  IF result IS NULL OR NOT public.is_account_active(result) THEN RAISE EXCEPTION 'COMPANION_AUTH_REQUIRED'; END IF;
  RETURN result;
END $$;

CREATE FUNCTION private.companion_lock_users(first_user uuid, second_user uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE item uuid;
BEGIN
  FOR item IN SELECT DISTINCT value FROM unnest(ARRAY[first_user,second_user]) value WHERE value IS NOT NULL ORDER BY value LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(item::text, 9120100));
  END LOOP;
END $$;

-- Call only while holding the listed owners' locks. Other expired member slots
-- are released when their owner next acts; no third owner's row is mutated.
CREATE FUNCTION private.companion_expire_slots(users uuid[]) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE item record;
BEGIN
  FOR item IN SELECT r.id FROM private.companion_relationships r
    WHERE r.status='pending' AND r.expires_at <= now()
      AND EXISTS (SELECT FROM private.companion_memberships m WHERE m.relationship_id=r.id AND m.user_id=ANY(users))
    ORDER BY r.id FOR UPDATE
  LOOP
    UPDATE private.companion_relationships SET status='expired',ended_at=now() WHERE id=item.id;
    PERFORM private.companion_close_invitation(item.id);
  END LOOP;
  DELETE FROM private.companion_memberships m USING private.companion_relationships r
    WHERE m.user_id=ANY(users) AND m.relationship_id=r.id AND r.status NOT IN ('pending','active');
  -- Keep closed state only until either participant starts another action. No
  -- history grows per user; a remaining expired owner slot is cleaned lazily.
  DELETE FROM private.companion_relationships r WHERE r.status NOT IN ('pending','active')
    AND (r.requester_id=ANY(users) OR r.recipient_id=ANY(users))
    AND NOT EXISTS(SELECT FROM private.companion_memberships m WHERE m.relationship_id=r.id);
END $$;

CREATE FUNCTION private.companion_uuid(value text) RETURNS uuid
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN RETURN value::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN NULL; END $$;

CREATE FUNCTION private.companion_time(value text) RETURNS timestamptz
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF length(value) BETWEEN 20 AND 40 AND value ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'
    AND pg_input_is_valid(value,'timestamp with time zone') THEN RETURN value::timestamptz; END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION private.companion_array(value jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT CASE WHEN jsonb_typeof(value)='array' THEN value ELSE '[]'::jsonb END $$;

CREATE FUNCTION private.companion_summary(person_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  snapshot jsonb; snapshot_at timestamptz; zone text; profile_goal integer;
  target integer; start_day date; completed integer; metadata_at timestamptz;
  plan_at timestamptz; progress_at timestamptz;
BEGIN
  SELECT s.payload,s.updated_at INTO snapshot,snapshot_at FROM public.original_app_snapshots s
    WHERE s.user_id=person_id AND s.payload->'version'='1'::jsonb
      AND s.payload->>'accountId'=person_id::text AND s.payload->>'remoteUserId'=person_id::text
      AND jsonb_typeof(s.payload->'tables')='object';
  WITH candidates AS (
    SELECT p.timezone AS tz,p.days_per_week AS goal,p.updated_at AS changed,0 AS priority FROM public.profiles p WHERE p.id=person_id
    UNION ALL
    SELECT row->>'timezone',CASE WHEN row->>'days_per_week' ~ '^[1-7]$' THEN (row->>'days_per_week')::integer END,
      coalesce(private.companion_time(row->>'updated_at'),snapshot_at),1
    FROM jsonb_array_elements(private.companion_array(snapshot#>'{tables,profiles}')) row
    WHERE private.companion_uuid(row->>'id')=person_id
  ) SELECT tz,goal,changed INTO zone,profile_goal,metadata_at FROM candidates ORDER BY changed DESC NULLS LAST,priority LIMIT 1;
  IF zone IS NULL OR NOT EXISTS(SELECT FROM pg_timezone_names WHERE name=zone) THEN zone:='UTC'; END IF;
  start_day:=date_trunc('week',now() AT TIME ZONE zone)::date;
  WITH candidates AS (
    SELECT p.id,p.days_per_week AS goal,p.is_active,p.retired_at IS NOT NULL OR p.superseded_at IS NOT NULL AS unavailable,
      p.updated_at AS changed,0 AS priority FROM public.workout_plans p WHERE p.user_id=person_id
    UNION ALL
    SELECT private.companion_uuid(row->>'id'),CASE WHEN row->>'days_per_week' ~ '^[1-7]$' THEN (row->>'days_per_week')::integer END,
      row->'is_active'='true'::jsonb,(row->>'retired_at') IS NOT NULL OR (row->>'superseded_at') IS NOT NULL,
      coalesce(private.companion_time(row->>'updated_at'),private.companion_time(row->>'created_at'),snapshot_at),1
    FROM jsonb_array_elements(private.companion_array(snapshot#>'{tables,workout_plans}')) row
    WHERE private.companion_uuid(row->>'user_id')=person_id AND private.companion_uuid(row->>'id') IS NOT NULL
  ), latest AS (
    SELECT DISTINCT ON(id) * FROM candidates ORDER BY id,changed DESC NULLS LAST,priority
  ) SELECT goal,changed INTO target,plan_at FROM latest WHERE is_active AND NOT unavailable AND goal BETWEEN 1 AND 7 ORDER BY changed DESC NULLS LAST,id LIMIT 1;
  target:=coalesce(target,profile_goal);
  WITH candidates AS (
    SELECT p.id,p.client_session_id,p.completed_at,0 AS priority FROM public.progress_logs p WHERE p.user_id=person_id
    UNION ALL
    SELECT private.companion_uuid(row->>'id'),private.companion_uuid(row->>'client_session_id'),private.companion_time(row->>'completed_at'),1
    FROM jsonb_array_elements(private.companion_array(snapshot#>'{tables,progress_logs}')) row
    WHERE private.companion_uuid(row->>'user_id')=person_id AND private.companion_uuid(row->>'id') IS NOT NULL
  ), same_log AS (
    SELECT DISTINCT ON(id) * FROM candidates WHERE completed_at IS NOT NULL ORDER BY id,priority
  ), same_session AS (
    SELECT DISTINCT ON(coalesce('session:'||client_session_id::text,'log:'||id::text)) * FROM same_log
      ORDER BY coalesce('session:'||client_session_id::text,'log:'||id::text),priority,id
  ) SELECT count(*)::integer,max(completed_at) INTO completed,progress_at FROM same_session
      WHERE completed_at >= start_day::timestamp AT TIME ZONE zone
        AND completed_at < (start_day+7)::timestamp AT TIME ZONE zone AND completed_at <= now();
  RETURN jsonb_build_object('completedSessions',completed,'goal',target,'weekStart',start_day,'weekEnd',start_day+6,
    'timeZone',zone,'updatedAt',greatest(snapshot_at,metadata_at,plan_at,progress_at));
END $$;

CREATE FUNCTION private.companion_person(person_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('userId',p.id,'fullName',coalesce(nullif(btrim(p.full_name),''),nullif(p.username,''),'Tu compañero'),'avatarUrl',p.avatar_url)
  FROM public.profiles p WHERE p.id=person_id
$$;

CREATE FUNCTION private.companion_state(viewer uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE relationship private.companion_relationships%ROWTYPE; other_id uuid; result_status text:='none';
  greeting private.companion_greetings%ROWTYPE; greeting_json jsonb; relationship_json jsonb; mine jsonb; theirs jsonb; next_at timestamptz;
BEGIN
  SELECT r.* INTO relationship FROM private.companion_memberships m JOIN private.companion_relationships r ON r.id=m.relationship_id
    WHERE m.user_id=viewer AND (r.status='active' OR (r.status='pending' AND r.expires_at>now()));
  IF FOUND THEN
    other_id:=CASE WHEN relationship.requester_id=viewer THEN relationship.recipient_id ELSE relationship.requester_id END;
    result_status:=CASE WHEN relationship.status='active' THEN 'active' WHEN relationship.requester_id=viewer THEN 'pending_outgoing' ELSE 'pending_incoming' END;
    relationship_json:=jsonb_build_object('id',relationship.id,'other',private.companion_person(other_id),'expiresAt',CASE WHEN relationship.status='pending' THEN relationship.expires_at END);
    IF relationship.status='active' THEN
      mine:=private.companion_summary(viewer);
      IF public.is_account_active(other_id) THEN theirs:=private.companion_summary(other_id); END IF;
    END IF;
  END IF;
  SELECT * INTO greeting FROM private.companion_greetings g WHERE g.sender_id=viewer AND g.sent_day=(now() AT TIME ZONE 'UTC')::date;
  IF FOUND THEN
    next_at:=(((now() AT TIME ZONE 'UTC')::date+1)::timestamp AT TIME ZONE 'UTC');
    IF result_status='active' AND greeting.relationship_id=relationship.id THEN greeting_json:=jsonb_build_object('sentAt',greeting.sent_at,'message',greeting.message); END IF;
  END IF;
  RETURN jsonb_build_object('viewerId',viewer,'status',result_status,'relationship',relationship_json,'self',mine,'partner',theirs,
    'greeting',greeting_json,'nextGreetingAt',next_at,'fetchedAt',now());
END $$;

CREATE FUNCTION private.companion_notify(recipient uuid,kind text,event_id uuid,sender uuid,body_text text) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE title_text text;
BEGIN
  title_text:=CASE WHEN kind='companion_invitation' THEN 'Una invitación de ' ELSE 'Un saludo de ' END
    || left(coalesce(nullif(btrim((private.companion_person(sender))->>'fullName'),''),'Tu compañero'),80);
  INSERT INTO public.product_notifications(user_id,type,title,body,url,payload,dedupe_key)
  VALUES(recipient,kind,title_text,body_text,'/companion',jsonb_build_object('relationshipId',event_id,'senderId',sender),'companion:'||kind)
  -- A new event gets a fresh ID so a late read/archive of the preceding event
  -- cannot hide this greeting. Successful RPC retries do not call this helper.
  ON CONFLICT(user_id,dedupe_key) DO UPDATE SET id=EXCLUDED.id,type=EXCLUDED.type,title=EXCLUDED.title,body=EXCLUDED.body,url=EXCLUDED.url,
    payload=EXCLUDED.payload,created_at=now(),read_at=NULL,dismissed_at=NULL;
END $$;

CREATE FUNCTION private.companion_close_invitation(relationship_id uuid) RETURNS void
LANGUAGE sql SET search_path = '' AS $$
  UPDATE public.product_notifications SET read_at=coalesce(read_at,now()),dismissed_at=coalesce(dismissed_at,now())
    WHERE type='companion_invitation' AND payload->>'relationshipId'=relationship_id::text
$$;

CREATE FUNCTION public.get_companion_state() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN RETURN private.companion_state(private.companion_actor()); END $$;

CREATE FUNCTION public.get_companion_invite_code() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE viewer uuid:=private.companion_actor(); invitation private.companion_invite_codes%ROWTYPE;
BEGIN
  PERFORM private.companion_lock_users(viewer);
  PERFORM private.companion_expire_slots(ARRAY[viewer]);
  IF EXISTS(SELECT FROM private.companion_memberships WHERE user_id=viewer) THEN RAISE EXCEPTION 'COMPANION_BUSY'; END IF;
  SELECT * INTO invitation FROM private.companion_invite_codes WHERE user_id=viewer AND expires_at>now();
  IF NOT FOUND THEN
    LOOP
      BEGIN
        INSERT INTO private.companion_invite_codes(user_id,code,expires_at) VALUES(viewer,'VKR-'||upper(encode(extensions.gen_random_bytes(6),'hex')),now()+interval '7 days')
          ON CONFLICT(user_id) DO UPDATE SET code=EXCLUDED.code,expires_at=EXCLUDED.expires_at,created_at=now() RETURNING * INTO invitation;
        EXIT;
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('code',invitation.code,'expiresAt',invitation.expires_at);
END $$;

CREATE FUNCTION public.preview_companion_invite_code(p_code text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE viewer uuid:=private.companion_actor(); invitation private.companion_invite_codes%ROWTYPE;
BEGIN
  SELECT * INTO invitation FROM private.companion_invite_codes WHERE code=upper(btrim(p_code)) AND expires_at>now();
  IF NOT FOUND OR NOT public.is_account_active(invitation.user_id) THEN RAISE EXCEPTION 'COMPANION_CODE_UNAVAILABLE'; END IF;
  IF invitation.user_id=viewer THEN RAISE EXCEPTION 'COMPANION_SELF'; END IF;
  IF EXISTS(SELECT FROM private.companion_memberships m JOIN private.companion_relationships r ON r.id=m.relationship_id
      WHERE m.user_id=ANY(ARRAY[viewer,invitation.user_id]) AND (r.status='active' OR (r.status='pending' AND r.expires_at>now()))) THEN RAISE EXCEPTION 'COMPANION_BUSY'; END IF;
  RETURN jsonb_build_object('code',invitation.code,'person',private.companion_person(invitation.user_id),'expiresAt',invitation.expires_at);
END $$;

CREATE FUNCTION public.request_companion(p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE viewer uuid:=private.companion_actor(); invitation private.companion_invite_codes%ROWTYPE; relationship private.companion_relationships%ROWTYPE;
BEGIN
  SELECT * INTO invitation FROM private.companion_invite_codes WHERE code=upper(btrim(p_code)) AND expires_at>now();
  IF NOT FOUND OR NOT public.is_account_active(invitation.user_id) THEN RAISE EXCEPTION 'COMPANION_CODE_UNAVAILABLE'; END IF;
  IF invitation.user_id=viewer THEN RAISE EXCEPTION 'COMPANION_SELF'; END IF;
  PERFORM private.companion_lock_users(viewer,invitation.user_id);
  -- Recheck code after waiting for a concurrent rotation or account action.
  IF NOT EXISTS(SELECT FROM private.companion_invite_codes WHERE user_id=invitation.user_id AND code=invitation.code AND expires_at>now())
    OR NOT public.is_account_active(invitation.user_id) THEN RAISE EXCEPTION 'COMPANION_CODE_UNAVAILABLE'; END IF;
  PERFORM private.companion_expire_slots(ARRAY[viewer,invitation.user_id]);
  SELECT r.* INTO relationship FROM private.companion_memberships m JOIN private.companion_relationships r ON r.id=m.relationship_id
    WHERE m.user_id=viewer AND r.requester_id=viewer AND r.recipient_id=invitation.user_id AND r.status='pending';
  IF FOUND THEN RETURN private.companion_state(viewer); END IF;
  IF EXISTS(SELECT FROM private.companion_memberships WHERE user_id=ANY(ARRAY[viewer,invitation.user_id])) THEN RAISE EXCEPTION 'COMPANION_BUSY'; END IF;
  INSERT INTO private.companion_relationships(requester_id,recipient_id,expires_at) VALUES(viewer,invitation.user_id,least(invitation.expires_at,now()+interval '7 days')) RETURNING * INTO relationship;
  INSERT INTO private.companion_memberships(user_id,relationship_id) VALUES(viewer,relationship.id),(invitation.user_id,relationship.id);
  PERFORM private.companion_notify(invitation.user_id,'companion_invitation',relationship.id,viewer,'Quiere ser tu compañero de constancia. Revisa la invitación para decidir qué compartir.');
  RETURN private.companion_state(viewer);
END $$;

CREATE FUNCTION public.respond_companion(p_relationship_id uuid,p_accept boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE viewer uuid:=private.companion_actor(); relationship private.companion_relationships%ROWTYPE;
BEGIN
  IF p_accept IS NULL THEN RAISE EXCEPTION 'COMPANION_INVALID_REQUEST'; END IF;
  SELECT * INTO relationship FROM private.companion_relationships WHERE id=p_relationship_id AND recipient_id=viewer;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMPANION_NOT_ALLOWED'; END IF;
  PERFORM private.companion_lock_users(relationship.requester_id,relationship.recipient_id);
  SELECT * INTO relationship FROM private.companion_relationships WHERE id=p_relationship_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMPANION_INVITATION_UNAVAILABLE'; END IF;
  IF (p_accept AND relationship.status='active') OR (NOT p_accept AND relationship.status='declined') THEN RETURN private.companion_state(viewer); END IF;
  IF relationship.status<>'pending' THEN RAISE EXCEPTION 'COMPANION_INVITATION_UNAVAILABLE'; END IF;
  IF relationship.expires_at<=now() THEN RAISE EXCEPTION 'COMPANION_INVITATION_EXPIRED'; END IF;
  IF p_accept AND NOT public.is_account_active(relationship.requester_id) THEN RAISE EXCEPTION 'COMPANION_UNAVAILABLE'; END IF;
  IF p_accept THEN
    IF (SELECT count(*) FROM private.companion_memberships WHERE relationship_id=relationship.id AND user_id=ANY(ARRAY[relationship.requester_id,relationship.recipient_id]))<>2 THEN RAISE EXCEPTION 'COMPANION_INVITATION_UNAVAILABLE'; END IF;
    UPDATE private.companion_relationships SET status='active',accepted_at=now() WHERE id=relationship.id;
  ELSE
    UPDATE private.companion_relationships SET status='declined',ended_at=now() WHERE id=relationship.id;
    DELETE FROM private.companion_memberships WHERE relationship_id=relationship.id;
  END IF;
  PERFORM private.companion_close_invitation(relationship.id);
  RETURN private.companion_state(viewer);
END $$;

CREATE FUNCTION public.cancel_companion_request(p_relationship_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE viewer uuid:=private.companion_actor(); relationship private.companion_relationships%ROWTYPE;
BEGIN
  SELECT * INTO relationship FROM private.companion_relationships WHERE id=p_relationship_id AND requester_id=viewer;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMPANION_NOT_ALLOWED'; END IF;
  PERFORM private.companion_lock_users(relationship.requester_id,relationship.recipient_id);
  SELECT * INTO relationship FROM private.companion_relationships WHERE id=p_relationship_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMPANION_INVITATION_UNAVAILABLE'; END IF;
  IF relationship.status IN ('cancelled','expired') THEN RETURN private.companion_state(viewer); END IF;
  IF relationship.status<>'pending' THEN RAISE EXCEPTION 'COMPANION_INVITATION_UNAVAILABLE'; END IF;
  UPDATE private.companion_relationships SET status='cancelled',ended_at=now() WHERE id=relationship.id;
  DELETE FROM private.companion_memberships WHERE relationship_id=relationship.id;
  PERFORM private.companion_close_invitation(relationship.id);
  RETURN private.companion_state(viewer);
END $$;

CREATE FUNCTION public.leave_companion(p_relationship_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE viewer uuid:=private.companion_actor(); relationship private.companion_relationships%ROWTYPE;
BEGIN
  SELECT * INTO relationship FROM private.companion_relationships WHERE id=p_relationship_id AND viewer IN (requester_id,recipient_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'COMPANION_NOT_ALLOWED'; END IF;
  PERFORM private.companion_lock_users(relationship.requester_id,relationship.recipient_id);
  SELECT * INTO relationship FROM private.companion_relationships WHERE id=p_relationship_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMPANION_NOT_ACTIVE'; END IF;
  IF relationship.status='ended' THEN RETURN private.companion_state(viewer); END IF;
  IF relationship.status<>'active' THEN RAISE EXCEPTION 'COMPANION_NOT_ACTIVE'; END IF;
  UPDATE private.companion_relationships SET status='ended',ended_at=now() WHERE id=relationship.id;
  DELETE FROM private.companion_memberships WHERE relationship_id=relationship.id;
  RETURN private.companion_state(viewer);
END $$;

CREATE FUNCTION public.send_companion_greeting(p_relationship_id uuid,p_message text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE viewer uuid:=private.companion_actor(); relationship private.companion_relationships%ROWTYPE;
  receipt private.companion_greetings%ROWTYPE; normalized text; other_id uuid;
BEGIN
  IF p_request_id IS NULL OR p_relationship_id IS NULL THEN RAISE EXCEPTION 'COMPANION_INVALID_REQUEST'; END IF;
  IF octet_length(coalesce(p_message,''))>8192 THEN RAISE EXCEPTION 'COMPANION_MESSAGE_INVALID'; END IF;
  -- The exact ECMAScript trim whitespace set, followed by the shared NFC/codepoint rule.
  normalized:=btrim(normalize(coalesce(p_message,''),NFC),U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
  IF char_length(normalized)>120 OR octet_length(normalized)>2048 THEN RAISE EXCEPTION 'COMPANION_MESSAGE_INVALID'; END IF;
  IF normalized='' THEN normalized:='👏 ¡Bien hecho!'; END IF;
  SELECT * INTO receipt FROM private.companion_greetings WHERE sender_id=viewer AND request_id=p_request_id;
  IF FOUND THEN
    IF receipt.relationship_id<>p_relationship_id OR receipt.message<>normalized THEN RAISE EXCEPTION 'COMPANION_IDEMPOTENCY_MISMATCH'; END IF;
    RETURN private.companion_state(viewer);
  END IF;
  SELECT * INTO relationship FROM private.companion_relationships WHERE id=p_relationship_id AND viewer IN (requester_id,recipient_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'COMPANION_NOT_ALLOWED'; END IF;
  PERFORM private.companion_lock_users(relationship.requester_id,relationship.recipient_id);
  SELECT * INTO receipt FROM private.companion_greetings WHERE sender_id=viewer AND request_id=p_request_id;
  IF FOUND THEN
    IF receipt.relationship_id<>p_relationship_id OR receipt.message<>normalized THEN RAISE EXCEPTION 'COMPANION_IDEMPOTENCY_MISMATCH'; END IF;
    RETURN private.companion_state(viewer);
  END IF;
  SELECT * INTO relationship FROM private.companion_relationships WHERE id=p_relationship_id FOR UPDATE;
  IF NOT FOUND OR relationship.status<>'active' THEN RAISE EXCEPTION 'COMPANION_NOT_ACTIVE'; END IF;
  other_id:=CASE WHEN relationship.requester_id=viewer THEN relationship.recipient_id ELSE relationship.requester_id END;
  IF NOT public.is_account_active(other_id) THEN RAISE EXCEPTION 'COMPANION_UNAVAILABLE'; END IF;
  IF EXISTS(SELECT FROM private.companion_greetings WHERE sender_id=viewer AND sent_day=(now() AT TIME ZONE 'UTC')::date) THEN RAISE EXCEPTION 'COMPANION_DAILY_LIMIT'; END IF;
  INSERT INTO private.companion_greetings(sender_id,sent_day,relationship_id,request_id,message)
    VALUES(viewer,(now() AT TIME ZONE 'UTC')::date,relationship.id,p_request_id,normalized)
    ON CONFLICT(sender_id) DO UPDATE SET sent_day=EXCLUDED.sent_day,relationship_id=EXCLUDED.relationship_id,
      request_id=EXCLUDED.request_id,message=EXCLUDED.message,sent_at=now();
  PERFORM private.companion_notify(other_id,'companion_greeting',relationship.id,viewer,normalized);
  RETURN private.companion_state(viewer);
END $$;

-- Private helpers are callable only by the owner through these authenticated RPCs.
DO $$ DECLARE item record; BEGIN
  FOR item IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='private' AND p.proname LIKE 'companion\_%' ESCAPE '\'
  LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',item.signature); END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.get_companion_state(),public.get_companion_invite_code(),public.preview_companion_invite_code(text),public.request_companion(text),
  public.respond_companion(uuid,boolean),public.cancel_companion_request(uuid),public.leave_companion(uuid),public.send_companion_greeting(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_companion_state(),public.get_companion_invite_code(),public.preview_companion_invite_code(text),public.request_companion(text),
  public.respond_companion(uuid,boolean),public.cancel_companion_request(uuid),public.leave_companion(uuid),public.send_companion_greeting(uuid,text,uuid) TO authenticated;

COMMENT ON FUNCTION public.send_companion_greeting(uuid,text,uuid) IS 'One greeting per sender per UTC calendar day, NFC-normalized and limited to 120 Unicode codepoints. The latest successful request UUID remains idempotent until the next successful greeting replaces its receipt.';
COMMIT;

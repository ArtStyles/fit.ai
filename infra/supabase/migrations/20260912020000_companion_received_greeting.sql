-- Expose the existing latest partner receipt without changing send limits or
-- storing a conversation. Consent and the current relationship bound its use.
BEGIN;

CREATE OR REPLACE FUNCTION private.companion_state(viewer uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE relationship private.companion_relationships%ROWTYPE; other_id uuid; result_status text:='none';
  greeting private.companion_greetings%ROWTYPE; greeting_json jsonb; received_greeting_json jsonb;
  relationship_json jsonb; mine jsonb; theirs jsonb; next_at timestamptz;
BEGIN
  SELECT r.* INTO relationship FROM private.companion_memberships m JOIN private.companion_relationships r ON r.id=m.relationship_id
    WHERE m.user_id=viewer AND (r.status='active' OR (r.status='pending' AND r.expires_at>now()));
  IF FOUND THEN
    other_id:=CASE WHEN relationship.requester_id=viewer THEN relationship.recipient_id ELSE relationship.requester_id END;
    result_status:=CASE WHEN relationship.status='active' THEN 'active' WHEN relationship.requester_id=viewer THEN 'pending_outgoing' ELSE 'pending_incoming' END;
    relationship_json:=jsonb_build_object('id',relationship.id,'other',private.companion_person(other_id),'expiresAt',CASE WHEN relationship.status='pending' THEN relationship.expires_at END);
    IF relationship.status='active' THEN
      mine:=private.companion_summary(viewer);
      IF public.is_account_active(other_id) THEN
        theirs:=private.companion_summary(other_id);
        -- The sender's latest row is retained across days. Match this exact
        -- relationship so unlink/re-pair cannot expose a previous consent's text.
        SELECT jsonb_build_object('sentAt',g.sent_at,'message',g.message) INTO received_greeting_json
          FROM private.companion_greetings g WHERE g.sender_id=other_id AND g.relationship_id=relationship.id;
      END IF;
    END IF;
  END IF;
  SELECT * INTO greeting FROM private.companion_greetings g WHERE g.sender_id=viewer AND g.sent_day=(now() AT TIME ZONE 'UTC')::date;
  IF FOUND THEN
    next_at:=(((now() AT TIME ZONE 'UTC')::date+1)::timestamp AT TIME ZONE 'UTC');
    IF result_status='active' AND greeting.relationship_id=relationship.id THEN greeting_json:=jsonb_build_object('sentAt',greeting.sent_at,'message',greeting.message); END IF;
  END IF;
  RETURN jsonb_build_object('viewerId',viewer,'status',result_status,'relationship',relationship_json,'self',mine,'partner',theirs,
    'greeting',greeting_json,'receivedGreeting',received_greeting_json,'nextGreetingAt',next_at,'fetchedAt',now());
END $$;

-- Keep the helper private; the existing authenticated RPCs select their actor.
REVOKE ALL ON FUNCTION private.companion_state(uuid) FROM PUBLIC, anon, authenticated;
COMMIT;

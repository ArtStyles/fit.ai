-- ============================================================
-- Migration 053: repair trainer draft JSON object validation
-- ============================================================
-- PostgreSQL does not provide jsonb_object_length(jsonb). Count the keys
-- explicitly after proving the payload is an object so valid drafts can be
-- persisted and malformed JSON still receives the intended domain error.

CREATE OR REPLACE FUNCTION public.save_trainer_application_draft(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_application public.trainer_applications%ROWTYPE;
  v_avatar_url TEXT;
  v_onboarding_done BOOLEAN;
  v_payload_key_count INTEGER;
  v_professional_name TEXT;
  v_professional_photo_url TEXT;
  v_bio TEXT;
  v_specialties TEXT[];
  v_modalities TEXT[];
  v_experience_summary TEXT;
  v_general_location TEXT;
  v_languages TEXT[];
  v_contact_email TEXT;
  v_contact_phone TEXT;
  v_preferred_contact TEXT;
  v_timezone TEXT;
  v_interview_availability TEXT;
BEGIN
  IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('trainer-profile:' || v_user_id::TEXT, 0));

  SELECT profile.avatar_url, profile.onboarding_done
  INTO v_avatar_url, v_onboarding_done
  FROM public.profiles profile
  WHERE profile.id = v_user_id;

  IF NOT FOUND OR NOT COALESCE(v_onboarding_done, FALSE) OR NOT public.is_account_active(v_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active onboarded account required.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.trainer_profiles profile WHERE profile.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'A trainer profile already exists; use the profile update workflow.';
  END IF;

  SELECT application.* INTO v_application
  FROM public.trainer_applications application
  WHERE application.user_id = v_user_id
    AND application.application_kind = 'initial'
    AND application.status IN ('draft', 'changes_requested')
  ORDER BY application.created_at DESC, application.id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_application.id IS NULL AND EXISTS (
    SELECT 1
    FROM public.trainer_applications application
    WHERE application.user_id = v_user_id
      AND application.application_kind = 'initial'
      AND application.status IN ('submitted', 'under_review', 'interview_required')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'The initial trainer application is already under review.';
  END IF;

  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Trainer application draft payload invalid.';
  END IF;

  SELECT count(*)
  INTO v_payload_key_count
  FROM jsonb_object_keys(p_payload);

  IF v_payload_key_count <> 13
    OR NOT (p_payload ?& ARRAY[
      'professional_name', 'professional_photo_url', 'bio', 'specialties', 'modalities',
      'experience_summary', 'general_location', 'languages', 'contact_email', 'contact_phone',
      'preferred_contact', 'timezone', 'interview_availability'
    ])
    OR jsonb_typeof(p_payload->'specialties') <> 'array'
    OR jsonb_typeof(p_payload->'modalities') <> 'array'
    OR jsonb_typeof(p_payload->'languages') <> 'array'
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Trainer application draft payload invalid.';
  END IF;

  v_professional_name := btrim(COALESCE(p_payload->>'professional_name', ''));
  v_professional_photo_url := NULLIF(btrim(COALESCE(p_payload->>'professional_photo_url', '')), '');
  v_bio := btrim(COALESCE(p_payload->>'bio', ''));
  v_specialties := ARRAY(
    SELECT btrim(item.value)
    FROM jsonb_array_elements_text(p_payload->'specialties') WITH ORDINALITY AS item(value, position)
    ORDER BY item.position
  );
  v_modalities := ARRAY(
    SELECT btrim(item.value)
    FROM jsonb_array_elements_text(p_payload->'modalities') WITH ORDINALITY AS item(value, position)
    ORDER BY item.position
  );
  v_experience_summary := btrim(COALESCE(p_payload->>'experience_summary', ''));
  v_general_location := NULLIF(btrim(COALESCE(p_payload->>'general_location', '')), '');
  v_languages := ARRAY(
    SELECT btrim(item.value)
    FROM jsonb_array_elements_text(p_payload->'languages') WITH ORDINALITY AS item(value, position)
    ORDER BY item.position
  );
  v_contact_email := lower(btrim(COALESCE(p_payload->>'contact_email', '')));
  v_contact_phone := NULLIF(btrim(COALESCE(p_payload->>'contact_phone', '')), '');
  v_preferred_contact := btrim(COALESCE(p_payload->>'preferred_contact', ''));
  v_timezone := btrim(COALESCE(p_payload->>'timezone', ''));
  v_interview_availability := btrim(COALESCE(p_payload->>'interview_availability', ''));

  IF char_length(v_professional_name) <> 0 AND char_length(v_professional_name) NOT BETWEEN 2 AND 100
    OR char_length(v_bio) <> 0 AND char_length(v_bio) NOT BETWEEN 50 AND 2000
    OR cardinality(v_specialties) > 10
    OR EXISTS (
      SELECT 1 FROM unnest(v_specialties) specialty
      WHERE char_length(specialty) NOT BETWEEN 1 AND 80
    )
    OR cardinality(v_modalities) > 3
    OR NOT (v_modalities <@ ARRAY['online', 'in_person', 'hybrid']::TEXT[])
    OR char_length(v_experience_summary) <> 0
      AND char_length(v_experience_summary) NOT BETWEEN 20 AND 2000
    OR char_length(COALESCE(v_general_location, '')) > 120
    OR cardinality(v_languages) > 10
    OR EXISTS (
      SELECT 1 FROM unnest(v_languages) language
      WHERE char_length(language) NOT BETWEEN 1 AND 80
    )
    OR char_length(v_contact_email) > 254
    OR v_contact_email <> '' AND v_contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR v_contact_phone IS NOT NULL AND v_contact_phone !~ '^\+?[0-9][0-9 ()\.\-]{6,31}$'
    OR v_preferred_contact NOT IN ('email', 'phone', 'whatsapp')
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_timezone_names timezone_name WHERE timezone_name.name = v_timezone
    )
    OR char_length(v_interview_availability) <> 0
      AND char_length(v_interview_availability) NOT BETWEEN 10 AND 1000
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Trainer application draft fields invalid.';
  END IF;

  IF v_professional_photo_url IS NOT NULL
    AND (
      char_length(v_professional_photo_url) > 2048
      OR v_professional_photo_url !~ '^https://[^/[:space:]]+(?:/[^[:space:]]*)?$'
      OR v_professional_photo_url IS DISTINCT FROM v_avatar_url
        AND v_professional_photo_url IS DISTINCT FROM v_application.professional_photo_url
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Professional photo must be owned by the applicant.';
  END IF;

  IF v_application.id IS NULL THEN
    INSERT INTO public.trainer_applications (
      user_id, application_kind, status, professional_name, professional_photo_url, bio,
      specialties, modalities, experience_summary, general_location, languages, contact_email,
      contact_phone, preferred_contact, timezone, interview_availability
    ) VALUES (
      v_user_id, 'initial', 'draft', v_professional_name, v_professional_photo_url, v_bio,
      v_specialties, v_modalities, v_experience_summary, v_general_location, v_languages,
      v_contact_email, v_contact_phone, v_preferred_contact, v_timezone, v_interview_availability
    ) RETURNING * INTO v_application;
  ELSE
    UPDATE public.trainer_applications
    SET professional_name = v_professional_name,
        professional_photo_url = v_professional_photo_url,
        bio = v_bio,
        specialties = v_specialties,
        modalities = v_modalities,
        experience_summary = v_experience_summary,
        general_location = v_general_location,
        languages = v_languages,
        contact_email = v_contact_email,
        contact_phone = v_contact_phone,
        preferred_contact = v_preferred_contact,
        timezone = v_timezone,
        interview_availability = v_interview_availability
    WHERE id = v_application.id
    RETURNING * INTO v_application;
  END IF;

  RETURN jsonb_build_object('application_id', v_application.id, 'status', v_application.status);
END;
$$;

ALTER FUNCTION public.save_trainer_application_draft(JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.save_trainer_application_draft(JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_trainer_application_draft(JSONB) TO authenticated;

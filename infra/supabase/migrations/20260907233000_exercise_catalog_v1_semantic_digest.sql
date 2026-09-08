-- Pin every persisted Catalog V1 semantic field before delegating to the
-- already-deployed cutover implementation. Asset origins are deployment-
-- specific, so media URLs contribute their canonical Storage pathname.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER FUNCTION public.replace_exercise_catalog_v1(JSONB)
  SET SCHEMA private;
ALTER FUNCTION private.replace_exercise_catalog_v1(JSONB)
  RENAME TO replace_exercise_catalog_v1_unchecked;

REVOKE ALL ON FUNCTION private.replace_exercise_catalog_v1_unchecked(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.exercise_catalog_v1_semantic_sha256(p_exercises JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, extensions, pg_temp
AS $$
  WITH payload AS (
    SELECT row.*
    FROM jsonb_to_recordset(p_exercises) AS row(
      wger_id INTEGER,
      name TEXT,
      name_es TEXT,
      description TEXT,
      description_es TEXT,
      muscle_groups TEXT[],
      equipment TEXT[],
      equipment_es TEXT[],
      muscle_groups_es TEXT[],
      difficulty TEXT,
      exercise_type TEXT,
      is_compound BOOLEAN,
      instructions TEXT,
      instructions_es TEXT,
      video_url TEXT,
      image_url TEXT,
      motion_preview_url TEXT,
      is_public BOOLEAN,
      source TEXT,
      external_id TEXT,
      movement_patterns TEXT[],
      cardio_modality TEXT,
      impact_level TEXT,
      joint_stress_tags TEXT[],
      legacy_source TEXT,
      legacy_external_id TEXT
    )
  ), canonical_rows AS (
    SELECT payload.external_id,
      '['
      || COALESCE(to_json(payload.wger_id)::TEXT, 'null') || ','
      || COALESCE(to_json(payload.name)::TEXT, 'null') || ','
      || COALESCE(to_json(payload.name_es)::TEXT, 'null') || ','
      || COALESCE(to_json(payload.description)::TEXT, 'null') || ','
      || COALESCE(to_json(payload.description_es)::TEXT, 'null') || ','
      || COALESCE(array_to_json(payload.muscle_groups)::TEXT, 'null') || ','
      || COALESCE(array_to_json(payload.equipment)::TEXT, 'null') || ','
      || COALESCE(array_to_json(payload.equipment_es)::TEXT, 'null') || ','
      || COALESCE(array_to_json(payload.muscle_groups_es)::TEXT, 'null') || ','
      || COALESCE(to_json(payload.difficulty)::TEXT, 'null') || ','
      || COALESCE(to_json(payload.exercise_type)::TEXT, 'null') || ','
      || COALESCE(to_json(payload.is_compound)::TEXT, 'null') || ','
      || COALESCE(to_json(payload.instructions)::TEXT, 'null') || ','
      || COALESCE(to_json(payload.instructions_es)::TEXT, 'null') || ','
      || COALESCE(to_json(payload.video_url)::TEXT, 'null') || ','
      || COALESCE(
        to_json(substring(payload.image_url FROM '(/storage/v1/object/public/.*)$'))::TEXT,
        'null'
      ) || ','
      || COALESCE(
        to_json(substring(payload.motion_preview_url FROM '(/storage/v1/object/public/.*)$'))::TEXT,
        'null'
      ) || ','
      || COALESCE(to_json(payload.is_public)::TEXT, 'null') || ','
      || COALESCE(to_json(payload.source)::TEXT, 'null') || ','
      || COALESCE(to_json(payload.external_id)::TEXT, 'null') || ','
      || COALESCE(array_to_json(payload.movement_patterns)::TEXT, 'null') || ','
      || COALESCE(to_json(payload.cardio_modality)::TEXT, 'null') || ','
      || COALESCE(to_json(payload.impact_level)::TEXT, 'null') || ','
      || COALESCE(array_to_json(payload.joint_stress_tags)::TEXT, 'null') || ','
      || COALESCE(to_json(payload.legacy_source)::TEXT, 'null') || ','
      || COALESCE(to_json(payload.legacy_external_id)::TEXT, 'null')
      || ']' AS canonical_row
    FROM payload
  )
  SELECT encode(
    extensions.digest(
      convert_to(
        '[' || COALESCE(
          string_agg(canonical_row, ',' ORDER BY external_id COLLATE "C"),
          ''
        ) || ']',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  FROM canonical_rows;
$$;

REVOKE ALL ON FUNCTION private.exercise_catalog_v1_semantic_sha256(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.replace_exercise_catalog_v1(p_exercises JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_actor_role TEXT := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', TRUE), ''),
    auth.role()
  );
  v_expected_digest CONSTANT TEXT := '58e3b1621b74a930405878c68b47fff2bf7ebe28b91111f62087c326de814917';
  v_actual_digest TEXT;
  v_result JSONB;
BEGIN
  IF v_actor_role IS DISTINCT FROM 'service_role' THEN
    RAISE insufficient_privilege USING
      MESSAGE = 'replace_exercise_catalog_v1 requires service_role';
  END IF;

  IF p_exercises IS NULL OR jsonb_typeof(p_exercises) <> 'array' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'catalog V1 payload must be a JSON array';
  END IF;

  v_actual_digest := private.exercise_catalog_v1_semantic_sha256(p_exercises);

  IF v_actual_digest IS DISTINCT FROM v_expected_digest THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'catalog V1 semantic digest mismatch',
      DETAIL = format('expected %s, received %s', v_expected_digest, COALESCE(v_actual_digest, '<null>'));
  END IF;

  v_result := private.replace_exercise_catalog_v1_unchecked(p_exercises);

  RETURN v_result || jsonb_build_object(
    'catalog_semantic_sha256', v_actual_digest
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_exercise_catalog_v1(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_exercise_catalog_v1(JSONB)
  TO service_role;

COMMENT ON FUNCTION public.replace_exercise_catalog_v1(JSONB) IS
  'Service-role Catalog V1 cutover. Rejects any payload whose canonical persisted semantics differ from the reviewed V1 digest.';

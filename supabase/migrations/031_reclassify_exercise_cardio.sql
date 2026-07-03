-- Rebuild cardio taxonomy with word-aware matching. The original bootstrap used
-- substring matching (for example, "throw" could be classified as "rowing").

UPDATE exercises
SET
  cardio_modality = NULL,
  impact_level = NULL,
  movement_patterns = array_remove(movement_patterns, 'locomotion'),
  joint_stress_tags = array_remove(joint_stress_tags, 'locomotion')
WHERE exercise_type IN ('cardio', 'hiit');

UPDATE exercises
SET cardio_modality = CASE
  WHEN lower(name) ~ '(^|[^a-z])(walk|walking)([^a-z]|$)' THEN 'walking'
  WHEN lower(name) ~ '(^|[^a-z])(run|running|jog|jogging|sprint|treadmill)([^a-z]|$)' THEN 'running'
  WHEN lower(name) ~ '(^|[^a-z])(cycl[^ ]*|bicycl[^ ]*|bike|biking)([^a-z]|$)' THEN 'cycling'
  WHEN lower(name) ~ '(^|[^a-z])elliptical([^a-z]|$)' THEN 'elliptical'
  WHEN lower(name) ~ '(^|[^a-z])(row|rowing|rower)([^a-z]|$)' THEN 'rowing'
  WHEN lower(name) ~ '(^|[^a-z])(stair|stairs|stairmaster|step[ -]?mill)([^a-z]|$)' THEN 'stairs'
  WHEN lower(name) ~ '(^|[^a-z])(jump rope|rope jumping|skipping rope)([^a-z]|$)' THEN 'jump_rope'
  ELSE NULL
END
WHERE exercise_type IN ('cardio', 'hiit');

UPDATE exercises
SET
  movement_patterns = CASE
    WHEN 'locomotion' = ANY(movement_patterns) THEN movement_patterns
    ELSE array_append(movement_patterns, 'locomotion')
  END,
  joint_stress_tags = CASE
    WHEN 'locomotion' = ANY(joint_stress_tags) THEN joint_stress_tags
    ELSE array_append(joint_stress_tags, 'locomotion')
  END,
  impact_level = CASE
    WHEN cardio_modality IN ('running', 'jump_rope') THEN 'high'
    WHEN cardio_modality = 'stairs' THEN 'moderate'
    ELSE 'low'
  END
WHERE cardio_modality IS NOT NULL;

COMMENT ON COLUMN exercises.cardio_modality IS
  'Deterministic cardio taxonomy; rebuilt by migration 031 and by the catalog seed mapper.';

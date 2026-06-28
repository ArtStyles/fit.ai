-- ============================================================
-- Migration 026: plan library + subscription tier
-- ============================================================
-- Enables multiple saved workout plans for paid users while preserving a
-- single active plan per user. Free users are enforced in application logic.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free';

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_tier_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_subscription_tier_check
  CHECK (subscription_tier IN ('free', 'pro'));

ALTER TABLE workout_plans
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'ai',
  ADD COLUMN IF NOT EXISTS source_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE workout_plans
  DROP CONSTRAINT IF EXISTS workout_plans_source_type_check;

ALTER TABLE workout_plans
  ADD CONSTRAINT workout_plans_source_type_check
  CHECK (source_type IN ('ai', 'manual', 'imported', 'shared_post'));

-- If legacy data somehow has more than one active plan, keep the newest active.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
  FROM workout_plans
  WHERE is_active = TRUE
)
UPDATE workout_plans wp
SET is_active = FALSE
FROM ranked
WHERE wp.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_plans_one_active_per_user
  ON workout_plans(user_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_workout_plans_user_active_created
  ON workout_plans(user_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workout_plans_source_post
  ON workout_plans(source_post_id)
  WHERE source_post_id IS NOT NULL;

COMMENT ON COLUMN profiles.subscription_tier IS
  'Plan de cuenta para límites de biblioteca: free permite 1 plan guardado; pro permite ilimitados.';

COMMENT ON COLUMN workout_plans.source_type IS
  'Origen del plan: ai, manual, imported o shared_post.';

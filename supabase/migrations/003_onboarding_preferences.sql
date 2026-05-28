-- ============================================================
-- FitAI — Onboarding Preference Columns
-- Run this in: Supabase Dashboard > SQL Editor
-- ============================================================

-- Expand primary_goal to include 'gain_strength'
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_primary_goal_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_primary_goal_check
  CHECK (primary_goal IN (
    'lose_weight','build_muscle','improve_endurance',
    'stay_active','other','gain_strength'
  ));

-- Add onboarding columns
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS days_per_week            INTEGER CHECK (days_per_week BETWEEN 2 AND 6),
  ADD COLUMN IF NOT EXISTS session_duration_minutes INTEGER CHECK (session_duration_minutes IN (30,45,60,90)),
  ADD COLUMN IF NOT EXISTS gym_type                 TEXT    CHECK (gym_type IN ('home_no_equipment','home_basic','full_gym')),
  ADD COLUMN IF NOT EXISTS available_equipment      TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS injuries                 TEXT;

-- ============================================================
-- Migration 017: check-in periódico de perfil
-- ============================================================
-- El onboarding era de una sola vez: peso, objetivo y lesiones se
-- quedaban congelados. last_check_in_at registra la última revisión
-- del perfil; pasados 28 días el dashboard invita a actualizarlo y
-- la regeneración semanal trabaja con datos frescos.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_check_in_at TIMESTAMPTZ;

-- Usuarios existentes: su última edición de perfil cuenta como check-in.
UPDATE profiles
SET last_check_in_at = COALESCE(updated_at, created_at)
WHERE last_check_in_at IS NULL;

COMMENT ON COLUMN profiles.last_check_in_at IS
  'Última revisión de datos de perfil (onboarding o ajustes). NULL = nunca.';

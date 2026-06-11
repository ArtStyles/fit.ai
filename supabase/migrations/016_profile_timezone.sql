-- ============================================================
-- Migration 016: zona horaria por usuario
-- ============================================================
-- La frontera del "día" para iniciar/registrar sesiones dejaba de
-- ser correcta fuera de America/Havana. El cliente detecta la zona
-- IANA (Intl) y la sincroniza; el servidor la valida y la usa en
-- todo el gating de calendario. NULL → fallback a la zona de la app.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT;

COMMENT ON COLUMN profiles.timezone IS
  'Zona horaria IANA del usuario (ej. Europe/Madrid). NULL = zona por defecto de la app.';

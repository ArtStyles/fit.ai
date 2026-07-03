-- ============================================================
-- Migration 030: configurable promotional banner for dashboard
-- ============================================================

CREATE TABLE IF NOT EXISTS dashboard_banners (
  slot         TEXT        PRIMARY KEY DEFAULT 'dashboard-primary',
  kind         TEXT        NOT NULL DEFAULT 'announcement',
  title        TEXT        NOT NULL,
  description  TEXT,
  image_url    TEXT,
  cta_label    TEXT,
  cta_href     TEXT,
  status       TEXT        NOT NULL DEFAULT 'draft',
  starts_on    DATE,
  ends_on      DATE,
  updated_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT dashboard_banners_slot_check CHECK (slot = 'dashboard-primary'),
  CONSTRAINT dashboard_banners_kind_check CHECK (kind IN ('announcement', 'event', 'promotion', 'info')),
  CONSTRAINT dashboard_banners_status_check CHECK (status IN ('draft', 'active', 'paused')),
  CONSTRAINT dashboard_banners_title_length CHECK (char_length(title) BETWEEN 3 AND 100),
  CONSTRAINT dashboard_banners_description_length CHECK (description IS NULL OR char_length(description) <= 280),
  CONSTRAINT dashboard_banners_cta_pair CHECK ((cta_label IS NULL) = (cta_href IS NULL)),
  CONSTRAINT dashboard_banners_date_range CHECK (starts_on IS NULL OR ends_on IS NULL OR starts_on <= ends_on)
);

ALTER TABLE dashboard_banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated users read active dashboard banner" ON dashboard_banners;
CREATE POLICY "authenticated users read active dashboard banner"
  ON dashboard_banners
  FOR SELECT TO authenticated
  USING (
    status = 'active'
    AND (starts_on IS NULL OR starts_on <= CURRENT_DATE)
    AND (ends_on IS NULL OR ends_on >= CURRENT_DATE)
  );

REVOKE ALL ON dashboard_banners FROM anon;
GRANT SELECT ON dashboard_banners TO authenticated;
GRANT ALL ON dashboard_banners TO service_role;

INSERT INTO storage.buckets (id, name, public)
VALUES ('dashboard-banners', 'dashboard-banners', true)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

COMMENT ON TABLE dashboard_banners IS
  'Single configurable promotional content slot rendered on the dashboard.';


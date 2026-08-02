import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../../../supabase/migrations/039_dashboard_payload_continuity.sql', import.meta.url),
  'utf8',
)

describe('dashboard payload continuity upgrade migration', () => {
  it('replaces the existing dashboard payload function with its stable public contract', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_dashboard_payload\(\s*p_week_start timestamptz,\s*p_recent_start timestamptz\s*\)/i)
    expect(migration).toMatch(/RETURNS jsonb[\s\S]+LANGUAGE sql[\s\S]+STABLE[\s\S]+SECURITY INVOKER[\s\S]+SET search_path = public/i)
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_dashboard_payload(timestamptz, timestamptz) TO authenticated;')
  })

  it('returns optional live workout metadata and uses a stable evidence order', () => {
    expect(migration).toContain("jsonb_build_object('name', w.name, 'focus', w.focus) END AS workout")
    expect(migration).toContain('ORDER BY pl.completed_at DESC, pl.id DESC')
    expect(migration).toContain('ORDER BY rl.completed_at DESC, rl.id DESC')
    expect(migration).toContain('ORDER BY wl.completed_at DESC, wl.id DESC')
  })
})

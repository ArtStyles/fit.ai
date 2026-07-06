import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../../../supabase/migrations/034_product_events.sql', import.meta.url),
  'utf8',
)

const eventNames = [
  'landing_view',
  'primary_cta_clicked',
  'language_changed',
  'signup_started',
  'signup_completed',
  'onboarding_step_completed',
  'onboarding_abandoned',
  'plan_generated',
  'first_session_started',
  'first_session_completed',
  'plan_adjustment_used',
  'organic_page_cta_clicked',
]

describe('product events migration', () => {
  it('persists the exact event union with anonymous and server user identities', () => {
    expect(migration).toContain('CREATE TABLE public.product_events')
    for (const eventName of eventNames) expect(migration).toContain(`'${eventName}'`)
    expect(migration).toContain('anonymous_id UUID NOT NULL')
    expect(migration).toContain('user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL')
  })

  it('enables RLS without creating a client policy or client grant', () => {
    expect(migration).toContain('ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY')
    expect(migration).not.toMatch(/CREATE\s+POLICY/i)
    expect(migration).not.toMatch(/GRANT[\s\S]+\b(?:anon|authenticated)\b/i)
  })

  it('constrains locale and pathname and creates funnel query indexes', () => {
    expect(migration).toContain("locale TEXT CHECK (locale IN ('es', 'en'))")
    expect(migration).toContain("path IN ('/', '/es', '/en', '/register', '/onboarding')")
    expect(migration).toContain('product_events_occurred_at_idx')
    expect(migration).toContain('product_events_name_idx')
  })
})

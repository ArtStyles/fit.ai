import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readArtifact(url: URL): string {
  try {
    return readFileSync(url, 'utf8')
  } catch {
    return ''
  }
}

const migration = readArtifact(
  new URL('../../../../supabase/migrations/041_trainer_verification.sql', import.meta.url),
)
const databaseTypes = readArtifact(new URL('../../../types/database.ts', import.meta.url))

const privateTables = [
  'trainer_applications',
  'trainer_application_credentials',
  'trainer_application_events',
  'trainer_interviews',
  'trainer_profiles',
]

describe('trainer verification migration', () => {
  it('creates the private verification records and professional profile', () => {
    for (const table of privateTables) {
      expect(migration).toMatch(new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?public\\.${table}`, 'i'))
      expect(migration).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'))
    }

    expect(migration).toContain("CHECK (status IN ('draft', 'submitted', 'under_review', 'changes_requested', 'interview_required', 'approved', 'rejected', 'withdrawn'))")
    expect(migration).toContain("CHECK (status IN ('active', 'suspended', 'inactive'))")
    expect(migration).toMatch(/trainer_profiles[\s\S]+user_id UUID NOT NULL UNIQUE[\s\S]+slug TEXT NOT NULL UNIQUE/i)
  })

  it('stores every approved draft field without government identity data', () => {
    for (const column of [
      'professional_name',
      'professional_photo_url',
      'bio',
      'specialties',
      'modalities',
      'experience_summary',
      'general_location',
      'languages',
      'contact_email',
      'contact_phone',
      'preferred_contact',
      'timezone',
      'interview_availability',
    ]) {
      expect(migration).toContain(column)
    }

    expect(migration).not.toMatch(/government_id|identity_document|passport/i)
  })

  it('enforces one open application per user with a partial unique index', () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX trainer_applications_one_open_per_user_idx[\s\S]+ON public\.trainer_applications \(user_id\)[\s\S]+WHERE status IN \('draft', 'submitted', 'under_review', 'changes_requested', 'interview_required'\)/i,
    )
  })

  it('keeps credentials and review details private while exposing a safe applicant event view', () => {
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.trainer_application_events FROM PUBLIC, anon, authenticated/i)
    expect(migration).not.toMatch(/GRANT SELECT ON TABLE public\.trainer_application_events TO authenticated/i)
    expect(migration).toMatch(/CREATE VIEW public\.trainer_application_events_public[\s\S]+from_status[\s\S]+to_status[\s\S]+public_note[\s\S]+actor_user_id[\s\S]+created_at/i)

    const publicView = migration.match(
      /CREATE VIEW public\.trainer_application_events_public[\s\S]+?GRANT SELECT ON TABLE public\.trainer_application_events_public TO authenticated/i,
    )?.[0]
    expect(publicView).toBeDefined()
    expect(publicView).not.toContain('internal_note')
    expect(publicView).toMatch(/trainer_applications[\s\S]+auth\.uid\(\)/i)
    expect(migration).toMatch(/trainer_application_credentials: select own[\s\S]+auth\.uid\(\)/i)
    expect(migration).not.toMatch(/trainer_interviews: select/i)
  })

  it('only lets applicants edit their own draft or correction and does not publish trainer profiles', () => {
    expect(migration).toMatch(/trainer_applications: insert own draft[\s\S]+auth\.uid\(\) = user_id[\s\S]+status = 'draft'/i)
    expect(migration).toMatch(/trainer_applications: update own editable[\s\S]+status IN \('draft', 'changes_requested'\)/i)
    expect(migration).toMatch(/GRANT UPDATE \([\s\S]+professional_name[\s\S]+interview_availability[\s\S]+\)[\s\S]+ON TABLE public\.trainer_applications TO authenticated/i)
    expect(migration).not.toMatch(/GRANT UPDATE \([\s\S]+status[\s\S]+\)[\s\S]+ON TABLE public\.trainer_applications TO authenticated/i)
    expect(migration).toMatch(/trainer_profiles: read own[\s\S]+auth\.uid\(\) = user_id/i)
    expect(migration).not.toMatch(/trainer_profiles: read active|status = 'active'[\s\S]+TO authenticated/i)
  })

  it('requires completed onboarding at the SQL boundary before inserting a draft', () => {
    const insertPolicy = migration.match(
      /CREATE POLICY "trainer_applications: insert own draft"[\s\S]+?;/i,
    )?.[0]

    expect(insertPolicy).toBeDefined()
    expect(insertPolicy).toMatch(
      /WITH CHECK \([\s\S]+EXISTS \(\s*SELECT 1\s+FROM public\.profiles profile\s+WHERE profile\.id = auth\.uid\(\)\s+AND profile\.onboarding_done = TRUE/i,
    )
  })

  it('creates a private credential bucket and reserves administration for service role', () => {
    expect(migration).toMatch(
      /INSERT INTO storage\.buckets \(id, name, public[\s\S]+VALUES \(\s*'trainer-credentials',\s*'trainer-credentials',\s*false/i,
    )

    for (const table of privateTables.filter(table => table !== 'trainer_application_events')) {
      expect(migration).toMatch(new RegExp(`GRANT ALL ON TABLE public\\.${table} TO service_role`, 'i'))
    }
    expect(migration).toMatch(/GRANT SELECT, INSERT ON TABLE public\.trainer_application_events TO service_role/i)
    expect(migration).not.toMatch(/GRANT (?:ALL|UPDATE|DELETE)[^;]*trainer_application_events[^;]*service_role/i)
  })

  it('updates Supabase table and safe view types', () => {
    for (const table of privateTables) expect(databaseTypes).toContain(`${table}: {`)
    expect(databaseTypes).toContain('trainer_application_events_public: {')
    expect(databaseTypes).toContain("status: 'active' | 'suspended' | 'inactive'")
    expect(databaseTypes).toContain("preferred_contact: 'email' | 'phone' | 'whatsapp'")
  })
})

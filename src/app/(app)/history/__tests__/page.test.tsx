import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'

const auth = vi.hoisted(() => ({ context: vi.fn() }))
vi.mock('@/lib/auth/server', () => ({ requireAppUserContext: auth.context }))
vi.mock('@/components/navigation/PageTopBar', () => ({ PageTopBar: ({ subtitle }: { subtitle?: string }) => <header>{subtitle}</header> }))
vi.mock('@/components/navigation/PendingLink', () => ({ PendingLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))

import HistoryPage from '../page'
import HistoryDetailPage from '../[logId]/page'

describe('imported history summary', () => {
  it('shows FitNotes date only in the session header and description', async () => {
    const log = { id: 'fitnotes', user_id: 'owner', workout_id: null, completed_at: '2026-03-08T16:00:00Z', duration_minutes: null, notes: null, mood_rating: null, energy_rating: null, session_context_snapshot: null, workout: null, mobile_session_kind: 'imported', mobile_import: { version: 1, source: 'fitnotes', date: '2026-03-08' } }
    auth.context.mockResolvedValue({ user: { id: 'owner' }, profile: { language: 'es', timezone: 'America/Havana' }, supabase: { from() {
      const query = { select() { return query }, eq() { return query }, maybeSingle: async () => ({ data: log, error: null }), then(resolve: (value: { data: unknown[]; error: null }) => unknown) { return Promise.resolve({ data: [], error: null }).then(resolve) } }
      return query
    } } })
    const html = renderToStaticMarkup(<I18nProvider language="es">{await HistoryDetailPage({ params: Promise.resolve({ logId: 'fitnotes' }) })}</I18nProvider>)
    expect(html).not.toContain('12:00')
    expect(html).toContain('8 de marzo')
    expect(html).toContain('FitNotes')
  })
  it.each([null, 0])('distinguishes an absent weight (%s) from a recorded zero in aggregate metrics', async weightKg => {
    auth.context.mockResolvedValue({ user: { id: 'owner' }, profile: { language: 'es', timezone: 'UTC' }, supabase: {
      from(table: string) {
        const rows = table === 'progress_logs'
          ? [{ id: 'imported', user_id: 'owner', workout_id: null, completed_at: '2026-09-17T10:00:00Z', duration_minutes: null, session_context_snapshot: null, workout: null, mobile_session_kind: 'imported' }]
          : [{ progress_log_id: 'imported', exercise_id: 'exercise', sets_completed: 1, weights_kg: [weightKg], reps_completed: [8], rpe_values: null, notes: null, exercise: null }]
        const query = { select() { return query }, eq() { return query }, order() { return query }, limit() { return query }, in() { return query }, then(resolve: (value: { data: unknown[]; error: null }) => unknown) { return Promise.resolve({ data: rows, error: null }).then(resolve) } }
        return query
      },
    } })
    const html = renderToStaticMarkup(<I18nProvider language="es">{await HistoryPage()}</I18nProvider>)
    expect(html).not.toContain('0 min')
    expect(html.includes('0 kg')).toBe(weightKg === 0)
    expect(html).toContain('/history/imported')
  })
})

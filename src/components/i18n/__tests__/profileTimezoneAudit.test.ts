import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

describe('profile timezone presentation audit', () => {
  it.each([
    ['../../calendar/CalendarDayPanel.tsx', 'timeZone'],
    ['../../history/HistorySessionList.tsx', 'timeZone'],
    ['../../history/ExerciseProgressionSection.tsx', 'timeZone'],
    ['../../coaching/ClientCoachingStatus.tsx', 'timeZone'],
    ['../../coaching/ConsentManager.tsx', 'timeZone'],
    ['../../coaching/CoachRequestQueue.tsx', 'timeZone'],
  ])('routes client timestamp formatting through I18nProvider: %s', (path, contract) => {
    const file = source(path)

    expect(file).toContain('useI18n')
    expect(file).toContain(contract)
  })

  it.each([
    ['../../calendar/ContributionHeatmap.tsx', "timeZone: 'UTC'"],
    ['../../history/HistoryHighlights.tsx', "timeZone: 'UTC'"],
  ])('keeps explicit date-only domain keys stable: %s', (path, contract) => {
    expect(source(path)).toContain(contract)
  })

  it.each([
    ['../../../app/(app)/history/[logId]/page.tsx', 'resolveUserTimeZone(profile.timezone)'],
    ['../../../app/(app)/admin/page.tsx', 'resolveUserTimeZone(profile.timezone)'],
    ['../../../app/(app)/admin/trainers/page.tsx', 'timeZone={timeZone}'],
    ['../../../app/(app)/admin/trainers/[applicationId]/page.tsx', 'timeZone={timeZone}'],
    ['../../../app/(app)/coach/programs/[templateId]/page.tsx', 'resolveUserTimeZone(profile.timezone)'],
    ['../../../app/(app)/coach/clients/page.tsx', 'viewerTimeZone={viewerTimeZone}'],
    ['../../../app/(app)/coach/clients/[clientId]/page.tsx', 'viewerTimeZone={viewerTimeZone}'],
    ['../../../app/suspended/page.tsx', 'resolveUserTimeZone(profile?.timezone)'],
  ])('passes the authenticated profile timezone through server presentation: %s', (path, contract) => {
    expect(source(path)).toContain(contract)
  })
})

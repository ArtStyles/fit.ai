import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { SessionExerciseDisclosure } from '../SessionExerciseDisclosure'
import { buildSessionDebrief } from '../sessionDebrief'

vi.mock('@/components/navigation/PendingLink', () => ({ PendingLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))

describe('timed session exercise disclosure', () => {
  it.each(['es', 'en'] as const)('renders actual seconds without zero-weight rows or a false comparison in %s', language => {
    const result = buildSessionDebrief({ durationMinutes: 5, exercises: [{ id: 'timed', exerciseId: 'walk', exerciseName: 'Walking', muscleGroups: [], setsCompleted: 2, weightsKg: [0, 0], repsCompleted: [0, 0], rpeValues: [null, null], notes: null, durationSeconds: [45, 30] }], previousByExercise: new Map([['walk', { weightsKg: [0], repsCompleted: [0], rpeValues: [null] }]]) })
    const html = renderToStaticMarkup(<I18nProvider language={language}><SessionExerciseDisclosure index={0} exercise={result.exercises[0]} /></I18nProvider>)
    expect(html).toContain('75 s')
    expect(html).toContain('45 s')
    expect(html).toContain('30 s')
    expect(html).not.toContain('0 kg')
    expect(html).not.toContain('Igual que')
    expect(html).not.toContain('Same as previous')
  })
})

import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { SessionHeader } from '@/components/session/SessionHeader'

const testState = vi.hoisted(() => ({
  prescriptionLocked: true,
  workoutName: 'Rutina profesional',
  startedAt: Date.now(),
  exercises: [{
    sets: [
      { completed: true },
      { completed: false },
    ],
    status: 'active',
    skipReason: null,
  }, {
    sets: [
      { completed: false },
      { completed: false },
    ],
    status: 'pending',
    skipReason: null,
  }],
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn() }),
}))

vi.mock('@/store/sessionStore', async importOriginal => ({
  ...await importOriginal<typeof import('@/store/sessionStore')>(),
  useSessionStore: (selector: (state: typeof testState) => unknown) => selector(testState),
}))

function renderHeader(): string {
  return renderToStaticMarkup(createElement(I18nProvider, {
    language: 'es',
    syncDocumentLanguage: false,
    children: createElement(SessionHeader, {
      onFinish: vi.fn(),
      syncState: 'saved-local',
    }),
  }))
}

function finishButton(markup: string): string {
  return (markup.match(/<button[\s\S]*?<\/button>/g) ?? [])
    .find(button => button.includes('Finalizar')) ?? ''
}

describe('SessionHeader locked completion', () => {
  it('explicitly hides account access while preserving session controls', () => {
    const source = readFileSync(new URL('../SessionHeader.tsx', import.meta.url), 'utf8')
    const html = renderHeader()

    expect(source).toContain('accountSlot="hidden"')
    expect(html).toContain('aria-label="Volver"')
    expect(html).toContain('Rutina profesional')
    expect(html).toContain('Finalizar')
  })

  it('disables finish after partial progress in a locked prescription', () => {
    testState.prescriptionLocked = true

    expect(finishButton(renderHeader())).toContain('disabled=""')
  })

  it('keeps personal safe stop available after partial progress', () => {
    testState.prescriptionLocked = false

    expect(finishButton(renderHeader())).not.toContain('disabled=""')
  })
})

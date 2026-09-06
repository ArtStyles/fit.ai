import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import * as bottomNavigation from '../BottomNav'
import type { RestorableSessionSnapshot } from '@/lib/session/persistSession'

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }))
vi.mock('@/app/actions/workspace', () => ({ setWorkspace: vi.fn() }))
const accountWorkspace = vi.hoisted(() => ({ value: { presentedWorkspace: 'personal' as const } }))
vi.mock('../AccountWorkspaceContext', () => ({
  useOptionalAccountWorkspace: () => accountWorkspace.value,
}))

const snapshot: RestorableSessionSnapshot = {
  clientSessionId: 'session-1',
  workoutId: 'workout-1',
  workoutName: 'Fuerza',
  startedAt: Date.now(),
  exercises: [],
}

describe('persistent active workout panel', () => {
  it.each([
    { workspace: 'personal', pathname: '/dashboard', expected: true },
    { workspace: 'coach', pathname: '/coach', expected: false },
    { workspace: 'personal', pathname: '/session/workout-1', expected: false },
  ] as const)('resolves dock visibility for $workspace at $pathname', testCase => {
    const { expected, ...input } = testCase
    expect(bottomNavigation.shouldShowActiveWorkoutDock({ ...input, snapshot }))
      .toBe(expected)
  })

  it('renders a resume destination, live progress, and an explicit discard action', () => {
    const ActiveWorkoutDockView = (bottomNavigation as typeof bottomNavigation & {
      ActiveWorkoutDockView?: ComponentType<{
        workoutId: string
        workoutName: string
        elapsedLabel: string
        completedSets: number
        totalSets: number
        percentage: number
        onDiscard: () => void
      }>
    }).ActiveWorkoutDockView

    const html = ActiveWorkoutDockView
      ? renderToStaticMarkup(createElement(ActiveWorkoutDockView, {
        workoutId: 'workout-1',
        workoutName: 'Pecho y tríceps',
        elapsedLabel: '12 min',
        completedSets: 4,
        totalSets: 12,
        percentage: 33,
        onDiscard: () => undefined,
      }))
      : ''

    expect(html).toContain('href="/session/workout-1"')
    expect(html).toContain('Pecho y tríceps')
    expect(html).toContain('4 de 12 series')
    expect(html).toContain('aria-valuenow="33"')
    expect(html).toContain('aria-label="Descartar entrenamiento"')
  })

  it('reserves scrollable mobile space so the dock cannot cover final page actions', () => {
    const bottomNavSource = readFileSync(new URL('../BottomNav.tsx', import.meta.url), 'utf8')
    const appShellSource = readFileSync(new URL('../AppShell.tsx', import.meta.url), 'utf8')

    expect(bottomNavSource).toContain('data-active-workout-spacer')
    expect(bottomNavSource).toMatch(/data-active-workout-spacer[\s\S]{0,120}h-24/)
    expect(bottomNavSource).not.toMatch(/data-active-workout-spacer[\s\S]{0,120}lg:hidden/)
    expect(appShellSource.indexOf('<ActiveWorkoutDock')).toBeLessThan(appShellSource.indexOf('</AppScrollViewport>'))
  })

  it('releases the server reservation before deleting the local backup', async () => {
    const discardActiveWorkoutSession = (bottomNavigation as typeof bottomNavigation & {
      discardActiveWorkoutSession?: (
        session: { clientSessionId?: string; workoutId: string },
        dependencies: {
          releaseAuthorization: (clientSessionId: string, workoutId: string) => Promise<{ success: boolean; error?: string }>
          clearPersistedSession: () => { ok: boolean }
        },
      ) => Promise<{ ok: boolean; error?: string }>
    }).discardActiveWorkoutSession

    expect(discardActiveWorkoutSession).toBeTypeOf('function')
    if (!discardActiveWorkoutSession) return

    const order: string[] = []
    const result = await discardActiveWorkoutSession(
      { clientSessionId: 'session-1', workoutId: 'workout-1' },
      {
        releaseAuthorization: async () => {
          order.push('server')
          return { success: true }
        },
        clearPersistedSession: () => {
          order.push('local')
          return { ok: true }
        },
      },
    )

    expect(result).toEqual({ ok: true })
    expect(order).toEqual(['server', 'local'])
  })

  it('preserves the local backup when releasing the server reservation fails', async () => {
    const discardActiveWorkoutSession = (bottomNavigation as typeof bottomNavigation & {
      discardActiveWorkoutSession?: (
        session: { clientSessionId?: string; workoutId: string },
        dependencies: {
          releaseAuthorization: (clientSessionId: string, workoutId: string) => Promise<{ success: boolean; error?: string }>
          clearPersistedSession: () => { ok: boolean }
        },
      ) => Promise<{ ok: boolean; error?: string }>
    }).discardActiveWorkoutSession

    expect(discardActiveWorkoutSession).toBeTypeOf('function')
    if (!discardActiveWorkoutSession) return

    const clearPersistedSession = vi.fn(() => ({ ok: true as const }))
    const result = await discardActiveWorkoutSession(
      { clientSessionId: 'session-1', workoutId: 'workout-1' },
      {
        releaseAuthorization: vi.fn().mockResolvedValue({ success: false, error: 'Sin conexión' }),
        clearPersistedSession,
      },
    )

    expect(result).toEqual({ ok: false, error: 'Sin conexión' })
    expect(clearPersistedSession).not.toHaveBeenCalled()
  })

  it('turns a network rejection into a recoverable discard error', async () => {
    const discardActiveWorkoutSession = bottomNavigation.discardActiveWorkoutSession
    const clearPersistedSession = vi.fn(() => ({ ok: true as const }))

    const result = await discardActiveWorkoutSession(
      { clientSessionId: 'session-1', workoutId: 'workout-1' },
      {
        releaseAuthorization: vi.fn().mockRejectedValue(new Error('network unavailable')),
        clearPersistedSession,
      },
    )

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo descartar el entrenamiento. Inténtalo nuevamente.',
    })
    expect(clearPersistedSession).not.toHaveBeenCalled()
  })
})

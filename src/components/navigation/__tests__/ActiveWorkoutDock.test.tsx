import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import * as bottomNavigation from '../BottomNav'

vi.mock('../WorkspaceSwitcher', () => ({ WorkspaceSwitcher: () => null }))
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }))

describe('persistent active workout panel', () => {
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
})

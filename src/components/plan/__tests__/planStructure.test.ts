import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('../../../app/(app)/plan/page.tsx', import.meta.url), 'utf8')
const workspace = readFileSync(new URL('../PlanWorkoutWorkspace.tsx', import.meta.url), 'utf8')
const readView = readFileSync(new URL('../PlanWorkoutReadView.tsx', import.meta.url), 'utf8')

describe('plan information hierarchy', () => {
  it('renders overview and week map before editing tools', () => {
    const ordered = ['<PlanOverview', '<PlanWorkoutWorkspace', '<PlanDistribution']
      .map(marker => page.indexOf(marker))

    expect(ordered.every(position => position >= 0)).toBe(true)
    expect(ordered).toEqual([...ordered].sort((a, b) => a - b))
    expect(workspace).toContain("useState<'read' | 'edit'>('read')")
    expect(workspace).toContain('<WorkoutExerciseList')
    expect(readView).toContain("t('Editar estructura')")
  })

  it('preserves all plan and workout actions', () => {
    for (const marker of [
      '<PlanAdjustButton',
      '<PlanRegenerateButton',
      '<ShareRoutineButton',
      '<PlanSwitcher',
      'updatePlanSummary',
      'updateWorkoutSummary',
      'href={`/session/${',
    ]) {
      expect(`${page}\n${workspace}\n${readView}`).toContain(marker)
    }
  })

  it('keeps destructive exercise controls out of the read view', () => {
    expect(readView).not.toContain('removeWorkoutExercise')
    expect(readView).not.toContain('WorkoutExerciseManager')
  })
})

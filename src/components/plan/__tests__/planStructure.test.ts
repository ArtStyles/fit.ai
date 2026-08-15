import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('../../../app/(app)/plan/page.tsx', import.meta.url), 'utf8')
const workspace = readFileSync(new URL('../PlanWorkoutWorkspace.tsx', import.meta.url), 'utf8')
const readView = readFileSync(new URL('../PlanWorkoutReadView.tsx', import.meta.url), 'utf8')
const exerciseList = readFileSync(new URL('../WorkoutExerciseList.tsx', import.meta.url), 'utf8')
const retireButton = readFileSync(new URL('../PlanRetireButton.tsx', import.meta.url), 'utf8')
const planErrorUrl = new URL('../../../app/(app)/plan/error.tsx', import.meta.url)
const planError = existsSync(planErrorUrl) ? readFileSync(planErrorUrl, 'utf8') : ''

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
      '<PlanRetireButton',
      '<ShareRoutineButton',
      '<PlanSwitcher',
      'updatePlanSummary',
      'updateWorkoutSummary',
      'href={`/session/${',
    ]) {
      expect(`${page}\n${workspace}\n${readView}`).toContain(marker)
    }
  })

  it('lists only current family heads and confirms retirement accessibly', () => {
    expect(page).toContain(".is('superseded_at', null)")
    expect(page).toContain(".is('retired_at', null)")
    expect(retireButton).toContain('window.confirm')
    expect(retireButton).toContain('El plan se archivará, pero tu historial permanecerá intacto.')
    expect(retireButton).toContain('aria-label')
    expect(retireButton).toMatch(/h-11\s+w-11|w-11\s+h-11/)
  })

  it('treats active and library query failures as route errors with retry', () => {
    expect(page).toContain('requirePlanLibraryResults')
    expect(page).not.toContain('const plans = planRows ?? []')
    expect(planError).toContain('<EvidenceRouteError reset={reset} />')
  })

  it('keeps destructive exercise controls out of the read view', () => {
    expect(readView).not.toContain('removeWorkoutExercise')
    expect(readView).not.toContain('WorkoutExerciseManager')
  })

  it('marks catalog selections dirty even though the picker renders in a portal', () => {
    expect(exerciseList).toContain('onSelectionChange={() => onDirtyChange?.(true)}')
  })

  it('renders a locked professional plan as read-only without mutation tools', () => {
    expect(page).toContain('prescriptionLocked')
    expect(page).toContain('Asignada por entrenador')
    expect(workspace).toContain('prescriptionLocked')
    expect(workspace).not.toContain("onEdit={() => setMode('edit')}")
  })

  it('loads and renders reciprocal assignment version metadata for a locked plan', () => {
    expect(page).toContain(".from('trainer_assignment_versions')")
    expect(page).toContain(".eq('id', planRaw.trainer_assignment_version_id)")
    expect(page).toContain('professionalVersion')
    expect(workspace).toContain('prescriptionLocked')
    const overview = readFileSync(new URL('../PlanOverview.tsx', import.meta.url), 'utf8')
    expect(overview).toContain('professionalVersionNumber')
    expect(overview).toContain('professionalChangeSummary')
    expect(overview).toContain("t('Versión {version}', { version: professionalVersionNumber })")
  })
})

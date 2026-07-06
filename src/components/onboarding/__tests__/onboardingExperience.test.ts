import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(file: string) {
  return readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
}

describe('five-stage onboarding experience', () => {
  it('composes exactly the five approved stage components', () => {
    const wizard = readFileSync(new URL('../../../app/onboarding/OnboardingWizard.tsx', import.meta.url), 'utf8')
    for (const stage of ['ProfileStage', 'AvailabilityStage', 'EquipmentStage', 'SafetyStage', 'ConfirmationStage']) {
      expect(wizard).toContain(stage)
    }
    expect(wizard).toContain("case 'generating'")
  })

  it('exposes numbered progress and accessible controls in the shared shell', () => {
    const shell = source('StageShell.tsx')
    expect(shell).toContain('Paso {current} de {total}')
    expect(shell).toContain('role="progressbar"')
    expect(shell).toContain('aria-valuenow={current}')
    expect(shell).toContain('min-h-11')
    expect(shell).toContain('focus-visible:ring-2')
    expect(shell).toContain('motion-reduce:transition-none')
  })

  it('keeps every approved field visible in its containing stage', () => {
    const profile = source('ProfileStage.tsx')
    for (const field of ['full_name', 'username', 'goal', 'fitness_level']) expect(profile).toContain(field)

    const availability = source('AvailabilityStage.tsx')
    for (const field of ['days_per_week', 'session_duration', 'cardio_preferences', 'activity_level']) expect(availability).toContain(field)

    const equipment = source('EquipmentStage.tsx')
    for (const field of ['gym_type', 'equipment']) expect(equipment).toContain(field)

    const safety = source('SafetyStage.tsx')
    for (const field of [
      'injuries', 'warning_symptoms', 'known_disease', 'medically_cleared', 'recent_surgery',
      'limitation_regions', 'limitation_status', 'movements_to_avoid', 'clinician_cleared',
    ]) expect(safety).toContain(field)

    const confirmation = source('ConfirmationStage.tsx')
    for (const field of ['age', 'gender', 'height_cm', 'weight_kg']) expect(confirmation).toContain(field)
  })

  it('surfaces the professional-clearance block before automatic generation', () => {
    const confirmation = source('ConfirmationStage.tsx')
    expect(confirmation).toContain('requiresProfessionalClearance')
    expect(confirmation).toContain('necesitas orientación o autorización de un profesional')
    expect(confirmation).toContain('disabled={automaticDisabled}')
  })

  it('uses Lucide components instead of emoji glyphs', () => {
    const files = [
      'StageShell.tsx', 'ProfileStage.tsx', 'AvailabilityStage.tsx',
      'EquipmentStage.tsx', 'SafetyStage.tsx', 'ConfirmationStage.tsx',
    ]
    const emoji = /[\u2600-\u27BF]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/
    for (const file of files) expect(source(file)).not.toMatch(emoji)
  })
})

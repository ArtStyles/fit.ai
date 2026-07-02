import type { TrainingProfile, ValidationIssue } from './types'

export function validateReadiness(profile: TrainingProfile): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (profile.age !== null && profile.age < 18) {
    issues.push({
      severity: 'error',
      code: 'UNDER_18',
      message: 'El motor automático está disponible únicamente para mayores de 18 años.',
    })
  }

  if (profile.readiness.status === 'pending') {
    issues.push({
      severity: 'error',
      code: 'READINESS_REQUIRED',
      message: 'Completa el cribado de preparación antes de generar un plan.',
    })
  }

  const hasAcuteLimitation = profile.readiness.limitations.some(
    limitation => limitation.status === 'acute' || limitation.status === 'recovering' && !limitation.clinicianCleared,
  )

  const requiresClearance =
    profile.readiness.status === 'professional_clearance_required' ||
    (profile.readiness.warningSymptoms.length > 0 && !profile.readiness.medicallyCleared) ||
    (profile.readiness.recentSurgery && !profile.readiness.medicallyCleared) ||
    hasAcuteLimitation ||
    (profile.readiness.knownCardiovascularMetabolicOrRenalDisease && !profile.readiness.medicallyCleared)

  if (requiresClearance) {
    issues.push({
      severity: 'error',
      code: 'PROFESSIONAL_CLEARANCE_REQUIRED',
      message: 'Antes de generar una rutina necesitas orientación o autorización de un profesional de salud cualificado.',
    })
  }

  if (
    profile.readiness.status === 'modified' &&
    profile.readiness.limitations.every(limitation => limitation.movementsToAvoid.length === 0)
  ) {
    issues.push({
      severity: 'error',
      code: 'LIMITATION_RULES_REQUIRED',
      message: 'La limitación declarada necesita movimientos concretos que deban evitarse.',
    })
  }

  return issues
}

export function prohibitedMovementTags(profile: TrainingProfile): Set<string> {
  return new Set(
    profile.readiness.limitations
      .filter(limitation => limitation.status === 'stable' && limitation.clinicianCleared)
      .flatMap(limitation => [limitation.region, ...limitation.movementsToAvoid])
      .map(value => value.trim().toLowerCase())
      .filter(Boolean),
  )
}

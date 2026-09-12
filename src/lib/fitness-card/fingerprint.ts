import type { FitnessEvidence } from './types'

export function fitnessEvidenceFingerprint(evidence: FitnessEvidence): string {
  const records = evidence.records.map(record => [
    record.exerciseId,
    record.name,
    record.kind,
    record.weightKg,
    record.reps,
    record.seconds,
    record.date,
  ]).sort((left, right) => String(left[0]).localeCompare(String(right[0])) || JSON.stringify(left).localeCompare(JSON.stringify(right)))
  const muscles = evidence.muscles
    .filter(muscle => muscle.sessions > 0)
    .map(muscle => [muscle.id, muscle.sessions] as const)
    .sort((left, right) => left[0].localeCompare(right[0]))
  return JSON.stringify([
    evidence.rangeFrom,
    evidence.rangeTo,
    evidence.totalSessions,
    evidence.partialSessions,
    records,
    muscles,
  ])
}

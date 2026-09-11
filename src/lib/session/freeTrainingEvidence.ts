export type FreeTrainingDetail = 'attendance' | 'partial' | 'complete'
export type FreeTrainingEvidenceSource = {
  mobile_session_kind?: unknown
  mobile_free_training?: unknown
}

/** Mobile-only metadata; unknown or older records keep their existing presentation. */
export function readFreeTrainingDetail(row: FreeTrainingEvidenceSource): FreeTrainingDetail | null {
  if (row.mobile_session_kind !== 'free') return null
  const metadata = row.mobile_free_training
  const detail = metadata && typeof metadata === 'object' && 'detailLevel' in metadata ? metadata.detailLevel : null
  return detail === 'partial' || detail === 'complete' ? detail : 'attendance'
}

export function freeTrainingDetailLabel(detail: FreeTrainingDetail, language: 'es' | 'en'): string {
  if (detail === 'attendance') return language === 'en' ? 'Attendance only' : 'Solo constancia'
  if (detail === 'partial') return language === 'en' ? 'Partial record' : 'Registro parcial'
  return language === 'en' ? 'Complete record' : 'Registro completo'
}

export const GENERIC_TRAINER_ASSIGNMENT_PROPOSAL_ERROR = 'No se pudo enviar la rutina. Inténtalo de nuevo.'

const PROPOSAL_ERROR_MESSAGES = {
  TRAINER_ASSIGNMENT_CONSENT_REQUIRED: 'No se puede enviar la rutina porque la autorización de datos de entrenamiento del cliente no está activa. Pídele que revise Acompañamiento.',
  COACHING_RELATIONSHIP_NOT_ACTIVE: 'El acompañamiento está pausado o finalizado. Revísalo antes de enviar la rutina.',
  TRAINER_ASSIGNMENT_ACTIVE_EXISTS: 'Este cliente ya tiene una rutina profesional activa. Gestiona esa rutina en lugar de enviar otra.',
  TRAINER_ASSIGNMENT_PROPOSAL_EXISTS: 'Este cliente ya tiene una propuesta pendiente de revisión. Gestiona esa propuesta antes de enviar otra.',
  TRAINER_ASSIGNMENT_TEMPLATE_INCOMPLETE: 'Completa todos los días y añade al menos un ejercicio por día antes de enviar la rutina.',
  TRAINER_ASSIGNMENT_TEMPLATE_NOT_AVAILABLE: 'Esta rutina ya no está disponible para enviarla.',
  TRAINER_ASSIGNMENT_TRAINER_INACTIVE: 'Tu perfil de entrenador no está activo.',
  TRAINER_ASSIGNMENT_CLIENT_INACTIVE: 'La cuenta del cliente no está activa.',
} as const

export function mapTrainerAssignmentProposalError(error: unknown): string {
  const texts = typeof error === 'string'
    ? [error]
    : error && typeof error === 'object'
      ? ['message', 'details', 'hint'].flatMap(field => {
        const candidate = (error as Record<string, unknown>)[field]
        return typeof candidate === 'string' ? [candidate] : []
      })
      : []

  for (const [token, message] of Object.entries(PROPOSAL_ERROR_MESSAGES)) {
    if (texts.some(text => text.includes(token))) return message
  }

  return GENERIC_TRAINER_ASSIGNMENT_PROPOSAL_ERROR
}

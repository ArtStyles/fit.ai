'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminUserContext } from '@/lib/auth/admin'
import {
  canTransitionApplication,
  type TrainerApplicationStatus,
} from '@/lib/coaching/status'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const INTERVIEW_MEDIA = new Set(['video_call', 'phone', 'in_person'])
const INTERVIEW_OUTCOME_STATUSES = new Set(['completed', 'cancelled'])
const APPLICATION_STATUSES = new Set<TrainerApplicationStatus>([
  'draft',
  'submitted',
  'under_review',
  'changes_requested',
  'interview_required',
  'approved',
  'rejected',
  'withdrawn',
])

type FieldErrors = Record<string, string>
export type AdminTrainerActionResult = {
  ok: true
  applicationId: string
  status: TrainerApplicationStatus
  transitioned: boolean
  interviewId?: string
} | {
  ok: false
  error: string
  fieldErrors?: FieldErrors
}

type TransitionAction =
  | 'start_review'
  | 'request_changes'
  | 'schedule_interview'
  | 'record_interview_outcome'
  | 'approve'
  | 'reject'

type TransitionResult = {
  application_id: string
  status: TrainerApplicationStatus
  transitioned: boolean
  event_id: string
  interview_id?: string | null
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function optionalText(formData: FormData, key: string): string | null {
  return text(formData, key) || null
}

function actionError(error: string, fieldErrors?: FieldErrors): AdminTrainerActionResult {
  return { ok: false, error, ...(fieldErrors ? { fieldErrors } : {}) }
}

function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function isTimezone(value: string): boolean {
  if (!value || value.length > 100) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

type WallClockParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function parseWallClock(value: string): WallClockParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  }
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute))
  return date.getUTCFullYear() === parts.year
    && date.getUTCMonth() === parts.month - 1
    && date.getUTCDate() === parts.day
    && date.getUTCHours() === parts.hour
    && date.getUTCMinutes() === parts.minute
    ? parts
    : null
}

function zonedParts(timestamp: number, timezone: string): WallClockParts {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(timestamp)).map(part => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  }
}

function sameWallClock(left: WallClockParts, right: WallClockParts): boolean {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute
}

function wallClockToUtc(value: string, timezone: string): string | null {
  const wallClock = parseWallClock(value)
  if (!wallClock) return null
  const wallAsUtc = Date.UTC(
    wallClock.year,
    wallClock.month - 1,
    wallClock.day,
    wallClock.hour,
    wallClock.minute,
  )
  const offsets = new Set<number>()
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = wallAsUtc + hours * 60 * 60 * 1000
    const sampleParts = zonedParts(sample, timezone)
    offsets.add(Date.UTC(
      sampleParts.year,
      sampleParts.month - 1,
      sampleParts.day,
      sampleParts.hour,
      sampleParts.minute,
    ) - sample)
  }

  const candidates = Array.from(offsets)
    .map(offset => wallAsUtc - offset)
    .filter(candidate => sameWallClock(zonedParts(candidate, timezone), wallClock))
  return new Set(candidates).size === 1 ? new Date(candidates[0]).toISOString() : null
}

function notePayload(formData: FormData): { payload: Record<string, string | null>; errors: FieldErrors } {
  const publicNote = optionalText(formData, 'publicNote')
  const internalNote = optionalText(formData, 'internalNote')
  const errors: FieldErrors = {}
  if (publicNote && publicNote.length > 1000) errors.publicNote = 'La nota publica no puede superar 1000 caracteres.'
  if (internalNote && internalNote.length > 2000) errors.internalNote = 'La nota interna no puede superar 2000 caracteres.'
  return { payload: { public_note: publicNote, internal_note: internalNote }, errors }
}

function isTransitionResult(value: unknown): value is TransitionResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.application_id === 'string'
    && typeof row.status === 'string'
    && APPLICATION_STATUSES.has(row.status as TrainerApplicationStatus)
    && typeof row.transitioned === 'boolean'
    && typeof row.event_id === 'string'
    && (row.interview_id === undefined || row.interview_id === null || typeof row.interview_id === 'string')
}

async function applicationTransition(
  formData: FormData,
  action: TransitionAction,
  targetStatus: TrainerApplicationStatus,
  requirePublicNote = false,
): Promise<AdminTrainerActionResult> {
  const context = await requireAdminUserContext()
  const applicationId = text(formData, 'applicationId')
  if (!isValidUuid(applicationId)) return actionError('Solicitud no valida.')
  const { payload, errors } = notePayload(formData)
  if (requirePublicNote && (!payload.public_note || payload.public_note.length < 3)) {
    errors.publicNote = 'La nota publica es obligatoria.'
  }
  if (Object.keys(errors).length > 0) return actionError('Revisa las notas de la decision.', errors)

  return executeTransitionWithContext(context, { applicationId, action, targetStatus, payload })
}

async function executeTransitionWithContext(
  context: Awaited<ReturnType<typeof requireAdminUserContext>>,
  command: {
    applicationId: string
    action: TransitionAction
    targetStatus?: TrainerApplicationStatus
    payload: Record<string, unknown>
  },
): Promise<AdminTrainerActionResult> {
  const { applicationId, action, targetStatus, payload } = command
  const { user, service } = context
  const { data: application, error: applicationError } = await service
    .from('trainer_applications')
    .select('id, status')
    .eq('id', applicationId)
    .maybeSingle()
  if (applicationError || !application || !APPLICATION_STATUSES.has(application.status)) {
    return actionError('Solicitud no disponible.')
  }
  if (targetStatus) {
    if (application.status !== targetStatus
      && !canTransitionApplication(application.status, targetStatus, 'admin')) {
      return actionError('La transicion administrativa no es valida para el estado actual.')
    }
  } else if (action === 'record_interview_outcome' && application.status !== 'interview_required') {
    return actionError('La solicitud no tiene una entrevista pendiente de resultado.')
  }
  const { data, error } = await (service.rpc as any)('transition_trainer_application', {
    p_application_id: applicationId,
    p_actor_user_id: user.id,
    p_action: action,
    p_payload: payload,
  })
  if (error || !isTransitionResult(data) || data.application_id !== applicationId) {
    return actionError('No se pudo actualizar la solicitud.')
  }
  revalidatePath('/admin/trainers')
  revalidatePath(`/admin/trainers/${applicationId}`)
  return {
    ok: true,
    applicationId,
    status: data.status,
    transitioned: data.transitioned,
    ...(data.interview_id ? { interviewId: data.interview_id } : {}),
  }
}

export async function startTrainerReview(formData: FormData): Promise<AdminTrainerActionResult> {
  return applicationTransition(formData, 'start_review', 'under_review')
}

export async function requestTrainerChanges(formData: FormData): Promise<AdminTrainerActionResult> {
  return applicationTransition(formData, 'request_changes', 'changes_requested', true)
}

export async function approveTrainerApplication(formData: FormData): Promise<AdminTrainerActionResult> {
  return applicationTransition(formData, 'approve', 'approved')
}

export async function rejectTrainerApplication(formData: FormData): Promise<AdminTrainerActionResult> {
  return applicationTransition(formData, 'reject', 'rejected', true)
}

export async function scheduleTrainerInterview(formData: FormData): Promise<AdminTrainerActionResult> {
  const context = await requireAdminUserContext()
  const applicationId = text(formData, 'applicationId')
  const interviewId = text(formData, 'interviewId')
  const proposedAt = text(formData, 'proposedAt')
  const timezone = text(formData, 'timezone')
  const medium = text(formData, 'medium')
  const externalUrl = optionalText(formData, 'externalUrl')
  if (!isValidUuid(applicationId)) return actionError('Solicitud no valida.')

  const { payload: notes, errors } = notePayload(formData)
  if (!isValidUuid(interviewId)) errors.interviewId = 'El identificador de entrevista no es valido.'
  if (!isTimezone(timezone)) errors.timezone = 'Selecciona una zona horaria valida.'
  const proposedInstant = errors.timezone ? null : wallClockToUtc(proposedAt, timezone)
  if (!proposedInstant) {
    errors.proposedAt = 'La fecha local no existe o es ambigua en esa zona horaria.'
  } else if (new Date(proposedInstant).getTime() <= Date.now()) {
    errors.proposedAt = 'La entrevista debe programarse para una fecha futura.'
  }
  if (!INTERVIEW_MEDIA.has(medium)) errors.medium = 'Selecciona un medio de entrevista valido.'
  if (externalUrl && (!isHttpsUrl(externalUrl) || externalUrl.length > 2048)) {
    errors.externalUrl = 'El enlace externo debe usar HTTPS.'
  }
  if (Object.keys(errors).length > 0) return actionError('Revisa los datos de la entrevista.', errors)

  return executeTransitionWithContext(context, {
    applicationId,
    action: 'schedule_interview',
    targetStatus: 'interview_required',
    payload: {
      interview_id: interviewId,
      proposed_at: proposedInstant,
      timezone,
      medium,
      external_url: externalUrl,
      ...notes,
    },
  })
}

export async function recordTrainerInterviewOutcome(formData: FormData): Promise<AdminTrainerActionResult> {
  const context = await requireAdminUserContext()
  const applicationId = text(formData, 'applicationId')
  const interviewId = text(formData, 'interviewId')
  const interviewStatus = text(formData, 'interviewStatus')
  const outcome = text(formData, 'outcome')
  if (!isValidUuid(applicationId)) return actionError('Solicitud no valida.')

  const { payload: notes, errors } = notePayload(formData)
  if (!isValidUuid(interviewId)) errors.interviewId = 'La entrevista no es valida.'
  if (!INTERVIEW_OUTCOME_STATUSES.has(interviewStatus)) {
    errors.interviewStatus = 'El resultado debe completar o cancelar la entrevista.'
  }
  if (outcome.length < 3 || outcome.length > 1000) {
    errors.outcome = 'Describe el resultado de la entrevista.'
  }
  if (Object.keys(errors).length > 0) return actionError('Revisa el resultado de la entrevista.', errors)

  return executeTransitionWithContext(context, {
    applicationId,
    action: 'record_interview_outcome',
    payload: {
      interview_id: interviewId,
      interview_status: interviewStatus,
      outcome,
      ...notes,
    },
  })
}

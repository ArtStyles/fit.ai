'use client'

import { useState, type FormEvent } from 'react'
import {
  approveTrainerApplication,
  reinstateTrainerProfile,
  recordTrainerInterviewOutcome,
  rejectTrainerApplication,
  requestTrainerChanges,
  scheduleTrainerInterview,
  startTrainerReview,
  type AdminTrainerActionResult,
} from '@/app/actions/adminTrainers'
import { Button } from '@/components/ui/button'
import type { TrainerApplicationStatus } from '@/lib/coaching/status'

type ActionKey =
  | 'startReview'
  | 'requestChanges'
  | 'scheduleInterview'
  | 'recordOutcome'
  | 'approve'
  | 'reject'
  | 'reinstateProfile'

export type TrainerReviewActionStates = Partial<Record<ActionKey, AdminTrainerActionResult>>

type InterviewSummary = {
  id: string
  status: 'proposed' | 'scheduled' | 'completed' | 'cancelled'
}

const fieldClass = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500'
const noteClass = 'w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500'

function feedbackId(action: ActionKey, field: string): string {
  return `trainer-${action}-${field}-error`
}

function fieldError(state: AdminTrainerActionResult | undefined, action: ActionKey, field: string) {
  if (!state || state.ok) return null
  const message = state.fieldErrors?.[field]
  return message ? <p id={feedbackId(action, field)} className="mt-1 text-xs text-red-300">{message}</p> : null
}

function invalidField(state: AdminTrainerActionResult | undefined, field: string): boolean {
  return Boolean(state && !state.ok && state.fieldErrors?.[field])
}

function ActionFeedback({
  state,
  success,
}: {
  state: AdminTrainerActionResult | undefined
  success: string
}) {
  const fieldMessages = state && !state.ok ? Object.values(state.fieldErrors ?? {}) : []
  return (
    <div
      aria-live={state && !state.ok ? 'assertive' : 'polite'}
      role={state && !state.ok ? 'alert' : 'status'}
      className="min-h-5 text-xs"
    >
      {state && (state.ok
        ? <span className="text-emerald-300">{success}</span>
        : (
            <>
              <span className="text-red-300">{state.error}</span>
              {fieldMessages.length > 0 && <span className="sr-only"> {fieldMessages.join(' ')}</span>}
            </>
          ))}
    </div>
  )
}

export function TrainerReviewActions({
  applicationId,
  status,
  timezone,
  interviews,
  scheduleInterviewId,
  initialActionStates = {},
}: {
  applicationId: string
  status: TrainerApplicationStatus
  timezone: string
  interviews: InterviewSummary[]
  scheduleInterviewId: string
  initialActionStates?: TrainerReviewActionStates
}) {
  const [states, setStates] = useState<TrainerReviewActionStates>(initialActionStates)
  const [pendingAction, setPendingAction] = useState<ActionKey | null>(null)
  const canStartReview = status === 'submitted'
  const canDecide = status === 'under_review' || status === 'interview_required'
  const canScheduleInterview = status === 'under_review'
  const pendingInterview = interviews.find(interview => (
    interview.status === 'proposed' || interview.status === 'scheduled'
  ))
  const hasError = Object.values(states).some(state => state && !state.ok)

  async function submit(
    key: ActionKey,
    action: (formData: FormData) => Promise<AdminTrainerActionResult>,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()
    setPendingAction(key)
    try {
      const result = await action(new FormData(event.currentTarget))
      setStates(current => ({ ...current, [key]: result }))
    } catch {
      setStates(current => ({
        ...current,
        [key]: { ok: false, error: 'No se pudo completar la accion administrativa.' },
      }))
    } finally {
      setPendingAction(null)
    }
  }

  const scheduleState = states.scheduleInterview
  const outcomeState = states.recordOutcome

  return (
    <details open={hasError || undefined} className="w-full max-w-3xl sm:w-auto">
      <summary className="ml-auto flex h-10 w-fit cursor-pointer list-none items-center rounded-md border border-violet-500/30 bg-background px-4 text-sm font-medium hover:bg-accent">
        Gestionar revisión
      </summary>
      <div className="mt-4 max-h-[75vh] overflow-y-auto rounded-2xl border border-border/60 bg-background p-5 sm:w-[min(48rem,calc(100vw-2.5rem))]">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Decisión administrativa</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Registra cambios, entrevistas y decisiones. Las notas internas solo aparecen en este expediente.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <form onSubmit={event => submit('startReview', startTrainerReview, event)} className="rounded-xl border border-border/60 p-4">
            <input type="hidden" name="applicationId" value={applicationId} />
            <h3 className="font-semibold">Iniciar revisión</h3>
            <p className="mt-1 text-xs text-muted-foreground">Marca la solicitud enviada como revisión activa.</p>
            <Button type="submit" disabled={!canStartReview || pendingAction === 'startReview'} className="mt-3 w-full">Iniciar revisión</Button>
            <ActionFeedback state={states.startReview} success="Revision iniciada." />
          </form>

          <form onSubmit={event => submit('requestChanges', requestTrainerChanges, event)} className="space-y-3 rounded-xl border border-border/60 p-4">
            <input type="hidden" name="applicationId" value={applicationId} />
            <h3 className="font-semibold">Solicitar cambios</h3>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Nota pública obligatoria</span>
              <textarea
                name="publicNote"
                required
                minLength={3}
                maxLength={1000}
                rows={3}
                aria-invalid={invalidField(states.requestChanges, 'publicNote')}
                aria-describedby={invalidField(states.requestChanges, 'publicNote') ? feedbackId('requestChanges', 'publicNote') : undefined}
                className={noteClass}
              />
              {fieldError(states.requestChanges, 'requestChanges', 'publicNote')}
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Nota interna</span>
              <textarea name="internalNote" maxLength={2000} rows={2} className={noteClass} />
            </label>
            <Button type="submit" disabled={!canDecide || pendingAction === 'requestChanges'} className="w-full">Solicitar cambios</Button>
            <ActionFeedback state={states.requestChanges} success="Cambios solicitados." />
          </form>

          <form onSubmit={event => submit('scheduleInterview', scheduleTrainerInterview, event)} className="space-y-3 rounded-xl border border-border/60 p-4 sm:col-span-2">
            <input type="hidden" name="applicationId" value={applicationId} />
            <input type="hidden" name="interviewId" value={scheduleInterviewId} />
            <div>
              <h3 className="font-semibold">Programar entrevista</h3>
              <p className="mt-1 text-xs text-muted-foreground">Coordina por los datos de contacto del expediente. Vekira no envía correo ni crea la videollamada.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Fecha futura</span>
                <input
                  name="proposedAt"
                  type="datetime-local"
                  required
                  aria-invalid={invalidField(scheduleState, 'proposedAt')}
                  aria-describedby={invalidField(scheduleState, 'proposedAt') ? feedbackId('scheduleInterview', 'proposedAt') : undefined}
                  className={fieldClass}
                />
                {fieldError(scheduleState, 'scheduleInterview', 'proposedAt')}
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Zona horaria</span>
                <input
                  name="timezone"
                  required
                  maxLength={100}
                  defaultValue={timezone}
                  aria-invalid={invalidField(scheduleState, 'timezone')}
                  aria-describedby={invalidField(scheduleState, 'timezone') ? feedbackId('scheduleInterview', 'timezone') : undefined}
                  className={fieldClass}
                />
                {fieldError(scheduleState, 'scheduleInterview', 'timezone')}
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Medio</span>
                <select name="medium" defaultValue="video_call" className={fieldClass}>
                  <option value="video_call">Videollamada externa</option>
                  <option value="phone">Teléfono</option>
                  <option value="in_person">Presencial</option>
                </select>
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">URL HTTPS opcional</span>
              <input
                name="externalUrl"
                type="url"
                inputMode="url"
                placeholder="https://meet.example.com/..."
                aria-invalid={invalidField(scheduleState, 'externalUrl')}
                aria-describedby={invalidField(scheduleState, 'externalUrl') ? feedbackId('scheduleInterview', 'externalUrl') : undefined}
                className={fieldClass}
              />
              {fieldError(scheduleState, 'scheduleInterview', 'externalUrl')}
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Nota pública</span>
                <textarea name="publicNote" maxLength={1000} rows={2} className={noteClass} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Nota interna</span>
                <textarea name="internalNote" maxLength={2000} rows={2} className={noteClass} />
              </label>
            </div>
            <Button type="submit" disabled={!canScheduleInterview || pendingAction === 'scheduleInterview'} className="w-full">Programar entrevista</Button>
            <ActionFeedback state={scheduleState} success="Entrevista programada." />
          </form>

          <form onSubmit={event => submit('recordOutcome', recordTrainerInterviewOutcome, event)} className="space-y-3 rounded-xl border border-border/60 p-4 sm:col-span-2">
            <input type="hidden" name="applicationId" value={applicationId} />
            <input type="hidden" name="interviewId" value={pendingInterview?.id ?? ''} />
            <h3 className="font-semibold">Registrar resultado</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Estado</span>
                <select name="interviewStatus" defaultValue="completed" className={fieldClass}>
                  <option value="completed">Completada</option>
                  <option value="cancelled">Cancelada</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Resultado</span>
                <input
                  name="outcome"
                  required
                  minLength={3}
                  maxLength={1000}
                  aria-invalid={invalidField(outcomeState, 'outcome')}
                  aria-describedby={invalidField(outcomeState, 'outcome') ? feedbackId('recordOutcome', 'outcome') : undefined}
                  className={fieldClass}
                />
                {fieldError(outcomeState, 'recordOutcome', 'outcome')}
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Nota pública</span>
                <textarea name="publicNote" maxLength={1000} rows={2} className={noteClass} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Nota interna</span>
                <textarea name="internalNote" maxLength={2000} rows={2} className={noteClass} />
              </label>
            </div>
            <Button type="submit" disabled={!pendingInterview || status !== 'interview_required' || pendingAction === 'recordOutcome'} className="w-full">Registrar resultado</Button>
            <ActionFeedback state={outcomeState} success="Resultado registrado." />
          </form>

          <form onSubmit={event => submit('approve', approveTrainerApplication, event)} className="space-y-3 rounded-xl border border-emerald-500/25 p-4">
            <input type="hidden" name="applicationId" value={applicationId} />
            <h3 className="font-semibold text-emerald-200">Aprobar solicitud</h3>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Nota pública</span>
              <textarea name="publicNote" maxLength={1000} rows={2} className={noteClass} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Nota interna</span>
              <textarea name="internalNote" maxLength={2000} rows={2} className={noteClass} />
            </label>
            <Button type="submit" disabled={!canDecide || pendingAction === 'approve'} className="w-full bg-emerald-600 text-white hover:bg-emerald-500">Aprobar solicitud</Button>
            <ActionFeedback state={states.approve} success="Aprobacion guardada." />
          </form>

          {status === 'approved' ? (
            <form onSubmit={event => submit('reinstateProfile', reinstateTrainerProfile, event)} className="space-y-3 rounded-xl border border-amber-500/25 p-4">
              <input type="hidden" name="applicationId" value={applicationId} />
              <h3 className="font-semibold text-amber-100">Restablecer perfil profesional</h3>
              <p className="text-xs text-muted-foreground">
                Restablece solo el perfil profesional suspendido tras reactivar la cuenta global. No reanuda acompañamientos: cada cliente debe confirmarlo.
              </p>
              <Button type="submit" disabled={pendingAction === 'reinstateProfile'} className="w-full" variant="outline">Restablecer perfil profesional</Button>
              <ActionFeedback state={states.reinstateProfile} success="Perfil profesional restablecido." />
            </form>
          ) : null}

          <form onSubmit={event => submit('reject', rejectTrainerApplication, event)} className="space-y-3 rounded-xl border border-red-500/25 p-4">
            <input type="hidden" name="applicationId" value={applicationId} />
            <h3 className="font-semibold text-red-200">Rechazar solicitud</h3>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Nota pública obligatoria</span>
              <textarea
                name="publicNote"
                required
                minLength={3}
                maxLength={1000}
                rows={3}
                aria-invalid={invalidField(states.reject, 'publicNote')}
                aria-describedby={invalidField(states.reject, 'publicNote') ? feedbackId('reject', 'publicNote') : undefined}
                className={noteClass}
              />
              {fieldError(states.reject, 'reject', 'publicNote')}
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Nota interna</span>
              <textarea name="internalNote" maxLength={2000} rows={2} className={noteClass} />
            </label>
            <Button type="submit" disabled={!canDecide || pendingAction === 'reject'} className="w-full">Rechazar solicitud</Button>
            <ActionFeedback state={states.reject} success="Rechazo guardado." />
          </form>
        </div>
      </div>
    </details>
  )
}

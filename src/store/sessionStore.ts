import { create } from 'zustand'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface SetData {
  weightKg:  string       // string para controlar el input
  reps:      string       // string para controlar el input
  durationSeconds?: number // tiempo real completado en ejercicios temporizados
  rpe:       number | null
  completed: boolean
}

export interface PreviousPerformanceData {
  weightKg: number | null
  reps: number | null
  durationSeconds?: number | null
}

export type SessionExerciseSource = 'planned' | 'replacement' | 'ad_hoc'

export interface SessionExerciseDraft {
  exerciseId: string
  name: string
  imageUrl: string | null
  instructions: string | null
  muscleGroups: string[]
  isCompound: boolean
  targetSets?: number | null
  targetReps?: number | null
  targetDuration?: number | null
  restSeconds?: number | null
  targetRpe?: number | null
}

export interface ExerciseSession {
  workoutExerciseId: string
  exerciseId:        string
  originalExerciseId:string | null
  originalName:      string | null
  name:              string
  imageUrl:          string | null
  instructions:      string | null
  muscleGroups:      string[]
  isCompound:        boolean
  targetSets:        number
  targetReps:        number | null
  targetDuration:    number | null    // segundos, para ejercicios de tiempo
  restSeconds:       number
  targetRpe:         number           // default 7
  suggestedWeight:   number | null    // weight_kg inicial sugerido
  weightSuggestionBasis: 'user_baseline_pending' | 'estimated_from_profile' | 'based_on_previous_logs' | null
  notes:             string | null
  source:            SessionExerciseSource
  skipReason:        string | null
  sets:              SetData[]
  status:            'pending' | 'active' | 'completed' | 'skipped'
  expanded:          boolean
  hasLastSessionData: boolean         // true cuando pesos/reps vienen de la sesión anterior
  previousPerformance: PreviousPerformanceData[] | null
}

export interface RestTimerState {
  totalSeconds:     number
  remainingSeconds: number
  exerciseId:       string   // ejercicio que disparó el timer
  isRunning:        boolean
}

export interface SessionState {
  // ── Datos ──────────────────────────────────────────────────────────────────
  clientSessionId: string
  workoutId:   string
  workoutName: string
  startedAt:   number            // Date.now()
  finishedAt:  number            // Date.now() cuando se finaliza
  exercises:   ExerciseSession[]
  prescriptionLocked: boolean
  restTimer:   RestTimerState | null
  isFinished:  boolean

  // ── Acciones ───────────────────────────────────────────────────────────────
  initSession:     (workoutId: string, workoutName: string, exercises: ExerciseSession[], prescriptionLocked?: boolean) => void
  restoreSession:  (snapshot: { clientSessionId?: string; workoutId: string; workoutName: string; startedAt: number; exercises: ExerciseSession[] }, prescriptionLocked?: boolean) => void
  toggleExpanded:  (workoutExerciseId: string) => void
  updateSetField:  (weId: string, setIdx: number, field: 'weightKg' | 'reps', value: string) => void
  updateSetDuration: (weId: string, setIdx: number, seconds: number) => void
  selectRpe:       (weId: string, setIdx: number, rpe: number) => void
  completeSet:     (weId: string, setIdx: number) => void
  skipExercise:    (weId: string, reason?: string | null) => void
  addSessionExercise: (exercise: SessionExerciseDraft) => void
  replaceSessionExercise: (weId: string, exercise: SessionExerciseDraft) => void
  removeSessionExercise: (weId: string) => void
  startRestTimer:  (exerciseId: string, seconds: number) => void
  tickRestTimer:   () => void
  extendRestTimer: (seconds: number) => void
  clearRestTimer:  () => void
  applyProgressions: (updates: Array<{ weId: string; weightKg: number }>) => void
  finishSession:   () => void
  clearSession:    () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function canFinishSession(
  exercises: ExerciseSession[],
  prescriptionLocked: boolean,
): boolean {
  if (!prescriptionLocked) {
    return exercises.some(exercise => exercise.sets.some(set => set.completed))
  }

  return exercises.length > 0 && exercises.every(exercise =>
    exercise.sets.some(set => set.completed)
    || (exercise.status === 'skipped' && Boolean(exercise.skipReason?.trim())),
  )
}

function buildInitialSets(
  targetSets:      number,
  suggestedWeight: number | null,
  lastWeightsKg?:  Array<number | null> | null,
  lastReps?:       Array<number | null> | null,
  targetDuration?: number | null,
): SetData[] {
  return Array.from({ length: targetSets }, (_, i) => {
    // Usar valor de la última sesión por índice; si el nuevo plan tiene más series
    // que la última sesión, repetir el último valor disponible.
    const lastW = lastWeightsKg?.length
      ? (i < lastWeightsKg.length ? lastWeightsKg[i] : lastWeightsKg[lastWeightsKg.length - 1])
      : null
    const lastR = lastReps?.length
      ? (i < lastReps.length ? lastReps[i] : lastReps[lastReps.length - 1])
      : null

    return {
      weightKg:  lastW  != null ? String(lastW)
               : suggestedWeight != null ? String(suggestedWeight)
               : '',
      reps:      lastR != null ? String(lastR) : '',
      durationSeconds: targetDuration ?? 0,
      rpe:       null,
      completed: false,
    }
  })
}

function createClientSessionId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function isClientSessionId(value: string | undefined): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

// ─── Store ────────────────────────────────────────────────────────────────────

function buildFlexibleExercise(
  draft: SessionExerciseDraft,
  source: SessionExerciseSource,
  original?: Pick<
    ExerciseSession,
    'exerciseId' | 'name' | 'targetSets' | 'targetReps' | 'targetDuration' | 'restSeconds' | 'targetRpe' | 'status'
  >,
): ExerciseSession {
  const targetSets = draft.targetSets ?? original?.targetSets ?? 3

  return {
    workoutExerciseId: `session-${draft.exerciseId}-${Date.now()}`,
    exerciseId: draft.exerciseId,
    originalExerciseId: original?.exerciseId ?? null,
    originalName: original?.name ?? null,
    name: draft.name,
    imageUrl: draft.imageUrl,
    instructions: draft.instructions,
    muscleGroups: draft.muscleGroups,
    isCompound: draft.isCompound,
    targetSets,
    targetReps: draft.targetReps ?? original?.targetReps ?? 10,
    targetDuration: draft.targetDuration ?? original?.targetDuration ?? null,
    restSeconds: draft.restSeconds ?? original?.restSeconds ?? 90,
    targetRpe: draft.targetRpe ?? original?.targetRpe ?? 7,
    suggestedWeight: null,
    weightSuggestionBasis: 'user_baseline_pending',
    notes: source === 'replacement' && original?.name
      ? `Cambio solo por hoy: reemplaza ${original.name}.`
      : 'Agregado solo por hoy.',
    source,
    skipReason: null,
    hasLastSessionData: false,
    previousPerformance: null,
    sets: buildInitialSets(targetSets, null, null, null, draft.targetDuration ?? original?.targetDuration ?? null),
    status: original?.status === 'active' ? 'active' : 'pending',
    expanded: original?.status === 'active',
  }
}

export const useSessionStore = create<SessionState>((set, get) => ({
  // ── Estado inicial ─────────────────────────────────────────────────────────
  clientSessionId: '',
  workoutId:   '',
  workoutName: '',
  startedAt:   0,
  finishedAt:  0,
  exercises:   [],
  prescriptionLocked: false,
  restTimer:   null,
  isFinished:  false,

  // ── initSession ───────────────────────────────────────────────────────────
  initSession(workoutId, workoutName, exercises, prescriptionLocked = false) {
    // Activar el primer ejercicio automáticamente
    const initialExercises = exercises.map((ex, i) => ({
      ...ex,
      status:   (i === 0 ? 'active' : 'pending') as ExerciseSession['status'],
      expanded: i === 0,
    }))
    set({
      clientSessionId: createClientSessionId(),
      workoutId,
      workoutName,
      startedAt:  Date.now(),
      finishedAt: 0,
      exercises:  initialExercises,
      prescriptionLocked,
      restTimer:  null,
      isFinished: false,
    })
  },

  // ── restoreSession ────────────────────────────────────────────────────────
  // Restaura el estado completo desde un backup (localStorage) sin resetear
  restoreSession({ clientSessionId, workoutId, workoutName, startedAt, exercises }, prescriptionLocked = false) {
    set({
      clientSessionId: isClientSessionId(clientSessionId) ? clientSessionId : createClientSessionId(),
      workoutId,
      workoutName,
      startedAt,
      finishedAt: 0,
      exercises: exercises
        .filter(exercise => !prescriptionLocked || (exercise.source ?? 'planned') === 'planned')
        .map(exercise => ({
        ...exercise,
        originalExerciseId: exercise.originalExerciseId ?? null,
        originalName: exercise.originalName ?? null,
        source: exercise.source ?? 'planned',
        skipReason: exercise.skipReason ?? null,
        previousPerformance: exercise.previousPerformance ?? null,
        })),
      prescriptionLocked,
      restTimer:  null,
      isFinished: false,
    })
  },

  // ── toggleExpanded ────────────────────────────────────────────────────────
  toggleExpanded(weId) {
    set(s => ({
      exercises: s.exercises.map(ex =>
        ex.workoutExerciseId === weId ? { ...ex, expanded: !ex.expanded } : ex,
      ),
    }))
  },

  // ── updateSetField ────────────────────────────────────────────────────────
  updateSetField(weId, setIdx, field, value) {
    set(s => ({
      exercises: s.exercises.map(ex => {
        if (ex.workoutExerciseId !== weId) return ex
        const sets = ex.sets.map((st, i) =>
          i === setIdx ? { ...st, [field]: value } : st,
        )
        return { ...ex, sets }
      }),
    }))
  },

  updateSetDuration(weId, setIdx, seconds) {
    set(state => ({
      exercises: state.exercises.map(exercise =>
        exercise.workoutExerciseId !== weId
          ? exercise
          : {
            ...exercise,
            sets: exercise.sets.map((setData, index) =>
              index === setIdx
                ? { ...setData, durationSeconds: Math.max(0, Math.round(seconds)) }
                : setData,
            ),
          },
      ),
    }))
  },

  // ── selectRpe ─────────────────────────────────────────────────────────────
  selectRpe(weId, setIdx, rpe) {
    set(s => ({
      exercises: s.exercises.map(ex => {
        if (ex.workoutExerciseId !== weId) return ex
        const sets = ex.sets.map((st, i) =>
          i === setIdx ? { ...st, rpe } : st,
        )
        return { ...ex, sets }
      }),
    }))
  },

  // ── completeSet ───────────────────────────────────────────────────────────
  completeSet(weId, setIdx) {
    const state = get()
    const exIdx = state.exercises.findIndex(e => e.workoutExerciseId === weId)
    if (exIdx === -1) return

    const ex = state.exercises[exIdx]
    const currentWeight = ex.sets[setIdx]?.weightKg ?? ''

    // 1. Marcar el set como completado y pre-rellenar el siguiente
    const newSets = ex.sets.map((st, i) => {
      if (i === setIdx) return { ...st, completed: true }
      if (i === setIdx + 1 && !st.completed && currentWeight)
        return { ...st, weightKg: currentWeight }
      return st
    })

    const allSetsCompleted = newSets.every(st => st.completed)

    // 2. Determinar el siguiente ejercicio si se completa el bloque
    let newExercises = state.exercises.map((e, i) => {
      if (i !== exIdx) return e
      return {
        ...e,
        sets: newSets,
        status: allSetsCompleted
          ? ('completed' as const)
          : e.status,
        expanded: allSetsCompleted ? false : e.expanded,
      }
    })

    if (allSetsCompleted) {
      // Expandir el siguiente ejercicio pendiente
      const nextIdx = newExercises.findIndex(
        (e, i) => i > exIdx && e.status === 'pending',
      )
      if (nextIdx !== -1) {
        newExercises = newExercises.map((e, i) =>
          i === nextIdx ? { ...e, status: 'active' as const, expanded: true } : e,
        )
      }
    }

    set({ exercises: newExercises })

    // 3. Iniciar rest timer (no en el último set del último ejercicio)
    const isLastOfSession =
      allSetsCompleted &&
      newExercises.every(
        (e, i) => i <= exIdx || e.status === 'skipped' || e.status === 'completed',
      )

    if (!isLastOfSession && ex.restSeconds > 0) {
      get().startRestTimer(weId, ex.restSeconds)
    }
  },

  // ── skipExercise ──────────────────────────────────────────────────────────
  skipExercise(weId, reason = null) {
    set(s => {
      const exIdx = s.exercises.findIndex(e => e.workoutExerciseId === weId)
      if (exIdx === -1) return s

      let newExercises = s.exercises.map((e, i) =>
        i === exIdx ? { ...e, status: 'skipped' as const, expanded: false, skipReason: reason } : e,
      )

      // Activar el siguiente pendiente
      const nextIdx = newExercises.findIndex(
        (e, i) => i > exIdx && e.status === 'pending',
      )
      if (nextIdx !== -1) {
        newExercises = newExercises.map((e, i) =>
          i === nextIdx ? { ...e, status: 'active' as const, expanded: true } : e,
        )
      }

      return { exercises: newExercises }
    })
  },

  // ── startRestTimer ────────────────────────────────────────────────────────
  addSessionExercise(exercise) {
    if (get().prescriptionLocked) return
    set(s => {
      const hasActive = s.exercises.some(ex => ex.status === 'active')
      const nextExercise = buildFlexibleExercise(exercise, 'ad_hoc')

      return {
        exercises: [
          ...s.exercises,
          {
            ...nextExercise,
            status: hasActive ? 'pending' as const : 'active' as const,
            expanded: !hasActive,
          },
        ],
      }
    })
  },

  replaceSessionExercise(weId, exercise) {
    if (get().prescriptionLocked) return
    set(s => ({
      exercises: s.exercises.map(ex => {
        if (ex.workoutExerciseId !== weId) return ex
        if (ex.sets.some(set => set.completed)) return ex

        return {
          ...buildFlexibleExercise(exercise, 'replacement', ex),
          workoutExerciseId: weId,
        }
      }),
    }))
  },

  removeSessionExercise(weId) {
    set(s => {
      const target = s.exercises.find(ex => ex.workoutExerciseId === weId)
      if (!target || target.source !== 'ad_hoc') return s

      let nextExercises = s.exercises.filter(ex => ex.workoutExerciseId !== weId)

      if (target.status === 'active') {
        const nextIdx = nextExercises.findIndex(ex => ex.status === 'pending')
        if (nextIdx !== -1) {
          nextExercises = nextExercises.map((ex, index) =>
            index === nextIdx ? { ...ex, status: 'active' as const, expanded: true } : ex,
          )
        }
      }

      return { exercises: nextExercises }
    })
  },

  startRestTimer(exerciseId, seconds) {
    set({
      restTimer: {
        totalSeconds:     seconds,
        remainingSeconds: seconds,
        exerciseId,
        isRunning: true,
      },
    })
  },

  // ── tickRestTimer ─────────────────────────────────────────────────────────
  tickRestTimer() {
    set(s => {
      if (!s.restTimer || !s.restTimer.isRunning) return s
      const remaining = s.restTimer.remainingSeconds - 1
      if (remaining <= 0) {
        return { restTimer: null }
      }
      return { restTimer: { ...s.restTimer, remainingSeconds: remaining } }
    })
  },

  // ── extendRestTimer ───────────────────────────────────────────────────────
  extendRestTimer(seconds) {
    set(s => {
      if (!s.restTimer) return s
      return {
        restTimer: {
          ...s.restTimer,
          totalSeconds:     s.restTimer.totalSeconds + seconds,
          remainingSeconds: s.restTimer.remainingSeconds + seconds,
        },
      }
    })
  },

  // ── clearRestTimer ────────────────────────────────────────────────────────
  clearRestTimer() {
    set({ restTimer: null })
  },

  // ── applyProgressions ────────────────────────────────────────────────────
  applyProgressions(updates) {
    if (get().prescriptionLocked) return
    set(s => ({
      exercises: s.exercises.map(ex => {
        const u = updates.find(item => item.weId === ex.workoutExerciseId)
        if (!u) return ex
        return {
          ...ex,
          sets: ex.sets.map(st => ({ ...st, weightKg: String(u.weightKg) })),
        }
      }),
    }))
  },

  // ── finishSession ─────────────────────────────────────────────────────────
  finishSession() {
    const state = get()
    if (state.prescriptionLocked && !canFinishSession(state.exercises, true)) return
    set({ isFinished: true, finishedAt: Date.now(), restTimer: null })
  },

  // ── clearSession ──────────────────────────────────────────────────────────
  clearSession() {
    set({
      clientSessionId: '',
      workoutId:   '',
      workoutName: '',
      startedAt:   0,
      finishedAt:  0,
      exercises:   [],
      prescriptionLocked: false,
      restTimer:   null,
      isFinished:  false,
    })
  },
}))

// ─── Selector utilitario ──────────────────────────────────────────────────────

export function buildInitialExercises(
  rows: Array<{
    workoutExerciseId: string
    exerciseId:        string
    name:              string
    imageUrl:          string | null
    instructions:      string | null
    muscleGroups:      string[]
    isCompound:        boolean
    targetSets:        number
    targetReps:        number | null
    targetDuration:    number | null
    restSeconds:       number
    targetRpe:         number
    suggestedWeight:   number | null
    weightSuggestionBasis: 'user_baseline_pending' | 'estimated_from_profile' | 'based_on_previous_logs' | null
    notes:             string | null
    lastWeightsKg:     Array<number | null> | null
    lastReps:          Array<number | null> | null
  }>,
): ExerciseSession[] {
  return rows.map(r => ({
    ...r,
    originalExerciseId:  null,
    originalName:        null,
    source:              'planned' as const,
    skipReason:          null,
    hasLastSessionData:  Math.max(r.lastWeightsKg?.length ?? 0, r.lastReps?.length ?? 0) > 0,
    previousPerformance: Math.max(r.lastWeightsKg?.length ?? 0, r.lastReps?.length ?? 0) > 0
      ? Array.from({ length: Math.max(r.lastWeightsKg?.length ?? 0, r.lastReps?.length ?? 0) }, (_, index) => ({
        weightKg: r.lastWeightsKg?.[index] ?? null,
        reps: r.lastReps?.[index] ?? null,
      }))
      : null,
    sets:     buildInitialSets(r.targetSets, r.suggestedWeight, r.lastWeightsKg, r.lastReps, r.targetDuration),
    status:   'pending' as const,
    expanded: false,
  }))
}

import { create } from 'zustand'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface SetData {
  weightKg:  string       // string para controlar el input
  reps:      string       // string para controlar el input
  rpe:       number | null
  completed: boolean
}

export interface ExerciseSession {
  workoutExerciseId: string
  exerciseId:        string
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
  sets:              SetData[]
  status:            'pending' | 'active' | 'completed' | 'skipped'
  expanded:          boolean
}

export interface RestTimerState {
  totalSeconds:     number
  remainingSeconds: number
  exerciseId:       string   // ejercicio que disparó el timer
  isRunning:        boolean
}

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface SessionState {
  // ── Datos ──────────────────────────────────────────────────────────────────
  workoutId:   string
  workoutName: string
  startedAt:   number            // Date.now()
  finishedAt:  number            // Date.now() cuando se finaliza
  exercises:   ExerciseSession[]
  restTimer:   RestTimerState | null
  isFinished:  boolean
  syncStatus:  SyncStatus

  // ── Acciones ───────────────────────────────────────────────────────────────
  initSession:     (workoutId: string, workoutName: string, exercises: ExerciseSession[]) => void
  restoreSession:  (snapshot: { workoutId: string; workoutName: string; startedAt: number; exercises: ExerciseSession[] }) => void
  toggleExpanded:  (workoutExerciseId: string) => void
  updateSetField:  (weId: string, setIdx: number, field: 'weightKg' | 'reps', value: string) => void
  selectRpe:       (weId: string, setIdx: number, rpe: number) => void
  completeSet:     (weId: string, setIdx: number) => void
  skipExercise:    (weId: string) => void
  startRestTimer:  (exerciseId: string, seconds: number) => void
  tickRestTimer:   () => void
  extendRestTimer: (seconds: number) => void
  clearRestTimer:  () => void
  finishSession:   () => void
  setSyncStatus:   (status: SyncStatus) => void
  clearSession:    () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildInitialSets(targetSets: number, suggestedWeight: number | null): SetData[] {
  return Array.from({ length: targetSets }, () => ({
    weightKg:  suggestedWeight != null ? String(suggestedWeight) : '',
    reps:      '',
    rpe:       null,
    completed: false,
  }))
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSessionStore = create<SessionState>((set, get) => ({
  // ── Estado inicial ─────────────────────────────────────────────────────────
  workoutId:   '',
  workoutName: '',
  startedAt:   0,
  finishedAt:  0,
  exercises:   [],
  restTimer:   null,
  isFinished:  false,
  syncStatus:  'idle',

  // ── initSession ───────────────────────────────────────────────────────────
  initSession(workoutId, workoutName, exercises) {
    // Activar el primer ejercicio automáticamente
    const initialExercises = exercises.map((ex, i) => ({
      ...ex,
      status:   (i === 0 ? 'active' : 'pending') as ExerciseSession['status'],
      expanded: i === 0,
    }))
    set({
      workoutId,
      workoutName,
      startedAt:  Date.now(),
      finishedAt: 0,
      exercises:  initialExercises,
      restTimer:  null,
      isFinished: false,
      syncStatus: 'idle',
    })
  },

  // ── restoreSession ────────────────────────────────────────────────────────
  // Restaura el estado completo desde un backup (localStorage) sin resetear
  restoreSession({ workoutId, workoutName, startedAt, exercises }) {
    set({
      workoutId,
      workoutName,
      startedAt,
      finishedAt: 0,
      exercises,
      restTimer:  null,
      isFinished: false,
      syncStatus: 'idle',
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
  skipExercise(weId) {
    set(s => {
      const exIdx = s.exercises.findIndex(e => e.workoutExerciseId === weId)
      if (exIdx === -1) return s

      let newExercises = s.exercises.map((e, i) =>
        i === exIdx ? { ...e, status: 'skipped' as const, expanded: false } : e,
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

  // ── finishSession ─────────────────────────────────────────────────────────
  finishSession() {
    set({ isFinished: true, finishedAt: Date.now(), restTimer: null, syncStatus: 'idle' })
  },

  // ── setSyncStatus ─────────────────────────────────────────────────────────
  setSyncStatus(status) {
    set({ syncStatus: status })
  },

  // ── clearSession ──────────────────────────────────────────────────────────
  clearSession() {
    set({
      workoutId:   '',
      workoutName: '',
      startedAt:   0,
      finishedAt:  0,
      exercises:   [],
      restTimer:   null,
      isFinished:  false,
      syncStatus:  'idle',
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
  }>,
): ExerciseSession[] {
  return rows.map(r => ({
    ...r,
    sets:     buildInitialSets(r.targetSets, r.suggestedWeight),
    status:   'pending' as const,
    expanded: false,
  }))
}

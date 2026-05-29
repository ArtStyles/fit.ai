import { SubmitButton } from '@/components/feedback/SubmitButton'
import { ExercisePicker } from '@/components/plan/ExercisePicker'
import {
  addWorkoutExercise,
  moveWorkoutExercise,
  removeWorkoutExercise,
  replaceWorkoutExercise,
  updateWorkoutExercise,
} from '@/app/actions/plan'
import {
  ArrowDown,
  ArrowUp,
  PencilLine,
  PlusCircle,
  Repeat2,
  Trash2,
  TrendingUp,
} from 'lucide-react'

export type PlanExerciseOption = {
  id: string
  name: string
  muscle_groups: string[] | null
  equipment: string[] | null
  difficulty: string | null
  exercise_type: string | null
  is_compound: boolean | null
}

export type PlanWorkoutExerciseRow = {
  id: string
  workout_id: string
  order_index: number
  sets: number | null
  reps: number | null
  rest_seconds: number | null
  weight_kg: number | null
  notes: string | null
  target_rpe: number | null
  weight_suggestion_basis: string | null
  exercise: PlanExerciseOption | PlanExerciseOption[] | null
}

type WorkoutExerciseListProps = {
  planId: string
  workoutId: string
  exercises: PlanWorkoutExerciseRow[]
  exerciseOptions: PlanExerciseOption[]
}

const inputClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500'

const textareaClass =
  'w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500'

const summaryClass =
  'flex cursor-pointer items-center gap-2 text-xs font-semibold text-violet-300'

function getExercise(row: PlanWorkoutExerciseRow): PlanExerciseOption | null {
  if (Array.isArray(row.exercise)) return row.exercise[0] ?? null
  return row.exercise
}

function normalizeList(values: string[] | null | undefined): string[] {
  return (values ?? []).map(value => value.toLowerCase())
}

function overlapCount(a: string[] | null | undefined, b: string[] | null | undefined): number {
  const bSet = new Set(normalizeList(b))
  return normalizeList(a).filter(value => bSet.has(value)).length
}

function scoreReplacement(current: PlanExerciseOption, candidate: PlanExerciseOption): number {
  let score = overlapCount(current.muscle_groups, candidate.muscle_groups) * 4
  score += overlapCount(current.equipment, candidate.equipment)

  if (current.exercise_type && current.exercise_type === candidate.exercise_type) score += 2
  if (current.is_compound === candidate.is_compound) score += 2
  if (current.difficulty && current.difficulty === candidate.difficulty) score += 1

  return score
}

function getReplacementCandidates(
  current: PlanExerciseOption | null,
  exerciseOptions: PlanExerciseOption[],
): PlanExerciseOption[] {
  if (!current) return exerciseOptions.slice(0, 4)

  return exerciseOptions
    .filter(option => option.id !== current.id)
    .map(option => ({ option, score: scoreReplacement(current, option) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.option.name.localeCompare(b.option.name))
    .slice(0, 4)
    .map(item => item.option)
}

function formatExerciseDetail(row: PlanWorkoutExerciseRow): string {
  const details = [
    row.sets && row.reps ? `${row.sets}x${row.reps}` : null,
    row.weight_kg !== null ? `${row.weight_kg} kg` : null,
    row.target_rpe ? `RPE ${row.target_rpe}` : null,
    row.rest_seconds !== null ? `${row.rest_seconds}s descanso` : null,
  ].filter(Boolean)

  return details.join(' · ')
}

function formatMuscles(groups: string[] | null | undefined): string | null {
  if (!groups || groups.length === 0) return null
  return groups.slice(0, 3).join(' · ')
}

function HiddenFields({
  planId,
  workoutExerciseId,
}: {
  planId: string
  workoutExerciseId: string
}) {
  return (
    <>
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="workoutExerciseId" value={workoutExerciseId} />
    </>
  )
}

function PrescriptionFields({ row }: { row?: PlanWorkoutExerciseRow }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Series</span>
        <input
          name="sets"
          type="number"
          min={1}
          max={12}
          defaultValue={row?.sets ?? 3}
          className={inputClass}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Reps</span>
        <input
          name="reps"
          type="number"
          min={1}
          max={100}
          defaultValue={row?.reps ?? 10}
          className={inputClass}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Peso kg</span>
        <input
          name="weightKg"
          type="number"
          min={0}
          step={0.25}
          defaultValue={row?.weight_kg ?? ''}
          placeholder="Opcional"
          className={inputClass}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Descanso seg.</span>
        <input
          name="restSeconds"
          type="number"
          min={0}
          max={600}
          defaultValue={row?.rest_seconds ?? 60}
          className={inputClass}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">RPE objetivo</span>
        <input
          name="targetRpe"
          type="number"
          min={1}
          max={10}
          defaultValue={row?.target_rpe ?? 8}
          className={inputClass}
        />
      </label>
    </div>
  )
}

export function WorkoutExerciseList({
  planId,
  workoutId,
  exercises,
  exerciseOptions,
}: WorkoutExerciseListProps) {
  const orderedExercises = [...exercises].sort((a, b) => a.order_index - b.order_index)
  const hasExerciseOptions = exerciseOptions.length > 0

  return (
    <div className="mt-4">
      {orderedExercises.length > 0 ? (
        <div className="divide-y divide-border/50">
          {orderedExercises.map((row, index) => {
            const exercise = getExercise(row)
            const detail = formatExerciseDetail(row)
            const replacementCandidates = getReplacementCandidates(exercise, exerciseOptions)
            const muscleLabel = formatMuscles(exercise?.muscle_groups)

            return (
              <div key={row.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {index + 1}. {exercise?.name ?? 'Ejercicio'}
                    </p>
                    {muscleLabel && (
                      <p className="mt-1 text-xs text-muted-foreground">{muscleLabel}</p>
                    )}
                  </div>
                  {detail && (
                    <p className="max-w-[46%] shrink-0 text-right text-xs leading-relaxed text-muted-foreground">
                      {detail}
                    </p>
                  )}
                </div>

                {row.weight_suggestion_basis === 'based_on_previous_logs' && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-200">
                    <TrendingUp className="h-3 w-3" />
                    Ajustado por tu progreso
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <form action={moveWorkoutExercise}>
                    <HiddenFields planId={planId} workoutExerciseId={row.id} />
                    <input type="hidden" name="direction" value="up" />
                    <SubmitButton
                      label="Subir"
                      pendingLabel="Moviendo"
                      aria-label="Subir ejercicio"
                      disabled={index === 0}
                      variant="outline"
                      className="h-8 w-8 border-border/60 bg-muted/10 p-0 text-muted-foreground hover:bg-muted/20"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </SubmitButton>
                  </form>

                  <form action={moveWorkoutExercise}>
                    <HiddenFields planId={planId} workoutExerciseId={row.id} />
                    <input type="hidden" name="direction" value="down" />
                    <SubmitButton
                      label="Bajar"
                      pendingLabel="Moviendo"
                      aria-label="Bajar ejercicio"
                      disabled={index === orderedExercises.length - 1}
                      variant="outline"
                      className="h-8 w-8 border-border/60 bg-muted/10 p-0 text-muted-foreground hover:bg-muted/20"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </SubmitButton>
                  </form>

                  <form action={removeWorkoutExercise} className="ml-auto">
                    <HiddenFields planId={planId} workoutExerciseId={row.id} />
                    <SubmitButton
                      label="Quitar"
                      pendingLabel="Quitando"
                      variant="outline"
                      className="h-8 border-red-500/30 bg-red-500/5 px-2 text-xs text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Quitar
                    </SubmitButton>
                  </form>
                </div>

                <details className="mt-3 rounded-xl border border-border/40 bg-background/50 p-3">
                  <summary className={summaryClass}>
                    <PencilLine className="h-3.5 w-3.5" />
                    Ajustar series y carga
                  </summary>
                  <form action={updateWorkoutExercise} className="mt-4 space-y-3">
                    <HiddenFields planId={planId} workoutExerciseId={row.id} />
                    <PrescriptionFields row={row} />

                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Notas</span>
                      <textarea
                        name="notes"
                        defaultValue={row.notes ?? ''}
                        rows={2}
                        placeholder="Ej. bajar rango si molesta el hombro"
                        className={textareaClass}
                      />
                    </label>

                    <SubmitButton
                      label="Guardar ajustes"
                      pendingLabel="Guardando ajustes"
                      className="h-10 w-full bg-violet-500 text-white hover:bg-violet-600"
                    />
                  </form>
                </details>

                <details className="mt-2 rounded-xl border border-border/40 bg-background/50 p-3">
                  <summary className={summaryClass}>
                    <Repeat2 className="h-3.5 w-3.5" />
                    Cambiar ejercicio
                  </summary>

                  {replacementCandidates.length > 0 && (
                    <div className="mt-4 grid gap-2">
                      {replacementCandidates.map(candidate => (
                        <form key={candidate.id} action={replaceWorkoutExercise}>
                          <HiddenFields planId={planId} workoutExerciseId={row.id} />
                          <input type="hidden" name="exerciseId" value={candidate.id} />
                          <SubmitButton
                            label={candidate.name}
                            pendingLabel="Cambiando"
                            variant="outline"
                            className="h-auto min-h-10 w-full justify-start whitespace-normal border-border/60 bg-muted/10 px-3 py-2 text-left text-xs text-foreground hover:bg-muted/20"
                          >
                            <Repeat2 className="mr-2 h-3.5 w-3.5 shrink-0 text-violet-300" />
                            <span>
                              {candidate.name}
                              {formatMuscles(candidate.muscle_groups) && (
                                <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                                  {formatMuscles(candidate.muscle_groups)}
                                </span>
                              )}
                            </span>
                          </SubmitButton>
                        </form>
                      ))}
                    </div>
                  )}

                  {replacementCandidates.length === 0 && (
                    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                      No encontramos alternativas cercanas. Puedes agregar otro ejercicio abajo y quitar este.
                    </p>
                  )}
                </details>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-4 text-sm text-muted-foreground">
          Este entrenamiento todavía no tiene ejercicios. Agrega el primero desde el catálogo.
        </div>
      )}

      <details className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-violet-200">
          <PlusCircle className="h-4 w-4" />
          Agregar ejercicio
        </summary>

        <form action={addWorkoutExercise} className="mt-4 space-y-3">
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="workoutId" value={workoutId} />

          <ExercisePicker
            name="exerciseId"
            label="Ejercicio"
            options={exerciseOptions}
            disabled={!hasExerciseOptions}
            placeholder="Busca por nombre, músculo o equipo"
          />

          <PrescriptionFields />

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Notas</span>
            <textarea
              name="notes"
              rows={2}
              placeholder="Opcional"
              className={textareaClass}
            />
          </label>

          <SubmitButton
            label="Agregar al entrenamiento"
            pendingLabel="Agregando ejercicio"
            disabled={!hasExerciseOptions}
            className="h-10 w-full bg-violet-500 text-white hover:bg-violet-600"
          />
        </form>
      </details>
    </div>
  )
}

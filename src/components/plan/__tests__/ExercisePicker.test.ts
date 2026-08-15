import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import * as exercisePicker from '../ExercisePicker'

const options = [
  { id: 'bench', name: 'Press de banca', muscleGroups: ['Pecho'], equipment: ['Barra'], imageUrl: null },
  { id: 'curl', name: 'Curl de bíceps', muscleGroups: ['Bíceps'], equipment: ['Mancuernas'], imageUrl: null },
  { id: 'squat', name: 'Sentadilla', muscleGroups: ['Cuádriceps', 'Glúteos'], equipment: ['Barra'], imageUrl: null },
]
type TestOption = (typeof options)[number]

describe('professional exercise picker search', () => {
  it('matches names and metadata without requiring accents or exact casing', () => {
    const filterExerciseCatalog = (exercisePicker as typeof exercisePicker & {
      filterExerciseCatalog?: (
        options: TestOption[],
        filters: { query: string; muscle: string; equipment: string },
      ) => TestOption[]
    }).filterExerciseCatalog

    expect(filterExerciseCatalog?.(options, {
      query: 'BICEPS',
      muscle: '',
      equipment: '',
    }).map(option => option.id)).toEqual(['curl'])

    expect(filterExerciseCatalog?.(options, {
      query: 'cuadriceps',
      muscle: '',
      equipment: 'Barra',
    }).map(option => option.id)).toEqual(['squat'])
  })

  it('combines muscle and equipment filters and exposes sorted unique facets', () => {
    const filterExerciseCatalog = (exercisePicker as typeof exercisePicker & {
      filterExerciseCatalog?: (
        options: TestOption[],
        filters: { query: string; muscle: string; equipment: string },
      ) => TestOption[]
    }).filterExerciseCatalog
    const collectExerciseFacets = (exercisePicker as typeof exercisePicker & {
      collectExerciseFacets?: (options: TestOption[]) => { muscles: string[]; equipment: string[] }
    }).collectExerciseFacets

    expect(filterExerciseCatalog?.(options, {
      query: '',
      muscle: 'Pecho',
      equipment: 'Barra',
    }).map(option => option.id)).toEqual(['bench'])
    expect(collectExerciseFacets?.(options)).toEqual({
      muscles: ['Bíceps', 'Cuádriceps', 'Glúteos', 'Pecho'],
      equipment: ['Barra', 'Mancuernas'],
    })
  })

  it('renders a searchable catalog with professional filters and selection feedback', () => {
    const ExerciseCatalogDialogView = (exercisePicker as typeof exercisePicker & {
      ExerciseCatalogDialogView?: ComponentType<{
        options: TestOption[]
        query: string
        muscle: string
        equipment: string
        selectedIds: string[]
        onQueryChange: (value: string) => void
        onMuscleChange: (value: string) => void
        onEquipmentChange: (value: string) => void
        onToggle: (id: string) => void
        onConfirm: () => void
      }>
    }).ExerciseCatalogDialogView

    const html = ExerciseCatalogDialogView
      ? renderToStaticMarkup(createElement(ExerciseCatalogDialogView, {
        options,
        query: '',
        muscle: '',
        equipment: '',
        selectedIds: ['curl'],
        onQueryChange: () => undefined,
        onMuscleChange: () => undefined,
        onEquipmentChange: () => undefined,
        onToggle: () => undefined,
        onConfirm: () => undefined,
      }))
      : ''

    expect(html).toContain('placeholder="Buscar ejercicio"')
    expect(html).toContain('aria-label="Buscar ejercicios"')
    expect(html).toContain('Todo el equipo')
    expect(html).toContain('Todos los músculos')
    expect(html).toContain('Curl de bíceps')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('Agregar 1 ejercicio')
  })

  it('preserves exercise thumbnails while adapting plan options to the catalog', () => {
    const toExerciseCatalogOptions = (exercisePicker as typeof exercisePicker & {
      toExerciseCatalogOptions?: (options: Array<{
        id: string
        name: string
        muscle_groups: string[] | null
        equipment: string[] | null
        image_url: string | null
      }>) => TestOption[]
    }).toExerciseCatalogOptions

    expect(toExerciseCatalogOptions?.([{
      id: 'bench',
      name: 'Press de banca',
      muscle_groups: ['Pecho'],
      equipment: ['Barra'],
      image_url: 'https://cdn.example.test/bench.webp',
    }])).toEqual([{
      id: 'bench',
      name: 'Press de banca',
      muscleGroups: ['Pecho'],
      equipment: ['Barra'],
      imageUrl: 'https://cdn.example.test/bench.webp',
    }])
  })

  it('queries thumbnail URLs for personal and professional routine catalogs', async () => {
    const [planPage, coachProgramPage] = await Promise.all([
      readFile(new URL('../../../app/(app)/plan/page.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../../../app/(app)/coach/programs/[templateId]/page.tsx', import.meta.url), 'utf8'),
    ])

    expect(planPage).toMatch(/from\('exercises'\)[\s\S]{0,120}\.select\('[^']*image_url/)
    expect(coachProgramPage).toMatch(/from\('exercises'\)[\s\S]{0,120}\.select\('[^']*image_url/)
  })

  it('caps multi-selection at the server-supported batch size while allowing deselection', () => {
    const toggleExerciseSelection = (exercisePicker as typeof exercisePicker & {
      toggleExerciseSelection?: (
        current: string[],
        id: string,
        mode: 'single' | 'multiple',
        maximum?: number,
      ) => string[]
    }).toggleExerciseSelection
    const twelve = Array.from({ length: 12 }, (_, index) => `exercise-${index + 1}`)

    expect(toggleExerciseSelection?.(twelve, 'exercise-13', 'multiple', 12)).toEqual(twelve)
    expect(toggleExerciseSelection?.(twelve, 'exercise-1', 'multiple', 12)).toEqual(twelve.slice(1))
    expect(toggleExerciseSelection?.(['exercise-1'], 'exercise-2', 'single', 12)).toEqual(['exercise-2'])
  })
})

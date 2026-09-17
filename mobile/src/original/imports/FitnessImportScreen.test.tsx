import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./data', () => ({ loadFitnessImportModel: vi.fn(), prepareFitnessImport: vi.fn(), commitFitnessImport: vi.fn(), cancelFitnessImport: vi.fn() }))
vi.mock('../router', () => ({ default: ({ children, ...props }: any) => <a {...props}>{children}</a> }))
import { FitnessImportReview } from './FitnessImportScreen'

const preview = {
  token: 'preview-token', source: 'hevy' as const, fileWorkoutCount: 5, newWorkoutCount: 2, duplicateCount: 2, conflictCount: 1, setCount: 16,
  fromDate: '2026-09-01', toDate: '2026-09-10', timeZone: 'America/Havana', warnings: ['Falta la duración de una sesión.'],
  exercises: [{ key: 'press', name: 'Press original', occurrences: 3, exerciseId: null }],
}
const props = {
  preview, catalog: [{ id: 'known', name: 'Press de banca', nameEn: 'Bench press' }], language: 'es' as const,
  mappings: { press: null }, busy: false, onMap: () => {}, onCancel: () => {}, onImport: () => {},
}

describe('fitness import review presentation', () => {
  it('offers only new sessions and explains duplicates and conflicts without exposing the token', () => {
    const html = renderToStaticMarkup(<FitnessImportReview {...props} />)
    expect(html).toContain('Importar 2 sesiones')
    expect(html).toContain('Ya importadas')
    expect(html).toContain('Por revisar')
    expect(html).toContain('Los conflictos se omiten')
    expect(html).toContain('Falta la duración de una sesión.')
    expect(html).toContain('America/Havana')
    expect(html).not.toContain('preview-token')
  })
  it('keeps unmatched exercise names without assigning muscles or choosing a catalog item', () => {
    const html = renderToStaticMarkup(<FitnessImportReview {...props} />)
    expect(html).toContain('Press original')
    expect(html).toContain('Conservar nombre importado')
    expect(html).toContain('sin asignar músculos')
    expect(html).toContain('Buscar equivalencia')
  })
  it('disables importing when every session is already present and localizes the review', () => {
    const html = renderToStaticMarkup(<FitnessImportReview {...props} language="en" preview={{ ...preview, newWorkoutCount: 0, warnings: [] }} />)
    expect(html).toContain('No new sessions to import')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>No new sessions to import/)
    expect(html).toContain('Keep imported name')
    expect(html).toContain('Already imported')
    expect(html).toContain('Cancel')
  })
})

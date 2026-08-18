import { describe, expect, it } from 'vitest'
import type { MeasurementRow } from '@/app/actions/measurements'
import { deleteMeasurementInteraction } from '../MeasurementHistory'

function measurement(id: string): MeasurementRow {
  return {
    id,
    recorded_at: '2026-08-16T12:00:00.000Z',
    weight_kg: 72,
    body_fat_percentage: null,
    muscle_mass_kg: null,
    chest_cm: null,
    waist_cm: null,
    hips_cm: null,
    arms_cm: null,
    legs_cm: null,
    notes: null,
  }
}

describe('deleteMeasurementInteraction', () => {
  it('restores the exact original rows when the action reports a stable failure', async () => {
    const rows = [measurement('row-1'), measurement('row-2')]

    const result = await deleteMeasurementInteraction(
      rows,
      'row-1',
      async () => ({ success: false, error: 'No se pudo eliminar la medida.' }),
    )

    expect(result.rows).toBe(rows)
    expect(result.error).toBe('No se pudo eliminar la medida.')
  })

  it('removes the requested row only after a confirmed successful result', async () => {
    const rows = [measurement('row-1'), measurement('row-2')]

    const result = await deleteMeasurementInteraction(
      rows,
      'row-1',
      async () => ({ success: true }),
    )

    expect(result.rows.map(row => row.id)).toEqual(['row-2'])
    expect(result.error).toBeNull()
  })

  it('converts a rejected action into the same recoverable failure contract', async () => {
    const rows = [measurement('row-1'), measurement('row-2')]

    const result = await deleteMeasurementInteraction(rows, 'row-1', async () => {
      throw new Error('network unavailable')
    })

    expect(result.rows).toBe(rows)
    expect(result.error).toBe('No se pudo eliminar la medida.')
  })
})

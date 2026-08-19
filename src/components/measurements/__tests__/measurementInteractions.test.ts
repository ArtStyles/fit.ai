import { describe, expect, it } from 'vitest'
import type { MeasurementRow } from '@/app/actions/measurements'
import { deleteMeasurementInteraction } from '../MeasurementHistory'
import * as MeasurementsClientModule from '../MeasurementsClient'

type DeletionCoordinator = {
  isPending: () => boolean
  run: <T>(operation: () => Promise<T>) => Promise<
    | { accepted: true; value: T }
    | { accepted: false }
  >
}

type ClientInteractionContract = {
  confirmMeasurementDeletion?: (confirm: (message: string) => boolean, message: string) => boolean
  createExclusiveMutationCoordinator?: () => DeletionCoordinator
  removeMeasurementOptimistically?: (
    rows: MeasurementRow[],
    id: string,
  ) => { rows: MeasurementRow[]; removed: { row: MeasurementRow; index: number } | null }
  restoreMeasurementRow?: (
    rows: MeasurementRow[],
    removed: { row: MeasurementRow; index: number },
  ) => MeasurementRow[]
}

const interactionContract = MeasurementsClientModule as ClientInteractionContract

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

  it('restores the last exact row after an optimistic deletion fails', () => {
    const remove = interactionContract.removeMeasurementOptimistically
    const restore = interactionContract.restoreMeasurementRow
    expect(remove).toBeTypeOf('function')
    expect(restore).toBeTypeOf('function')
    if (!remove || !restore) return

    const onlyRow = measurement('row-1')
    const optimistic = remove([onlyRow], onlyRow.id)

    expect(optimistic.rows).toEqual([])
    expect(optimistic.removed).toEqual({ row: onlyRow, index: 0 })
    expect(restore(optimistic.rows, optimistic.removed!)).toEqual([onlyRow])
  })

  it('blocks a second deletion even when its promise could resolve before the first', async () => {
    const createCoordinator = interactionContract.createExclusiveMutationCoordinator
    expect(createCoordinator).toBeTypeOf('function')
    if (!createCoordinator) return

    const coordinator = createCoordinator()
    let releaseFirst!: (value: string) => void
    const firstAction = new Promise<string>(resolve => { releaseFirst = resolve })
    let secondActionCalls = 0

    const first = coordinator.run(() => firstAction)
    const second = await coordinator.run(async () => {
      secondActionCalls += 1
      return 'second-resolved-first'
    })

    expect(coordinator.isPending()).toBe(true)
    expect(second).toEqual({ accepted: false })
    expect(secondActionCalls).toBe(0)

    releaseFirst('first-finished')
    await expect(first).resolves.toEqual({ accepted: true, value: 'first-finished' })
    expect(coordinator.isPending()).toBe(false)
  })

  it('requires the localized confirmation result before deletion may start', () => {
    const confirmDeletion = interactionContract.confirmMeasurementDeletion
    expect(confirmDeletion).toBeTypeOf('function')
    if (!confirmDeletion) return

    const messages: string[] = []
    const accepted = confirmDeletion(message => {
      messages.push(message)
      return false
    }, '¿Eliminar esta medida?')

    expect(accepted).toBe(false)
    expect(messages).toEqual(['¿Eliminar esta medida?'])
  })
})

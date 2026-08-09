import { describe, expect, it, vi } from 'vitest'
import { adaptCoachClientMeasurements, getCoachClientMeasurements } from '../insights'

const payload = {
  schemaVersion: 1,
  measurements: [{
    recordedOn: '2026-08-08', weightKg: 70.5, bodyFatPercentage: null, muscleMassKg: 31.2,
    chestCm: null, waistCm: 80, hipsCm: null, armsCm: null, legsCm: null,
  }],
}

describe('coach client measurements adapter', () => {
  it('accepts only the versioned minimal measurement projection', () => {
    expect(adaptCoachClientMeasurements(payload)).toEqual(payload.measurements)
  })

  it('rejects unknown schemas and non-finite or unexpected measurement payloads generically', () => {
    expect(() => adaptCoachClientMeasurements({ ...payload, schemaVersion: 2 })).toThrow('COACH_CLIENT_INSIGHTS_UNAVAILABLE')
    expect(() => adaptCoachClientMeasurements({ ...payload, measurements: [{ ...payload.measurements[0], notes: 'private' }] })).toThrow('COACH_CLIENT_INSIGHTS_UNAVAILABLE')
    expect(() => adaptCoachClientMeasurements({ ...payload, measurements: [{ ...payload.measurements[0], weightKg: Number.NaN }] })).toThrow('COACH_CLIENT_INSIGHTS_UNAVAILABLE')
    expect(() => adaptCoachClientMeasurements({ ...payload, measurements: [{ ...payload.measurements[0], recordedOn: '2026-08-08T12:00:00.000Z' }] })).toThrow('COACH_CLIENT_INSIGHTS_UNAVAILABLE')
  })

  it('converges a measurements RPC failure into the generic unavailable error', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'revoked' } })

    await expect(getCoachClientMeasurements({ rpc }, {
      clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fromDate: '2026-08-01', toDate: '2026-08-08',
    })).rejects.toThrow('COACH_CLIENT_INSIGHTS_UNAVAILABLE')
  })
})

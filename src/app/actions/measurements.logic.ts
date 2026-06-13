import type { LogMeasurementPayload } from './measurements'

export function payloadHasValue(payload: LogMeasurementPayload): boolean {
  return Object.values(payload).some(v => v !== null && v !== undefined && v !== '')
}

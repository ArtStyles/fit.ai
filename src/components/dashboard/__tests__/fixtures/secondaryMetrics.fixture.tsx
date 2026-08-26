import { createRoot } from 'react-dom/client'
import '@/styles/globals.css'
import { SecondaryMetrics } from '../../SecondaryMetrics'

const root = document.getElementById('root')

if (!root) throw new Error('Secondary metrics fixture root is missing.')

createRoot(root).render(
  <main className="mx-auto w-full max-w-6xl px-4 py-6" data-dashboard-fixture>
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-x-8">
      <aside className="lg:col-start-2">
        <SecondaryMetrics metrics={{
          hasCompletedSessions: true,
          streak: 128,
          volumeKg: 987654321,
          volumeSeries: [1000, 2000, 1500, 3500],
          timeZone: 'America/Havana',
          referenceInstant: '2026-08-26T12:00:00.000Z',
          latestSession: {
            id: 'latest-session',
            workoutName: 'Entrenamiento de fuerza del tren inferior con estabilización unilateral avanzada',
            completedAt: '2026-08-25T12:00:00.000Z',
            durationMinutes: 125,
          },
          topRecord: {
            logId: 'record-log',
            exerciseId: 'record-exercise',
            exerciseName: 'Press inclinado con mancuernas y rotación escapular controlada de recorrido completo',
            maxWeightKg: 98765.5,
            repsAtMaxWeight: 12345,
          },
          activeAdjustments: 123456,
        }} />
      </aside>
    </div>
  </main>,
)

window.__SECONDARY_METRICS_READY__ = true

declare global {
  interface Window {
    __SECONDARY_METRICS_READY__?: boolean
  }
}

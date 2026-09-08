import { createRoot } from 'react-dom/client'
import { GeneratePlanClient } from '@/app/(app)/plans/generate/GeneratePlanClient'
import { ToastProvider } from '@/components/feedback/ToastProvider'
import '@/styles/globals.css'

createRoot(document.getElementById('root')!).render(
  <ToastProvider>
    <main className="mx-auto max-w-lg px-4 py-6">
      <GeneratePlanClient
        autoStart={new URLSearchParams(window.location.search).get('autostart') === 'true'}
        profile={{ fitnessLevel: 'beginner', primaryGoal: 'stay_active', daysPerWeek: 3, sessionMinutes: 45, gymType: 'home_basic' }}
      />
    </main>
  </ToastProvider>,
)

requestAnimationFrame(() => {
  (window as Window & { __GENERATE_READINESS_READY__?: boolean }).__GENERATE_READINESS_READY__ = true
})

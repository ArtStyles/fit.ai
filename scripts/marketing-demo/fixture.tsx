import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { SessionClient } from '../../src/app/(app)/session/[workoutId]/SessionClient'
import { I18nProvider } from '../../src/components/i18n/I18nProvider'
import { ToastProvider } from '../../src/components/feedback/ToastProvider'
import { AccountWorkspaceProvider } from '../../src/components/navigation/AccountWorkspaceProvider'
import { DashboardPrimaryFlow } from '../../src/components/dashboard/DashboardPrimaryFlow'
import { DashboardHeader } from '../../src/components/dashboard/DashboardHeader'
import { DashboardWeekJourney } from '../../src/components/dashboard/DashboardWeekJourney'
import { ProgressHub } from '../../src/components/progress/ProgressHub'
import { useSessionStore } from '../../src/store/sessionStore'
import { DEMO_NOW, DEMO_SESSION_ID, DEMO_USER_ID, makeDemoData } from './fixture-data'

const params = new URLSearchParams(window.location.search)
const locale = params.get('locale') === 'en' ? 'en' : 'es'
const surface = params.get('surface') ?? 'dashboard'
const data = makeDemoData(locale)
const text = (es: string, en: string) => locale === 'es' ? es : en

if (surface === 'session') {
  useSessionStore.getState().restoreSession({
    userId: DEMO_USER_ID, clientSessionId: DEMO_SESSION_ID,
    workoutId: data.workouts[0].id, workoutName: data.workouts[0].name,
    startedAt: Date.parse(DEMO_NOW) - 18 * 60_000 - 42_000,
    exercises: data.exercises,
  }, false)
}

function Fixture() {
  useEffect(() => { document.documentElement.dataset.demoReady = 'true' }, [])
  return (
    <I18nProvider language={locale} timeZone="America/Havana">
      <ToastProvider>
        <AccountWorkspaceProvider model={{
          account: { id: DEMO_USER_ID, name: 'Alex', email: 'alex@example.invalid', avatarUrl: null },
          trainerAccess: { granted: false, reason: 'inactive' }, preferredWorkspace: 'personal',
          personalNavItems: [], coachNavItems: [],
        }}>
          {surface === 'session' ? (
            <div style={{ height: '100dvh' }}>
              <SessionClient
                userId={DEMO_USER_ID} workoutId={data.workouts[0].id} workoutName={data.workouts[0].name}
                estimatedMinutes={42} communityEnabled={false} exercises={data.exercises}
                exerciseOptions={[]} prescriptionLocked={false}
              />
            </div>
          ) : surface === 'progress' ? (
            <ProgressHub {...data.progress} />
          ) : (
            <div className="min-h-screen bg-background pb-28">
              <DashboardPrimaryFlow
                header={<DashboardHeader greeting={text('Buenos días', 'Good morning')} firstName="Alex" dateLabel={text('lunes, 7 de septiembre', 'Monday, September 7')} profileHref={null} />}
                mainLabel={text('Dashboard', 'Dashboard')}
                mainClassName="mx-auto max-w-6xl space-y-6 px-4 pt-5 sm:px-6"
                title={<h1 className="sr-only">Dashboard</h1>}
                coaching={null} music={null} notice={null}
                journey={<DashboardWeekJourney dashboard={data.dashboard} />}
              />
            </div>
          )}
        </AccountWorkspaceProvider>
      </ToastProvider>
    </I18nProvider>
  )
}

createRoot(document.getElementById('root')!).render(<Fixture />)

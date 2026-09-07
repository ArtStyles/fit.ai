import '@/styles/globals.css'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SessionClient } from '@/app/(app)/session/[workoutId]/SessionClient'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { ToastProvider } from '@/components/feedback/ToastProvider'
import { AccountWorkspaceProvider } from '@/components/navigation/AccountWorkspaceProvider'
import { ActiveWorkoutDock } from '@/components/navigation/BottomNav'
import { useSessionStore, type ExerciseSession } from '@/store/sessionStore'

const exercises: ExerciseSession[] = [{
  workoutExerciseId: '33333333-3333-4333-8333-333333333333', exerciseId: '44444444-4444-4444-8444-444444444444',
  originalExerciseId: null, originalName: null, name: 'Sentadilla de prueba', imageUrl: null,
  instructions: null, muscleGroups: ['quadriceps'], isCompound: true, targetSets: 1, targetReps: 8,
  targetDuration: null, restSeconds: 0, targetRpe: 7, suggestedWeight: null, weightSuggestionBasis: null,
  notes: null, source: 'planned', skipReason: null, sets: [{ weightKg: '20', reps: '8', rpe: 7, completed: false }],
  status: 'active', expanded: true, hasLastSessionData: false, previousPerformance: null,
}]

function Fixture() {
  const [userId, setUserId] = useState('account-a')
  const [surface, setSurface] = useState('session')
  const state = useSessionStore()
  useEffect(() => { Object.assign(window, { __SESSION_RECOVERY_READY__: true }) }, [])
  return <I18nProvider language="es" syncDocumentLanguage={false}><ToastProvider>
    <div className="flex gap-2 p-2">
      <button onClick={() => setSurface('dock')}>Dashboard de prueba</button>
      <button onClick={() => setUserId('account-a')}>Cuenta A</button>
      <button onClick={() => setUserId('account-b')}>Cuenta B</button>
    </div>
    <output data-session-state hidden>{JSON.stringify({ userId: state.userId, clientSessionId: state.clientSessionId, finishedAt: state.finishedAt, isFinished: state.isFinished, exercises: state.exercises })}</output>
    <AccountWorkspaceProvider model={{ account: { id: userId, name: userId, email: `${userId}@example.com`, avatarUrl: null }, trainerAccess: { granted: false, reason: 'inactive' }, preferredWorkspace: 'personal', personalNavItems: [], coachNavItems: [] }}>
      {surface === 'session' ? <div style={{ height: 'calc(100dvh - 48px)' }}><SessionClient
        userId={userId} workoutId="22222222-2222-4222-8222-222222222222" workoutName="Entrenamiento de cuenta A"
        estimatedMinutes={30} communityEnabled={false} exercises={exercises} exerciseOptions={[]}
        prescriptionLocked={false}
      /></div> : <ActiveWorkoutDock />}
    </AccountWorkspaceProvider>
  </ToastProvider></I18nProvider>
}

createRoot(document.getElementById('root')!).render(<StrictMode><Fixture /></StrictMode>)

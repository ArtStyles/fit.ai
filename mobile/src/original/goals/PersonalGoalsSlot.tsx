import { useEffect, useRef, useState } from 'react'
import type { PersonalGoalsSlotProps } from '@/components/progress/PersonalGoalsSlot'
import { ORIGINAL_STATE_CHANGED } from '../types'
import { getAppStore } from '../storage'
import { loadExerciseGoalsModel } from './data'
import { createGoalsLoader } from './loader'
import { PersonalGoalsPanel } from './PersonalGoalsPanel'
import type { ExerciseGoalsModel } from './types'

export const PERSONAL_GOALS_ENABLED = true

export function PersonalGoalsSlot(props: PersonalGoalsSlotProps) {
  const [model, setModel] = useState<ExerciseGoalsModel | null>(null)
  const [error, setError] = useState(false)
  const [sessionVersion, setSessionVersion] = useState(0)
  const active = useRef<string | null>(null)
  const refresh = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    let alive = true
    let cleanup = () => {}
    void getAppStore().then(store => {
      if (!alive) return
      const loader = createGoalsLoader({
        identity: async () => {
          const version = store.sessionVersion()
          const state = await store.read()
          if (!alive || version !== store.sessionVersion()) return null
          if (active.current !== state?.accountId) { active.current = state?.accountId ?? null; setModel(null) }
          return state ? { accountId: state.accountId, sessionVersion: version } : null
        },
        load: loadExerciseGoalsModel,
        publish: value => { if (alive) { setModel(value); setSessionVersion(store.sessionVersion()); setError(false) } },
        fail: () => { if (alive) setError(true) },
      })
      refresh.current = loader.refresh
      const changed = (event: Event) => {
        const owner = (event as CustomEvent<{ accountId?: string | null }>).detail?.accountId
        if (owner !== undefined && owner !== active.current) { setModel(null); active.current = owner }
        void loader.refresh()
      }
      window.addEventListener(ORIGINAL_STATE_CHANGED, changed)
      cleanup = () => { loader.dispose(); window.removeEventListener(ORIGINAL_STATE_CHANGED, changed) }
      void loader.refresh()
    }).catch(() => { if (alive) setError(true) })
    return () => { alive = false; cleanup(); refresh.current = async () => {} }
  }, [])
  const en = props.language === 'en'
  return <section aria-label={en ? 'My goals' : 'Mis objetivos'}>
    {error && <div role="alert" className="mb-4 rounded-xl border border-border p-4 text-sm"><p>{en ? 'Goals could not be loaded. Your saved records are preserved.' : 'No se pudieron cargar los objetivos. Tus registros guardados se conservan.'}</p><button type="button" onClick={() => void refresh.current()} className="mt-2 min-h-12 rounded-xl px-4 font-semibold text-violet-300">{en ? 'Try again' : 'Reintentar'}</button></div>}
    {model ? <PersonalGoalsPanel key={`${model.accountId}:${sessionVersion}`} {...props} model={model} sessionVersion={sessionVersion} refresh={() => refresh.current()} /> : !error && <p role="status" className="py-4 text-sm text-muted-foreground">{en ? 'Loading your goals…' : 'Cargando tus objetivos…'}</p>}
  </section>
}

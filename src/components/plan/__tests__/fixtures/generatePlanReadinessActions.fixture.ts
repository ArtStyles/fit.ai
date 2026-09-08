import type { GeneratePlanOptions, GeneratePlanResult } from '@/app/actions/generatePlan'
import type { ReadinessReviewData, ReadinessReviewInput } from '@/app/actions/readiness'

export interface ReadinessFixtureState {
  generateCalls: GeneratePlanOptions[]
  loadCalls: number
  saveCalls: ReadinessReviewInput[]
  saved: boolean
  navigation: string[]
  refreshes: number
  events: string[]
  resolveSave?: () => void
}

const fixtureWindow = window as Window & { __READINESS_FIXTURE__?: ReadinessFixtureState }
export const state: ReadinessFixtureState = fixtureWindow.__READINESS_FIXTURE__ ??= {
  generateCalls: [], loadCalls: 0, saveCalls: [], saved: false, navigation: [], refreshes: 0, events: [],
}
const scenario = new URLSearchParams(window.location.search).get('scenario') ?? 'review'
let profile: ReadinessReviewData = {
  activityLevel: 'insufficiently_active',
  cardioPreferences: ['walking'],
  warningSymptoms: [], knownDisease: scenario === 'persistent-review', recentSurgery: false, medicallyCleared: false,
  limitations: [{ region: 'Rodilla', side: 'left', status: 'stable', movementsToAvoid: ['saltos'], clinicianCleared: true }],
}

export async function generatePlan(options: GeneratePlanOptions): Promise<GeneratePlanResult> {
  state.generateCalls.push(structuredClone(options))
  state.events.push('generate')
  if (scenario === 'generic' && state.generateCalls.length === 1) {
    return { success: false, error: 'No se pudo conectar con el servicio de generación.' }
  }
  if (scenario !== 'generic' && (!state.saved || scenario === 'persistent-review')) {
    return {
      success: false,
      requiresReadinessReview: true,
      error: state.saved
        ? 'Antes de generar una rutina necesitas orientación o autorización de un profesional de salud cualificado.'
        : 'Completa el cribado de preparación antes de generar un plan.',
    }
  }
  return { success: true, planId: 'generated-plan', planName: 'Plan de actividad', daysCount: 3, weekNumber: 1 }
}

export async function loadReadinessReview() {
  state.loadCalls += 1
  state.events.push('load')
  if (scenario === 'load-throw' && state.loadCalls === 1) throw new Error('Conexión interrumpida al cargar')
  if (scenario === 'load-error' && state.loadCalls === 1) return { success: false, error: 'No se pudo cargar la preparación guardada.' }
  return { success: true, data: structuredClone(profile) }
}

export async function saveReadinessReview(input: ReadinessReviewInput) {
  state.saveCalls.push(structuredClone(input))
  state.events.push('save')
  if (scenario === 'save-throw' && state.saveCalls.length === 1) throw new Error('Conexión interrumpida al guardar')
  if (scenario === 'save-error' && state.saveCalls.length === 1) return { success: false, error: 'No se pudo guardar la preparación. Inténtalo otra vez.' }
  if (scenario === 'save-hold') await new Promise<void>(resolve => { state.resolveSave = resolve })
  profile = structuredClone(input)
  state.saved = true
  state.events.push('saved')
  return { success: true, status: scenario === 'persistent-review' ? 'professional_clearance_required' : 'modified' }
}

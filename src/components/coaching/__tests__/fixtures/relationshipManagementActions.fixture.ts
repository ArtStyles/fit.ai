type Call = { relationshipId: string; key: string }
export const state = { calls: [] as Call[], refreshes: 0, completed: [] as string[] }
Object.assign(window, { managementState: state })
export function useRouter() { return { refresh: () => { state.refreshes++; window.dispatchEvent(new Event('management-refresh')) } } }
export async function endCoachingRelationship(form: FormData) {
  const relationshipId = String(form.get('relationshipId')), key = String(form.get('idempotencyKey'))
  state.calls.push({relationshipId,key})
  await new Promise(resolve => setTimeout(resolve, 300))
  if (state.calls.length === 1) return {ok:false,error:'No se pudo finalizar el acompañamiento.'}
  state.completed.push(relationshipId)
  return {ok:true,relationshipId,changed:true}
}
export function trackEvent() { return Promise.resolve() }

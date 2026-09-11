import { loadFreeTrainingDraft, loadFreeTrainingModel } from './data'
import { FreeTrainingScreen } from './FreeTrainingScreen'
import { redirect } from '../router'
import type { FreeTrainingDraft } from './view-model'

export default async function FreeTrainingPage({ searchParams }: {
  params: Promise<Record<string, string>>
  searchParams: Promise<Record<string, string | string[]>>
}) {
  const search = await searchParams
  const logId = typeof search.log === 'string' ? search.log : undefined
  const draftId = typeof search.draft === 'string' ? search.draft : undefined
  const model = await loadFreeTrainingModel(logId, draftId)
  if (!logId && !draftId) redirect(`/registrar?draft=${model.initial.sessionId}`)
  let draft: FreeTrainingDraft | null = null
  let draftLoadFailed = false
  try { draft = await loadFreeTrainingDraft(model.accountId, model.initial.sessionId) as FreeTrainingDraft | null }
  catch { draftLoadFailed = true }
  // Explicitly reopening the saved version starts its editor instead of keeping
  // the previous result state. Ordinary local commits do not reload this route.
  return <FreeTrainingScreen key={`${model.accountId}:${model.initial.sessionId}:${model.initial.expectedVersion ?? 'new'}`} model={model} draft={draft} draftLoadFailed={draftLoadFailed} />
}

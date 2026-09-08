import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { adaptCoachClientInsights, adaptCoachClientsSummary } from '../src/lib/coaching/insights'

const { baseline, migrated, beforeRerun, afterRerun } = JSON.parse(readFileSync(0, 'utf8'))
const detailExpected = { prescribed: 3, completed: 1, missed: 2, pending: 0, adherencePercent: 33 }
const summaryExpected = { prescribed: 1, completed: 1, missed: 0, pending: 0, adherencePercent: 100 }
for (const [label, payload] of Object.entries({ baseline, migrated, beforeRerun, afterRerun }).filter(([, payload]) => payload) as [string, typeof baseline][]) {
  assert.equal(payload.sessionUser, 'authenticator')
  assert.equal(payload.currentUser, 'authenticated')
  const detail = adaptCoachClientInsights(payload.detail, payload)
  assert.deepEqual(detail.adherence, detailExpected, `${label}: historical prescribed/completed counts`)
  assert.equal(detail.sessions[0].classification, 'prescribed', `${label}: trusted completion classification`)
  assert.ok(payload.summary.clients.every((client: { relationshipId?: unknown }) => typeof client.relationshipId === 'string' && client.relationshipId.length > 0), `${label}: SQL emits exact relationship identity`)
  const summary = adaptCoachClientsSummary(payload.summary, payload.now)
  assert.deepEqual(summary.clients.find(client => client.clientId.endsWith('002'))?.adherence, summaryExpected, `${label}: summary prescribed/completed counts`)
  if (label !== 'baseline') {
    const frozen = adaptCoachClientInsights(payload.frozen, payload)
    assert.deepEqual(frozen.adherence, detailExpected, `${label}: frozen retained history`)
    assert.equal(frozen.sessions[0].classification, 'prescribed', `${label}: frozen completion classification`)
    assert.deepEqual(summary.clients.find(client => client.clientId.endsWith('003'))?.adherence, summaryExpected, `${label}: frozen summary counts`)
  }
  console.log(`${label}: real detail/summary adapters preserve prescribed=3/completed=1 and weekly prescribed=1/completed=1`)
}

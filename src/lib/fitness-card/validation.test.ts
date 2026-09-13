import { describe, expect, it } from 'vitest'
import { parseFitnessCard, parseFitnessHub, parseFitnessInvite } from './validation'
import type { FitnessCard } from './types'

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const viewer = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const instant = '2026-09-12T10:00:00Z'
const fixture = (): FitnessCard => ({ owner: { userId: owner, name:'Ana', username:'ana', avatarUrl:null }, artisticName:'Astra', theme:'violet', revision:1, photos:[{slot:1,path:`${owner}/1.webp`}], updatedAt:instant, evidence:{ records:[{exerciseId:'local-squat',name:'Squat',kind:'strength',weightKg:80,reps:8,seconds:null,date:'2026-01-12'}], muscles:[{id:'quads',sessions:2}],totalSessions:2,partialSessions:1,rangeFrom:'2026-06-21',rangeTo:'2026-09-12',updatedAt:instant} })

describe('Fitness Card authority response parsing', () => {
  it('accepts real complete evidence and defaults absent legacy social links', () => { expect(parseFitnessCard(fixture())).toEqual({ ...fixture(), socialLinks: {} }) })
  it('normalizes links and pins the minimal QR invite to its requested owner', () => {
    expect(parseFitnessCard({ ...fixture(), socialLinks: { x: '@ana' } }).socialLinks).toEqual({ x: 'https://x.com/ana' })
    expect(() => parseFitnessCard({ ...fixture(), socialLinks: { x: 'https://evil.test/a' } })).toThrow()
    expect(parseFitnessInvite({ owner: fixture().owner, status: 'available', evidence: 'private' }, owner)).toEqual({ owner: fixture().owner, status: 'available' })
    expect(() => parseFitnessInvite({ owner: fixture().owner, status: 'accepted' }, viewer)).toThrow()
  })
  it.each([
    ['null muscle', (card: any) => { card.evidence.muscles = [null] }],
    ['unknown muscle', (card: any) => { card.evidence.muscles[0].id = 'invented' }],
    ['duplicate muscle', (card: any) => { card.evidence.muscles.push(card.evidence.muscles[0]) }],
    ['excess muscle sessions', (card: any) => { card.evidence.muscles[0].sessions = 3 }],
    ['NaN record', (card: any) => { card.evidence.records[0].weightKg = NaN }],
    ['fractional reps', (card: any) => { card.evidence.records[0].reps = 1.5 }],
    ['invalid record date', (card: any) => { card.evidence.records[0].date = '2026-02-30' }],
    ['future record', (card: any) => { card.evidence.records[0].date = '2026-09-13' }],
    ['wrong range', (card: any) => { card.evidence.rangeFrom = '2026-06-20' }],
    ['excess partial count', (card: any) => { card.evidence.partialSessions = 3 }],
    ['foreign photo', (card: any) => { card.photos[0].path = `${viewer}/1.webp` }],
    ['public photo URL', (card: any) => { card.photos[0].path = 'https://example.com/1.webp' }],
    ['duplicate slot', (card: any) => { card.photos.push(card.photos[0]) }],
    ['invalid timestamp', (card: any) => { card.updatedAt = 'yesterday' }],
    ['unsafe revision', (card: any) => { card.revision = Number.MAX_SAFE_INTEGER + 1 }],
    ['invalid identity', (card: any) => { card.owner.userId = 'not-a-uuid' }],
  ])('rejects %s', (_, mutate) => { const card = fixture(); mutate(card); expect(() => parseFitnessCard(card)).toThrow() })
  it('accepts bounded duration and rejects conflicting strength fields', () => { const card=fixture(); card.evidence.records[0] = {...card.evidence.records[0],kind:'duration',weightKg:null,reps:null,seconds:60}; expect(parseFitnessCard(card)).toEqual({...card,socialLinks:{}}); card.evidence.records[0].weightKg=2; expect(() => parseFitnessCard(card)).toThrow() })
  it('validates actor ownership and relationships in the hub', () => {
    const card=fixture(); const state={viewerId:owner,own:card,received:[],access:[]}; expect(parseFitnessHub(state,owner)).toEqual({...state,own:{...card,socialLinks:{}}})
    expect(() => parseFitnessHub(state,viewer)).toThrow()
    expect(() => parseFitnessHub({...state,viewerId:viewer},viewer)).toThrow()
    expect(() => parseFitnessHub({...state,access:[{id:viewer,owner:{...card.owner,userId:viewer},viewer:{...card.owner,userId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'},status:'accepted',updatedAt:instant}]},owner)).toThrow()
  })
  it('strips unrelated received content instead of retaining it', () => { const card=fixture(); const result=parseFitnessHub({viewerId:viewer,own:null,access:[],received:[{...card,privateHistory:['secret']}]},viewer); expect(result.received[0]).not.toHaveProperty('evidence'); expect(result.received[0]).not.toHaveProperty('privateHistory') })
})

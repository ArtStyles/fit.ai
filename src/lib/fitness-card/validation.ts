import { MUSCLE_GROUPS, type MuscleGroupId } from '@/lib/muscles/activity'
import { MAX_SESSION_DURATION_SECONDS, MAX_SESSION_REPS, MAX_SESSION_WEIGHT_KG } from '@/lib/session/limits'
import { isCivilDate } from '@/lib/workouts/occurrences'
import { normalizeFitnessSocialLinks } from './socials'
import type { FitnessInvite } from './types'
import type { FitnessAccess, FitnessCard, FitnessCover, FitnessEvidence, FitnessHubState, FitnessIdentity, FitnessPhoto, FitnessRecord, FitnessTheme } from './types'

const invalid = (): never => { throw new Error('FITNESS_CARD_INVALID_RESPONSE') }
const row = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : invalid()
const text = (value: unknown, max = Infinity, min = 0): string => typeof value === 'string' && value.length <= max && value.trim().length >= min ? value : invalid()
const nullableText = (value: unknown): string | null => value === null ? null : text(value)
const number = (value: unknown, min: number, max: number, integer = false): number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isSafeInteger(value)) ? value : invalid()
const uuid = (value: unknown): string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : invalid()
const date = (value: unknown): string => isCivilDate(value) ? value : invalid()
const timestamp = (value: unknown): string => typeof value === 'string' && isCivilDate(value.slice(0,10)) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? value : invalid()
const list = (value: unknown, max = Infinity): unknown[] => Array.isArray(value) && value.length <= max ? value : invalid()
function unique<T>(values: T[], key: (value: T) => string | number): T[] { if (new Set(values.map(key)).size !== values.length) invalid(); return values }
function identity(value: unknown): FitnessIdentity { const item=row(value); return {userId:uuid(item.userId),name:text(item.name),username:nullableText(item.username),avatarUrl:nullableText(item.avatarUrl)} }
function cover(value: unknown): FitnessCover {
  const item=row(value)
  if (item.theme !== 'violet' && item.theme !== 'ember' && item.theme !== 'ice') invalid()
  return {owner:identity(item.owner),artisticName:text(item.artisticName,60),theme:item.theme as FitnessTheme,updatedAt:timestamp(item.updatedAt),socialLinks:normalizeFitnessSocialLinks(item.socialLinks)}
}
export function parseFitnessInvite(value: unknown, ownerId: string): FitnessInvite {
  const item = row(value), owner = identity(item.owner)
  if (owner.userId !== uuid(ownerId) || !['self','accepted','pending','available'].includes(item.status as string)) return invalid()
  return { owner, status: item.status as FitnessInvite['status'] }
}
function evidence(value: unknown): FitnessEvidence {
  const item=row(value)
  const rangeFrom=date(item.rangeFrom), rangeTo=date(item.rangeTo)
  if ((Date.parse(`${rangeTo}T12:00:00Z`) - Date.parse(`${rangeFrom}T12:00:00Z`)) / 86400000 !== 83) invalid()
  const totalSessions=number(item.totalSessions,0,999999,true)
  const partialSessions=number(item.partialSessions,0,totalSessions,true)
  const muscles=unique(list(item.muscles,MUSCLE_GROUPS.length).map(value => {
    const muscle=row(value)
    if (!MUSCLE_GROUPS.some(group => group.id === muscle.id)) invalid()
    return {id:muscle.id as MuscleGroupId,sessions:number(muscle.sessions,0,totalSessions,true)}
  }), muscle => muscle.id)
  const records=unique(list(item.records,12).map((value): FitnessRecord => {
    const record=row(value)
    const recordedDate=date(record.date)
    if (recordedDate > rangeTo) invalid()
    const common={exerciseId:text(record.exerciseId,160,1),name:text(record.name,160,1),date:recordedDate}
    if (record.kind === 'strength') {
      if (record.seconds !== null) invalid()
      return {...common,kind:'strength',weightKg:number(record.weightKg,0,MAX_SESSION_WEIGHT_KG),reps:number(record.reps,1,MAX_SESSION_REPS,true),seconds:null}
    }
    if (record.kind !== 'duration' || record.weightKg !== null || record.reps !== null) invalid()
    return {...common,kind:'duration',weightKg:null,reps:null,seconds:number(record.seconds,1,MAX_SESSION_DURATION_SECONDS)}
  }), record => record.exerciseId)
  return {records,muscles,totalSessions,partialSessions,rangeFrom,rangeTo,updatedAt:timestamp(item.updatedAt)}
}

/** Rebuild the minimal contract so unexpected remote fields never enter UI state. */
export function parseFitnessCard(value: unknown): FitnessCard {
  const item=row(value), summary=cover(item)
  const photos=unique(list(item.photos,3).map((value): FitnessPhoto => {
    const photo=row(value)
    const slot=number(photo.slot,1,3,true) as 1 | 2 | 3
    if (photo.path !== `${summary.owner.userId}/${slot}.webp`) invalid()
    return {slot,path:photo.path as string}
  }), photo => photo.slot)
  return {...summary,revision:number(item.revision,1,Number.MAX_SAFE_INTEGER,true),photos,evidence:evidence(item.evidence)}
}

export function parseFitnessHub(value: unknown, viewerId: string): FitnessHubState {
  const item=row(value)
  if (uuid(item.viewerId) !== uuid(viewerId)) invalid()
  const own=item.own === null ? null : parseFitnessCard(item.own)
  if (own && own.owner.userId !== viewerId) invalid()
  const received=unique(list(item.received).map(cover), card => card.owner.userId)
  if (received.some(card => card.owner.userId === viewerId)) invalid()
  const access=unique(list(item.access).map((value): FitnessAccess => {
    const entry=row(value), owner=identity(entry.owner), viewer=identity(entry.viewer)
    if (owner.userId === viewer.userId || (owner.userId !== viewerId && viewer.userId !== viewerId)) invalid()
    if (entry.status !== 'pending' && entry.status !== 'accepted' && entry.status !== 'rejected' && entry.status !== 'revoked') invalid()
    return {id:uuid(entry.id),owner,viewer,status:entry.status as FitnessAccess['status'],updatedAt:timestamp(entry.updatedAt)}
  }), entry => entry.id)
  return {viewerId,own,received,access}
}

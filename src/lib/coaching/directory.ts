import type { Database, Json } from '@/types/database'
import { createClient } from '@/lib/supabase/server'

export type DirectoryFilters = {
  text?: string
  specialty?: string
  modality?: string
  language?: string
  location?: string
}

export type PublicTrainerService = {
  name: string
  description: string
  modality: 'online' | 'in_person' | 'hybrid'
  durationMinutes: number
  content: string
}

export type RequestableTrainerService = PublicTrainerService & { id: string }

export type PublicTrainerDirectoryRow = {
  userId: string
  slug: string
  professionalName: string
  professionalPhotoUrl: string | null
  bio: string
  specialties: string[]
  modalities: Array<'online' | 'in_person' | 'hybrid'>
  experienceSummary: string
  generalLocation: string | null
  languages: string[]
  verifiedAt: string
  services: PublicTrainerService[]
}

export type DirectoryCursor = Pick<PublicTrainerDirectoryRow, 'professionalName' | 'userId'>

const DIRECTORY_PAGE_SIZE = 12
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeDirectoryText(value: string | undefined) {
  const normalized = value?.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
  return normalized || undefined
}

export function normalizeDirectoryFilters(filters: DirectoryFilters) {
  return {
    text: normalizeDirectoryText(filters.text),
    specialty: normalizeDirectoryText(filters.specialty),
    modality: normalizeDirectoryText(filters.modality),
    language: normalizeDirectoryText(filters.language),
    location: normalizeDirectoryText(filters.location),
  }
}

export function encodeDirectoryCursor(cursor: DirectoryCursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function decodeDirectoryCursor(cursor: string | undefined): DirectoryCursor | null {
  if (!cursor || cursor.length > 512) return null

  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (
      !decoded
      || typeof decoded !== 'object'
      || !('professionalName' in decoded)
      || !('userId' in decoded)
      || typeof decoded.professionalName !== 'string'
      || !decoded.professionalName.trim()
      || decoded.professionalName.length > 160
      || typeof decoded.userId !== 'string'
      || !UUID_PATTERN.test(decoded.userId)
    ) return null

    return { professionalName: decoded.professionalName, userId: decoded.userId }
  } catch {
    return null
  }
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, character => `\\${character}`)
}

function quotePostgrestValue(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function parseServices(value: Json): PublicTrainerService[] {
  if (!Array.isArray(value)) return []

  return value.flatMap(service => {
    if (!service || typeof service !== 'object' || Array.isArray(service)) return []
    const candidate = service as Record<string, unknown>
    if (
      typeof candidate.name !== 'string'
      || typeof candidate.description !== 'string'
      || (candidate.modality !== 'online' && candidate.modality !== 'in_person' && candidate.modality !== 'hybrid')
      || typeof candidate.duration_minutes !== 'number'
      || typeof candidate.content !== 'string'
    ) return []

    return [{
      name: candidate.name,
      description: candidate.description,
      modality: candidate.modality,
      durationMinutes: candidate.duration_minutes,
      content: candidate.content,
    }]
  })
}

function toPublicTrainerDirectoryRow(row: Database['public']['Views']['active_trainer_directory']['Row']): PublicTrainerDirectoryRow {
  return {
    userId: row.user_id,
    slug: row.slug,
    professionalName: row.professional_name,
    professionalPhotoUrl: row.professional_photo_url,
    bio: row.bio,
    specialties: row.specialties,
    modalities: row.modalities,
    experienceSummary: row.experience_summary,
    generalLocation: row.general_location,
    languages: row.languages,
    verifiedAt: row.verified_at,
    services: parseServices(row.active_services),
  }
}

export async function getTrainerDirectory({
  filters = {},
  cursor,
  limit = DIRECTORY_PAGE_SIZE,
}: {
  filters?: DirectoryFilters
  cursor?: string
  limit?: number
} = {}) {
  const normalized = normalizeDirectoryFilters(filters)
  const pageSize = Math.min(Math.max(Math.floor(limit), 1), 50)
  const decodedCursor = decodeDirectoryCursor(cursor)
  const supabase = await createClient()

  let query = supabase
    .from('active_trainer_directory')
    .select('user_id, slug, professional_name, professional_photo_url, bio, specialties, modalities, experience_summary, general_location, languages, verified_at, active_services')

  if (normalized.text) query = query.ilike('directory_search', `%${escapeLike(normalized.text)}%`)
  if (normalized.specialty) query = query.ilike('specialties_search', `%${escapeLike(normalized.specialty)}%`)
  if (normalized.modality && ['online', 'in_person', 'hybrid'].includes(normalized.modality)) {
    query = query.contains('modalities', [normalized.modality])
  }
  if (normalized.language) query = query.ilike('languages_search', `%${escapeLike(normalized.language)}%`)
  if (normalized.location) query = query.ilike('general_location', `%${escapeLike(normalized.location)}%`)
  if (decodedCursor) {
    const name = quotePostgrestValue(decodedCursor.professionalName)
    const userId = quotePostgrestValue(decodedCursor.userId)
    query = query.or(`professional_name.gt.${name},and(professional_name.eq.${name},user_id.gt.${userId})`)
  }

  const { data, error } = await query
    .order('professional_name', { ascending: true })
    .order('user_id', { ascending: true })
    .limit(pageSize + 1)

  if (error) return { trainers: [], nextCursor: null, error: 'No se pudo cargar el directorio.' }

  const rows = (data ?? []).map(toPublicTrainerDirectoryRow)
  const hasNextPage = rows.length > pageSize
  const trainers = hasNextPage ? rows.slice(0, pageSize) : rows
  const finalRow = trainers.at(-1)

  return {
    trainers,
    nextCursor: hasNextPage && finalRow
      ? encodeDirectoryCursor({ professionalName: finalRow.professionalName, userId: finalRow.userId })
      : null,
    error: null,
  }
}

export async function getActiveTrainerBySlug(slug: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('active_trainer_directory')
    .select('user_id, slug, professional_name, professional_photo_url, bio, specialties, modalities, experience_summary, general_location, languages, verified_at, active_services')
    .eq('slug', slug)
    .maybeSingle()

  return error || !data ? null : toPublicTrainerDirectoryRow(data)
}

export async function getRequestableTrainerServicesBySlug(slug: string): Promise<RequestableTrainerService[]> {
  const supabase = await createClient()
  const { data, error } = await (supabase as any).rpc('get_requestable_trainer_services', { trainer_slug: slug })
  if (error || !Array.isArray(data)) return []

  return data.flatMap(service => (
    typeof service?.service_id === 'string'
    && typeof service.name === 'string'
    && typeof service.description === 'string'
    && typeof service.content === 'string'
    && typeof service.duration_minutes === 'number'
    && (service.modality === 'online' || service.modality === 'in_person' || service.modality === 'hybrid')
      ? [{ id: service.service_id, name: service.name, description: service.description, content: service.content, durationMinutes: service.duration_minutes, modality: service.modality }]
      : []
  ))
}

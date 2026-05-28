const WGER_BASE = 'https://wger.de/api/v2'

export const WGER_LANGUAGE = {
  en: 2,
  de: 1,
  es: 4,
} as const

export type WgerLanguageCode = keyof typeof WGER_LANGUAGE

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface WgerPage<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface WgerMuscle {
  id: number
  name: string
  name_en: string
  is_front: boolean
}

export interface WgerEquipment {
  id: number
  name: string
}

export interface WgerCategory {
  id: number
  name: string
}

export interface WgerTranslation {
  id: number
  exercise: number
  name: string
  description: string
  language: number
}

export interface WgerExerciseImage {
  id: number
  exercise_base: number
  image: string
  is_main: boolean
}

export interface WgerExerciseInfo {
  id: number
  category: WgerCategory
  muscles: WgerMuscle[]
  muscles_secondary: WgerMuscle[]
  equipment: WgerEquipment[]
  images: WgerExerciseImage[]
  translations: WgerTranslation[]
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function get<T>(path: string): Promise<T> {
  const url = path.startsWith('http') ? path : `${WGER_BASE}${path}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`wger ${res.status}: ${url}`)
  }
  return res.json() as Promise<T>
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchExercises(
  _language: WgerLanguageCode = 'en',
  limit = 100,
  offset = 0,
): Promise<WgerPage<WgerExerciseInfo>> {
  // exerciseinfo includes all translations; language filtering is done client-side
  return get(`/exerciseinfo/?format=json&limit=${limit}&offset=${offset}`)
}

export async function fetchExerciseById(id: number): Promise<WgerExerciseInfo> {
  return get(`/exerciseinfo/${id}/?format=json`)
}

export async function fetchMuscles(): Promise<WgerMuscle[]> {
  const page = await get<WgerPage<WgerMuscle>>('/muscle/?format=json&limit=100')
  return page.results
}

export async function fetchEquipment(): Promise<WgerEquipment[]> {
  const page = await get<WgerPage<WgerEquipment>>('/equipment/?format=json&limit=100')
  return page.results
}

export async function fetchCategories(): Promise<WgerCategory[]> {
  const page = await get<WgerPage<WgerCategory>>('/exercisecategory/?format=json&limit=100')
  return page.results
}

export async function fetchExerciseImages(exerciseId: number): Promise<WgerExerciseImage[]> {
  const page = await get<WgerPage<WgerExerciseImage>>(
    `/exerciseimage/?exercise_base=${exerciseId}&format=json&limit=100`,
  )
  return page.results
}

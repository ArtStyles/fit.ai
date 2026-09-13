import type { FitnessPlatform } from './platform-types'
import type { FitnessAccessAction, FitnessEvidence, FitnessTheme, FitnessSocialLinks } from './types'
import { parseFitnessCard as card, parseFitnessHub, parseFitnessInvite } from './validation'
import { normalizeFitnessSocialLinks } from './socials'

const BUCKET = 'fitness-card-photos'
const invalid = () => new Error('No se pudo verificar esta Fitness Card. Vuelve a intentarlo.')
export function fitnessError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  if (/FITNESS_CARD_NEEDS_SYNC/.test(message)) return 'Hay cambios de otro dispositivo. Sincroniza tu cuenta antes de actualizar la tarjeta.'
  if (/FITNESS_CARD_CONFLICT/.test(message)) return 'La tarjeta cambió en otro dispositivo. Actualízala y vuelve a guardar.'
  if (/FITNESS_CARD_HANDLE_UNAVAILABLE/.test(message)) return 'No encontramos ese @. Comprueba el nombre o configúralo en tu perfil.'
  if (/FITNESS_CARD_(NOT_ALLOWED|AUTH_REQUIRED|NOT_FOUND)/.test(message)) return 'Esta tarjeta ya no está disponible para tu cuenta.'
  if (/FITNESS_CARD_INVALID/.test(message)) return 'Revisa los datos de la tarjeta e inténtalo de nuevo.'
  if (/fitness_card|PGRST202|42P01|schema cache/.test(message)) return 'Fitness Card necesita activar su actualización en el servidor.'
  return message || 'No se pudo completar la operación. Vuelve a intentarlo.'
}

const pendingWrites = new Set<string>()
async function timed<T>(operation: (assertFresh: () => void) => Promise<T>): Promise<T> {
  let expired = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = () => new Error('La conexión tardó demasiado. Actualiza para comprobar el resultado.')
  const assertFresh = () => { if (expired) throw timeout() }
  try {
    return await Promise.race([operation(assertFresh), new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; reject(timeout()) }, 10000) })])
  } finally { clearTimeout(timer) }
}

export function createFitnessClient(platform: FitnessPlatform) {
  async function bound<T>(operation: (client: Awaited<ReturnType<FitnessPlatform['getClient']>>) => Promise<T>, mutation = false) {
    const owner = platform.identity.userId
    if (mutation && pendingWrites.has(owner)) throw new Error('Hay una operación pendiente. Espera y actualiza antes de volver a guardar.')
    if (mutation) pendingWrites.add(owner)
    return timed(async assertFresh => {
      try {
        await platform.assertCurrent(); assertFresh()
        const client = await platform.getClient(); assertFresh()
        await platform.assertCurrent(); assertFresh()
        const result = await operation(client)
        await platform.assertCurrent(); assertFresh()
        return result
      } finally { if (mutation) pendingWrites.delete(owner) }
    })
  }
  async function request(name: string, args: Record<string, unknown> = {}) {
    return bound(async client => {
      const { data, error } = await client.rpc(name, args)
      if (error) throw new Error(error.message)
      return data as unknown
    }, !name.startsWith('get_'))
  }
  const hub = (value: unknown) => parseFitnessHub(value, platform.identity.userId)
  const own = (value: unknown) => { const result = card(value); if (result.owner.userId !== platform.identity.userId) throw invalid(); return result }
  async function storage<T>(operation: (bucket: Awaited<ReturnType<FitnessPlatform['getClient']>>['storage']) => Promise<T>, mutation = false) {
    return bound(client => operation(client.storage), mutation)
  }
  const slotPath = (slot: 1 | 2 | 3) => { if (![1, 2, 3].includes(slot)) throw invalid(); return `${platform.identity.userId}/${slot}.webp` }
  return {
    hub: async () => hub(await request('get_fitness_card_state')),
    read: async (ownerId: string) => { const result = card(await request('get_fitness_card', { p_owner_id: ownerId })); if (result.owner.userId !== ownerId) throw invalid(); return result },
    save: async (artisticName: string, theme: FitnessTheme, revision: number, socialLinks?: FitnessSocialLinks) => own(await request(socialLinks === undefined ? 'save_fitness_card' : 'save_fitness_card_v2', { p_artistic_name: artisticName, p_theme: theme, p_expected_revision: revision, ...(socialLinks === undefined ? {} : { p_social_links: normalizeFitnessSocialLinks(socialLinks) }) })),
    invite: async (ownerId: string) => parseFitnessInvite(await request('get_fitness_card_invite', { p_owner_id: ownerId }), ownerId),
    requestById: async (ownerId: string) => hub(await request('request_fitness_card_by_id', { p_owner_id: ownerId })),
    publish: async (evidence: FitnessEvidence, revision: number) => own(await request('publish_fitness_card_evidence', { p_evidence: evidence, p_expected_revision: revision })),
    access: async (action: FitnessAccessAction, handle?: string, requestId?: string) => hub(await request('fitness_card_access', { p_action: action, p_handle: handle?.trim().replace(/^@/, '') ?? null, p_request_id: requestId ?? null })),
    upload: async (slot: 1 | 2 | 3, file: Blob) => storage(async bucket => {
      if (file.type !== 'image/webp' || file.size > 2 * 1024 * 1024) throw new Error('La foto debe ocupar menos de 2 MB.')
      const { error } = await bucket.from(BUCKET).upload(slotPath(slot), file, { upsert: true, contentType: 'image/webp', cacheControl: '0' })
      if (error) throw new Error(error.message)
    }, true),
    remove: async (slot: 1 | 2 | 3) => storage(async bucket => { const { error } = await bucket.from(BUCKET).remove([slotPath(slot)]); if (error) throw new Error(error.message) }, true),
    photo: async (path: string) => storage(async bucket => {
      if (!/^[0-9a-f-]{36}\/[123]\.webp$/i.test(path)) throw invalid()
      const { data, error } = await bucket.from(BUCKET).download(path)
      if (error || !data) throw new Error(error?.message || 'No se pudo abrir la foto.')
      return data
    }),
  }
}

/** A refresh must renew authority; a hanging request never keeps a private card visible. */
export function createPrivateCardLease<T>(changed: (value: T | null) => void, duration = 15000) {
  let epoch = 0, disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const invalidate = () => { epoch++; clearTimeout(timer); changed(null) }
  return {
    beginRead: () => ++epoch,
    commit: (token: number, value: T) => {
      if (disposed || token !== epoch) return false
      clearTimeout(timer); changed(value)
      timer = setTimeout(invalidate, duration)
      return true
    },
    invalidate,
    dispose: () => { disposed = true; invalidate() },
  }
}

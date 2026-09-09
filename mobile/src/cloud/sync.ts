import type { MobileAccount, MobileData, MobileRepository, OutboxOperation } from '../domain/types'
import type { CoachingOverview, MobileCloud, TrainerCard } from './types'

export interface CloudGateway {
  currentUser(): Promise<string>
  signIn(email: string, password: string): Promise<MobileAccount>
  signOut(): Promise<void>
  upload(operation: OutboxOperation): Promise<void>
  download(accountId: string): Promise<MobileData & { account: MobileAccount | null }>
  listTrainers(): Promise<TrainerCard[]>
  requestTrainer(serviceId: string, message: string): Promise<void>
  listCoaching(): Promise<CoachingOverview>
  dispose(): void
}

/** One queue includes auth transitions: a sign-out cannot race an in-flight account write. */
export function createCloudWithGateway(repository: MobileRepository, gateway: CloudGateway | null): MobileCloud {
  let queue: Promise<unknown> = Promise.resolve()
  let disposed = false
  const serial = <T>(work: () => Promise<T>, requireGateway = true): Promise<T> => {
    const task = queue.then(() => {
      if (disposed) throw new Error('La conexión móvil está cerrada.')
      if (!gateway && requireGateway) throw new Error('Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para conectar tu cuenta.')
      return work()
    })
    queue = task.catch(() => undefined)
    return task
  }
  async function owner(accountId: string) {
    const account = (await repository.listAccounts()).find(a => a.id === accountId)
    if (!account?.remoteUserId || account.remoteUserId !== await gateway!.currentUser()
      || account.id !== account.remoteUserId || await repository.getActiveAccountId() !== accountId) {
      throw new Error('La cuenta conectada no coincide con el perfil activo. Vuelve a conectar esa cuenta.')
    }
    return account
  }
  async function activeOwner() {
    const id = await repository.getActiveAccountId()
    if (!id) throw new Error('Selecciona una cuenta conectada.')
    return owner(id)
  }
  async function pull(accountId: string) {
    await owner(accountId)
    const remote = await gateway!.download(accountId)
    await owner(accountId)
    const pending = new Set((await repository.pending(accountId)).map(o => `${o.kind}:${o.entityId}`))
    const local = await repository.loadData(accountId)
    let downloaded = 0
    if (remote.account && !pending.has(`profile:${accountId}`)) {
      const current = (await repository.listAccounts()).find(a => a.id === accountId)
      if (!current || remote.account.updatedAt > current.updatedAt) await repository.saveAccount(remote.account, false)
    }
    for (const plan of remote.plans) {
      if (plan.accountId !== accountId || pending.has(`plan:${plan.id}`)) continue
      const existing = local.plans.find(p => p.id === plan.id)
      // Trainer plan versions are immutable. A revised assignment has a new server plan ID.
      if (existing && (existing.source === 'trainer' || existing.updatedAt >= plan.updatedAt)) continue
      await repository.savePlan(plan, false); downloaded++
    }
    for (const session of remote.sessions) {
      if (session.accountId !== accountId || pending.has(`session:${session.id}`)) continue
      if (local.sessions.some(s => s.id === session.id || (s.remoteId && s.remoteId === session.remoteId))) continue
      await repository.saveSession(session, false); downloaded++
    }
    for (const measurement of remote.measurements) {
      if (measurement.accountId !== accountId || pending.has(`measurement:${measurement.id}`)) continue
      if (local.measurements.some(m => m.id === measurement.id && m.updatedAt >= measurement.updatedAt)) continue
      await repository.saveMeasurement(measurement, false); downloaded++
    }
    if (!local.activePlanId && remote.activePlanId && remote.plans.some(p => p.id === remote.activePlanId)) {
      await repository.setActivePlan(accountId, remote.activePlanId)
    }
    return downloaded
  }
  return {
    configured: Boolean(gateway),
    signIn: (email, password) => serial(async () => {
      const remote = await gateway!.signIn(email.trim(), password)
      if (remote.id !== remote.remoteUserId) throw new Error('Identidad remota inválida.')
      const existing = (await repository.listAccounts()).find(a => a.remoteUserId === remote.remoteUserId)
      const account = existing ?? remote
      await repository.saveAccount(account, false)
      await repository.setActiveAccountId(account.id)
      return account
    }),
    signOut: () => serial(async () => {
      // Disconnect internet credentials; keep the deliberately selected offline profile usable.
      await gateway?.signOut()
    }, false),
    sync: accountId => serial(async () => {
      await owner(accountId)
      let uploaded = 0
      let uploadError: unknown = null
      for (const operation of await repository.pending(accountId)) {
        try {
          await owner(accountId)
          const payload = operation.payload as { id?: string; accountId?: string; remoteUserId?: string }
          if (operation.accountId !== accountId || !payload || payload.id !== operation.entityId
            || (operation.kind === 'profile' ? payload.id !== accountId || payload.remoteUserId !== accountId : payload.accountId !== accountId)) {
            throw new Error('El propietario de la operación pendiente no es válido.')
          }
          await gateway!.upload(operation)
          await owner(accountId)
          await repository.acknowledge(accountId, operation.id)
          uploaded++
        } catch (error) {
          await repository.recordFailure(accountId, operation.id, error instanceof Error ? error.message : 'No se pudo sincronizar.')
          uploadError = error
          break
        }
      }
      let downloaded = 0
      try { downloaded = await pull(accountId) } catch (error) { throw uploadError ?? error }
      if (uploadError) throw uploadError
      return { uploaded, downloaded, pending: (await repository.pending(accountId)).length }
    }),
    listTrainers: () => serial(() => gateway!.listTrainers()),
    requestTrainer: (serviceId, message) => serial(async () => { await activeOwner(); await gateway!.requestTrainer(serviceId, message) }),
    listCoaching: () => serial(async () => { await activeOwner(); return gateway!.listCoaching() }),
    dispose: () => { disposed = true; gateway?.dispose() },
  }
}

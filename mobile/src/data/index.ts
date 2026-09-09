import { Capacitor } from '@capacitor/core'

import type { MobileRepository } from '../domain/types'
import { openBrowserSqliteDriver } from './browser-driver'
import type { MobileSqliteDriver } from './driver'
import { openNativeSqliteDriver } from './native-driver'
import { createMobileRepository } from './repository'

export type { MobileSqliteDriver, SqliteParameters, SqliteRow, SqliteValue } from './driver'
export { createMobileRepository } from './repository'

let repositoryPromise: Promise<MobileRepository> | null = null

export async function openMobileRepository(): Promise<MobileRepository> {
  repositoryPromise ??= openRepository()
  try {
    return await repositoryPromise
  } catch (error) {
    repositoryPromise = null
    throw error
  }
}

async function openRepository(): Promise<MobileRepository> {
  const driver: MobileSqliteDriver = Capacitor.isNativePlatform()
    ? await openNativeSqliteDriver()
    : await openBrowserSqliteDriver()
  return createMobileRepository(driver)
}

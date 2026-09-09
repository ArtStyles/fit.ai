import type {
  MobileAccount,
  MobileData,
  MobileMeasurement,
  MobilePlan,
  MobileRepository,
  MobileSession,
  OutboxOperation,
} from '../domain/types'
import type { MobileSqliteDriver, SqliteRow } from './driver'

const DATABASE_SCHEMA_VERSION = 2
const BACKUP_VERSION = 1
const BACKUP_FORMAT = 'vekira-mobile-backup'

type EntityKind = OutboxOperation['kind']

type StoredAccountRow = SqliteRow & {
  id: string
  remote_user_id: string | null
  payload_json: string
  created_at: string
  updated_at: string
}

type StoredEntityRow = SqliteRow & {
  id: string
  payload_json: string
}

type StoredOutboxRow = SqliteRow & {
  id: string
  account_id: string
  kind: EntityKind
  entity_id: string
  payload_json: string
  created_at: string
  attempts: number
  error: string | null
}

type ValidBackup = {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: string
  account: MobileAccount
  data: MobileData
  outbox: OutboxOperation[]
}

const schema = `
  CREATE TABLE IF NOT EXISTS mobile_accounts (
    id TEXT PRIMARY KEY NOT NULL,
    remote_user_id TEXT,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS mobile_accounts_remote_user_id
    ON mobile_accounts(remote_user_id) WHERE remote_user_id IS NOT NULL;
  CREATE TABLE IF NOT EXISTS mobile_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS mobile_plans (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES mobile_accounts(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS mobile_plans_account ON mobile_plans(account_id, updated_at, id);
  CREATE TABLE IF NOT EXISTS mobile_active_plans (
    account_id TEXT PRIMARY KEY NOT NULL,
    plan_id TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES mobile_accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES mobile_plans(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS mobile_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    FOREIGN KEY (account_id) REFERENCES mobile_accounts(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS mobile_sessions_account ON mobile_sessions(account_id, started_at, id);
  CREATE TABLE IF NOT EXISTS mobile_measurements (
    id TEXT PRIMARY KEY NOT NULL,
    account_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    date TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (account_id) REFERENCES mobile_accounts(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS mobile_measurements_account ON mobile_measurements(account_id, date, id);
  CREATE TABLE IF NOT EXISTS mobile_outbox (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT UNIQUE NOT NULL,
    account_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('plan', 'session', 'measurement', 'profile')),
    entity_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    error TEXT,
    FOREIGN KEY (account_id) REFERENCES mobile_accounts(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS mobile_outbox_account ON mobile_outbox(account_id, sequence);
  PRAGMA user_version = 2;
`

const migrateOutboxSequence = `
  DROP INDEX IF EXISTS mobile_outbox_account;
  CREATE TABLE mobile_outbox_next (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT UNIQUE NOT NULL,
    account_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('plan', 'session', 'measurement', 'profile')),
    entity_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    error TEXT,
    FOREIGN KEY (account_id) REFERENCES mobile_accounts(id) ON DELETE CASCADE
  );
  INSERT INTO mobile_outbox_next
    (id, account_id, kind, entity_id, payload_json, created_at, attempts, error)
  SELECT id, account_id, kind, entity_id, payload_json, created_at, attempts, error
  FROM mobile_outbox ORDER BY created_at, rowid;
  DROP TABLE mobile_outbox;
  ALTER TABLE mobile_outbox_next RENAME TO mobile_outbox;
  CREATE INDEX mobile_outbox_account ON mobile_outbox(account_id, sequence);
  PRAGMA user_version = 2;
`

class SerializedQueue {
  private tail: Promise<void> = Promise.resolve()

  run<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work)
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}

export async function createMobileRepository(
  driver: MobileSqliteDriver,
): Promise<MobileRepository> {
  const queue = new SerializedQueue()

  await queue.run(async () => {
    const rows = await driver.query<{ user_version: number }>('PRAGMA user_version')
    const version = Number(rows[0]?.user_version ?? 0)
    if (version > DATABASE_SCHEMA_VERSION) {
      throw new Error(
        `Mobile database schema ${version} is newer than supported version ${DATABASE_SCHEMA_VERSION}`,
      )
    }
    if (version === 0) {
      await driver.transaction(async () => {
        await driver.execute(schema)
      })
    } else if (version === 1) {
      await driver.transaction(async () => {
        await driver.execute(migrateOutboxSequence)
      })
    }
  })

  const requireAccount = async (accountId: string): Promise<void> => {
    const rows = await driver.query('SELECT id FROM mobile_accounts WHERE id = ?', [accountId])
    if (rows.length === 0) throw new Error(`Unknown mobile account: ${accountId}`)
  }

  const enqueue = async (
    accountId: string,
    kind: EntityKind,
    entityId: string,
    payloadJson: string,
  ): Promise<void> => {
    await driver.execute(
      `INSERT INTO mobile_outbox
        (id, account_id, kind, entity_id, payload_json, created_at, attempts, error)
       VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
      [uuid(), accountId, kind, entityId, payloadJson, new Date().toISOString()],
    )
  }

  const repository: MobileRepository = {
    listAccounts: () => queue.run(async () => {
      const rows = await driver.query<StoredAccountRow>(
        'SELECT id, remote_user_id, payload_json, created_at, updated_at FROM mobile_accounts ORDER BY created_at, id',
      )
      return rows.map((row) => parseStored<MobileAccount>(row.payload_json, 'account'))
    }),

    saveAccount: (account, shouldEnqueue = true) => queue.run(async () => {
      const validated = validateAccount(account, 'account')
      const payloadJson = stringify(validated)
      await driver.transaction(async () => {
        const existing = await driver.query<StoredAccountRow>(
          'SELECT id, remote_user_id, payload_json, created_at, updated_at FROM mobile_accounts WHERE id = ?',
          [validated.id],
        )
        if (existing[0]?.remote_user_id && existing[0].remote_user_id !== validated.remoteUserId) {
          throw new Error('Cannot replace a linked identity')
        }
        if (validated.remoteUserId) {
          const collision = await driver.query<{ id: string }>(
            'SELECT id FROM mobile_accounts WHERE remote_user_id = ? AND id <> ?',
            [validated.remoteUserId, validated.id],
          )
          if (collision.length > 0) throw new Error('Cannot overwrite another linked identity')
        }
        if (!shouldEnqueue && existing[0]) {
          const hasPending = await hasPendingEntity(driver, validated.id, 'profile', validated.id)
          if (hasPending || Date.parse(existing[0].updated_at) > Date.parse(validated.updatedAt)) return
        }
        await upsertAccount(driver, validated, payloadJson)
        if (shouldEnqueue) await enqueue(validated.id, 'profile', validated.id, payloadJson)
      })
    }),

    getActiveAccountId: () => queue.run(async () => {
      const rows = await driver.query<{ value: string | null }>(
        "SELECT value FROM mobile_settings WHERE key = 'active_account_id'",
      )
      return rows[0]?.value ?? null
    }),

    setActiveAccountId: (id) => queue.run(async () => {
      await driver.transaction(async () => {
        if (id !== null) await requireAccount(id)
        await driver.execute(
          `INSERT INTO mobile_settings (key, value) VALUES ('active_account_id', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [id],
        )
      })
    }),

    loadData: (accountId) => queue.run(async () => {
      await requireAccount(accountId)
      return loadData(driver, accountId)
    }),

    savePlan: (plan, shouldEnqueue = true) => queue.run(async () => {
      const validated = validatePlan(plan, 'plan')
      const payloadJson = stringify(validated)
      await driver.transaction(async () => {
        await requireAccount(validated.accountId)
        const existing = await driver.query<StoredEntityRow & { account_id: string; updated_at: string }>(
          'SELECT id, account_id, payload_json, updated_at FROM mobile_plans WHERE id = ?',
          [validated.id],
        )
        assertEntityOwnership(existing[0]?.account_id, validated.accountId, 'plan')
        if (!shouldEnqueue && existing[0]) {
          const hasPending = await hasPendingEntity(
            driver,
            validated.accountId,
            'plan',
            validated.id,
          )
          if (hasPending || Date.parse(existing[0].updated_at) >= Date.parse(validated.updatedAt)) return
        }
        await driver.execute(
          `INSERT INTO mobile_plans (id, account_id, payload_json, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             account_id = excluded.account_id,
             payload_json = excluded.payload_json,
             updated_at = excluded.updated_at`,
          [validated.id, validated.accountId, payloadJson, validated.updatedAt],
        )
        if (shouldEnqueue) await enqueue(validated.accountId, 'plan', validated.id, payloadJson)
      })
    }),

    setActivePlan: (accountId, planId) => queue.run(async () => {
      await driver.transaction(async () => {
        await requireAccount(accountId)
        const plans = await driver.query(
          'SELECT id FROM mobile_plans WHERE id = ? AND account_id = ?',
          [planId, accountId],
        )
        if (plans.length === 0) throw new Error('Active plan does not belong to the account')
        await driver.execute(
          `INSERT INTO mobile_active_plans (account_id, plan_id) VALUES (?, ?)
           ON CONFLICT(account_id) DO UPDATE SET plan_id = excluded.plan_id`,
          [accountId, planId],
        )
      })
    }),

    saveSession: (session, shouldEnqueue = true) => queue.run(async () => {
      const validated = validateSession(session, 'session')
      const payloadJson = stringify(validated)
      await driver.transaction(async () => {
        await requireAccount(validated.accountId)
        const existing = await driver.query<StoredEntityRow & {
          account_id: string
          finished_at: string | null
        }>(
          'SELECT id, account_id, payload_json, finished_at FROM mobile_sessions WHERE id = ?',
          [validated.id],
        )
        assertEntityOwnership(existing[0]?.account_id, validated.accountId, 'session')
        if (existing[0] && existing[0].finished_at !== null && validated.finishedAt === null) return
        if (!shouldEnqueue && existing[0]) {
          const hasPending = await hasPendingEntity(
            driver,
            validated.accountId,
            'session',
            validated.id,
          )
          if (hasPending) return
        }
        await driver.execute(
          `INSERT INTO mobile_sessions
            (id, account_id, payload_json, started_at, finished_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             account_id = excluded.account_id,
             payload_json = excluded.payload_json,
             started_at = excluded.started_at,
             finished_at = excluded.finished_at`,
          [validated.id, validated.accountId, payloadJson, validated.startedAt, validated.finishedAt],
        )
        if (shouldEnqueue) await enqueue(validated.accountId, 'session', validated.id, payloadJson)
      })
    }),

    saveMeasurement: (measurement, shouldEnqueue = true) => queue.run(async () => {
      const validated = validateMeasurement(measurement, 'measurement')
      const payloadJson = stringify(validated)
      await driver.transaction(async () => {
        await requireAccount(validated.accountId)
        const existing = await driver.query<StoredEntityRow & { account_id: string; updated_at: string }>(
          'SELECT id, account_id, payload_json, updated_at FROM mobile_measurements WHERE id = ?',
          [validated.id],
        )
        assertEntityOwnership(existing[0]?.account_id, validated.accountId, 'measurement')
        if (!shouldEnqueue && existing[0]) {
          const hasPending = await hasPendingEntity(
            driver,
            validated.accountId,
            'measurement',
            validated.id,
          )
          if (hasPending || Date.parse(existing[0].updated_at) >= Date.parse(validated.updatedAt)) return
        }
        await driver.execute(
          `INSERT INTO mobile_measurements
            (id, account_id, payload_json, date, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             account_id = excluded.account_id,
             payload_json = excluded.payload_json,
             date = excluded.date,
             updated_at = excluded.updated_at,
             deleted_at = excluded.deleted_at`,
          [
            validated.id,
            validated.accountId,
            payloadJson,
            validated.date,
            validated.updatedAt,
            validated.deletedAt,
          ],
        )
        if (shouldEnqueue) {
          await enqueue(validated.accountId, 'measurement', validated.id, payloadJson)
        }
      })
    }),

    pending: (accountId) => queue.run(async () => {
      await requireAccount(accountId)
      return pending(driver, accountId)
    }),

    acknowledge: (accountId, operationId) => queue.run(async () => {
      await driver.transaction(async () => {
        await requireAccount(accountId)
        await driver.execute(
          'DELETE FROM mobile_outbox WHERE id = ? AND account_id = ?',
          [operationId, accountId],
        )
      })
    }),

    recordFailure: (accountId, operationId, message) => queue.run(async () => {
      await driver.transaction(async () => {
        await requireAccount(accountId)
        await driver.execute(
          `UPDATE mobile_outbox
           SET attempts = attempts + 1, error = ?
           WHERE id = ? AND account_id = ?`,
          [message, operationId, accountId],
        )
      })
    }),

    exportBackup: (accountId) => queue.run(async () => {
      const accounts = await driver.query<StoredAccountRow>(
        `SELECT id, remote_user_id, payload_json, created_at, updated_at
         FROM mobile_accounts WHERE id = ?`,
        [accountId],
      )
      if (accounts.length === 0) throw new Error(`Unknown mobile account: ${accountId}`)
      const backup: ValidBackup = {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        account: parseStored(accounts[0].payload_json, 'account'),
        data: await loadData(driver, accountId),
        outbox: await pending(driver, accountId),
      }
      return stringify(backup)
    }),

    importBackup: (json, targetAccountId) => queue.run(async () => {
      const backup = validateBackup(json)
      const mapped = await mapBackup(backup, targetAccountId)

      return driver.transaction(async () => {
        await assertImportIdentitySafe(driver, backup.account.id, mapped.account)
        const isRemapped = backup.account.id !== mapped.account.id
        const existingAccountRows = await driver.query<StoredAccountRow>(
          `SELECT id, remote_user_id, payload_json, created_at, updated_at
           FROM mobile_accounts WHERE id = ?`,
          [mapped.account.id],
        )
        const existingAccount = existingAccountRows[0]
          ? parseStored<MobileAccount>(existingAccountRows[0].payload_json, 'account')
          : null
        const accountToStore = existingAccount
          ? isRemapped
            ? existingAccount
            : mergeTimestamped(
                existingAccount,
                mapped.account,
                (value) => value.updatedAt,
                'account',
              )
          : mapped.account
        const outboxToMerge = isRemapped && existingAccount
          ? mapped.outbox.map((operation) => operation.kind === 'profile'
              ? { ...operation, payload: accountToStore }
              : operation)
          : mapped.outbox
        await upsertAccount(driver, accountToStore, stringify(accountToStore))

        await mergePlans(driver, mapped.account.id, mapped.data.plans)
        await mergeSessions(driver, mapped.account.id, mapped.data.sessions, outboxToMerge)
        await mergeMeasurements(driver, mapped.account.id, mapped.data.measurements)
        await assertOutboxReplaySafe(driver, mapped.account.id, outboxToMerge)
        await mergeOutbox(driver, mapped.account.id, outboxToMerge)

        const localActive = await driver.query<{ plan_id: string }>(
          'SELECT plan_id FROM mobile_active_plans WHERE account_id = ?',
          [mapped.account.id],
        )
        if (localActive.length === 0 && mapped.data.activePlanId) {
          const importedActive = await driver.query(
            'SELECT id FROM mobile_plans WHERE id = ? AND account_id = ?',
            [mapped.data.activePlanId, mapped.account.id],
          )
          if (importedActive.length > 0) {
            await driver.execute(
              'INSERT INTO mobile_active_plans (account_id, plan_id) VALUES (?, ?)',
              [mapped.account.id, mapped.data.activePlanId],
            )
          }
        }
        return accountToStore
      })
    }),
  }

  return repository
}

async function loadData(driver: MobileSqliteDriver, accountId: string): Promise<MobileData> {
  const [plans, sessions, measurements, active] = await Promise.all([
    driver.query<StoredEntityRow>(
      'SELECT id, payload_json FROM mobile_plans WHERE account_id = ? ORDER BY updated_at, id',
      [accountId],
    ),
    driver.query<StoredEntityRow>(
      'SELECT id, payload_json FROM mobile_sessions WHERE account_id = ? ORDER BY started_at, id',
      [accountId],
    ),
    driver.query<StoredEntityRow>(
      'SELECT id, payload_json FROM mobile_measurements WHERE account_id = ? ORDER BY date, id',
      [accountId],
    ),
    driver.query<{ plan_id: string }>(
      'SELECT plan_id FROM mobile_active_plans WHERE account_id = ?',
      [accountId],
    ),
  ])
  return {
    plans: plans.map((row) => parseStored(row.payload_json, 'plan')),
    sessions: sessions.map((row) => parseStored(row.payload_json, 'session')),
    measurements: measurements.map((row) => parseStored(row.payload_json, 'measurement')),
    activePlanId: active[0]?.plan_id ?? null,
  }
}

async function pending(
  driver: MobileSqliteDriver,
  accountId: string,
): Promise<OutboxOperation[]> {
  const rows = await driver.query<StoredOutboxRow>(
    `SELECT id, account_id, kind, entity_id, payload_json, created_at, attempts, error
     FROM mobile_outbox WHERE account_id = ? ORDER BY sequence`,
    [accountId],
  )
  return rows.map((row) => ({
    id: row.id,
    accountId: row.account_id,
    kind: row.kind,
    entityId: row.entity_id,
    payload: JSON.parse(row.payload_json) as unknown,
    createdAt: row.created_at,
    attempts: Number(row.attempts),
    error: row.error,
  }))
}

async function upsertAccount(
  driver: MobileSqliteDriver,
  account: MobileAccount,
  payloadJson: string,
): Promise<void> {
  await driver.execute(
    `INSERT INTO mobile_accounts
      (id, remote_user_id, payload_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       remote_user_id = excluded.remote_user_id,
       payload_json = excluded.payload_json,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at`,
    [account.id, account.remoteUserId, payloadJson, account.createdAt, account.updatedAt],
  )
}

async function hasPendingEntity(
  driver: MobileSqliteDriver,
  accountId: string,
  kind: EntityKind,
  entityId: string,
): Promise<boolean> {
  const rows = await driver.query(
    `SELECT id FROM mobile_outbox
     WHERE account_id = ? AND kind = ? AND entity_id = ? LIMIT 1`,
    [accountId, kind, entityId],
  )
  return rows.length > 0
}

function assertEntityOwnership(
  existingAccountId: string | undefined,
  requestedAccountId: string,
  kind: string,
): void {
  if (existingAccountId !== undefined && existingAccountId !== requestedAccountId) {
    throw new Error(`Cannot move a mobile ${kind} between accounts`)
  }
}

async function assertImportIdentitySafe(
  driver: MobileSqliteDriver,
  sourceAccountId: string,
  account: MobileAccount,
): Promise<void> {
  if (account.remoteUserId) {
    const collision = await driver.query<{ id: string }>(
      'SELECT id FROM mobile_accounts WHERE remote_user_id = ? AND id <> ?',
      [account.remoteUserId, account.id],
    )
    if (collision.length > 0) throw new Error('Backup linked identity belongs to another account')
  }
  const existing = await driver.query<StoredAccountRow>(
    'SELECT id, remote_user_id, payload_json, created_at, updated_at FROM mobile_accounts WHERE id = ?',
    [account.id],
  )
  if (
    existing.length > 0 &&
    existing[0].remote_user_id !== null &&
    existing[0].remote_user_id !== account.remoteUserId &&
    !(sourceAccountId !== account.id && account.remoteUserId === null)
  ) {
    throw new Error('Backup cannot overwrite a different linked identity')
  }
  if (sourceAccountId !== account.id && account.remoteUserId !== null) {
    throw new Error('Only an unlinked local backup can be remapped')
  }
}

async function mergePlans(
  driver: MobileSqliteDriver,
  accountId: string,
  incoming: MobilePlan[],
): Promise<void> {
  for (const plan of incoming) {
    const rows = await driver.query<StoredEntityRow & { updated_at: string }>(
      'SELECT id, payload_json, updated_at FROM mobile_plans WHERE id = ?',
      [plan.id],
    )
    if (rows[0]) {
      const local = parseStored<MobilePlan>(rows[0].payload_json, 'plan')
      if (local.accountId !== accountId) throw new Error('Backup plan ID collides with another account')
      const merged = mergeTimestamped(local, plan, (value) => value.updatedAt, `plan ${plan.id}`)
      if (merged === local) continue
    }
    await driver.execute(
      `INSERT INTO mobile_plans (id, account_id, payload_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`,
      [plan.id, accountId, stringify(plan), plan.updatedAt],
    )
  }
}

async function mergeSessions(
  driver: MobileSqliteDriver,
  accountId: string,
  incoming: MobileSession[],
  incomingOutbox: OutboxOperation[],
): Promise<void> {
  const pendingSessionIds = new Set(
    incomingOutbox.filter((operation) => operation.kind === 'session').map((operation) => operation.entityId),
  )
  for (const session of incoming) {
    const rows = await driver.query<StoredEntityRow>(
      'SELECT id, payload_json FROM mobile_sessions WHERE id = ?',
      [session.id],
    )
    let value = session
    if (rows[0]) {
      const local = parseStored<MobileSession>(rows[0].payload_json, 'session')
      if (local.accountId !== accountId) throw new Error('Backup session ID collides with another account')
      if (stringify(local) === stringify(session)) continue
      if (local.finishedAt && session.finishedAt) {
        throw new Error(`Backup completed session conflict for ${session.id}`)
      }
      const localPending = await driver.query(
        `SELECT id FROM mobile_outbox
         WHERE account_id = ? AND kind = 'session' AND entity_id = ? LIMIT 1`,
        [accountId, session.id],
      )
      if (localPending.length > 0) continue
      if (!local.finishedAt && session.finishedAt) value = session
      else if (local.finishedAt && !session.finishedAt) continue
      else if (pendingSessionIds.has(session.id)) value = session
      else throw new Error(`Backup session ${session.id} conflicts with local data`)
    }
    await driver.execute(
      `INSERT INTO mobile_sessions (id, account_id, payload_json, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         payload_json = excluded.payload_json,
         started_at = excluded.started_at,
         finished_at = excluded.finished_at`,
      [value.id, accountId, stringify(value), value.startedAt, value.finishedAt],
    )
  }
}

async function mergeMeasurements(
  driver: MobileSqliteDriver,
  accountId: string,
  incoming: MobileMeasurement[],
): Promise<void> {
  for (const measurement of incoming) {
    const rows = await driver.query<StoredEntityRow>(
      'SELECT id, payload_json FROM mobile_measurements WHERE id = ?',
      [measurement.id],
    )
    if (rows[0]) {
      const local = parseStored<MobileMeasurement>(rows[0].payload_json, 'measurement')
      if (local.accountId !== accountId) throw new Error('Backup measurement ID collides with another account')
      const merged = mergeTimestamped(
        local,
        measurement,
        (value) => value.updatedAt,
        `measurement ${measurement.id}`,
      )
      if (merged === local) continue
    }
    await driver.execute(
      `INSERT INTO mobile_measurements
        (id, account_id, payload_json, date, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         payload_json = excluded.payload_json,
         date = excluded.date,
         updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at`,
      [
        measurement.id,
        accountId,
        stringify(measurement),
        measurement.date,
        measurement.updatedAt,
        measurement.deletedAt,
      ],
    )
  }
}

async function mergeOutbox(
  driver: MobileSqliteDriver,
  accountId: string,
  incoming: OutboxOperation[],
): Promise<void> {
  for (const operation of incoming) {
    const rows = await driver.query<StoredOutboxRow>(
      `SELECT id, account_id, kind, entity_id, payload_json, created_at, attempts, error
       FROM mobile_outbox WHERE id = ?`,
      [operation.id],
    )
    if (rows[0]) {
      const local = rows[0]
      const normalizedLocal: OutboxOperation = {
        id: local.id,
        accountId: local.account_id,
        kind: local.kind,
        entityId: local.entity_id,
        payload: JSON.parse(local.payload_json) as unknown,
        createdAt: local.created_at,
        attempts: Number(local.attempts),
        error: local.error,
      }
      if (!sameImmutableOperation(normalizedLocal, operation)) {
        throw new Error(`Backup outbox operation ${operation.id} conflicts with local data`)
      }
      continue
    }
    await driver.execute(
      `INSERT INTO mobile_outbox
        (id, account_id, kind, entity_id, payload_json, created_at, attempts, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        operation.id,
        accountId,
        operation.kind,
        operation.entityId,
        stringify(operation.payload),
        operation.createdAt,
        operation.attempts,
        operation.error,
      ],
    )
  }
}

function sameImmutableOperation(left: OutboxOperation, right: OutboxOperation): boolean {
  return left.id === right.id &&
    left.accountId === right.accountId &&
    left.kind === right.kind &&
    left.entityId === right.entityId &&
    left.createdAt === right.createdAt &&
    stringify(left.payload) === stringify(right.payload)
}

async function assertOutboxReplaySafe(
  driver: MobileSqliteDriver,
  accountId: string,
  incoming: OutboxOperation[],
): Promise<void> {
  const lastMissing = new Map<string, OutboxOperation>()
  for (const operation of incoming) {
    const existing = await driver.query('SELECT id FROM mobile_outbox WHERE id = ?', [operation.id])
    if (existing.length === 0) lastMissing.set(`${operation.kind}:${operation.entityId}`, operation)
  }

  for (const operation of lastMissing.values()) {
    const currentPayload = await currentEntityPayload(driver, accountId, operation)
    if (currentPayload === null || stringify(currentPayload) !== stringify(operation.payload)) {
      throw new Error(
        `Backup contains a stale outbox replay for ${operation.kind} ${operation.entityId}`,
      )
    }
  }
}

async function currentEntityPayload(
  driver: MobileSqliteDriver,
  accountId: string,
  operation: OutboxOperation,
): Promise<unknown | null> {
  const table = operation.kind === 'profile'
    ? 'mobile_accounts'
    : operation.kind === 'plan'
      ? 'mobile_plans'
      : operation.kind === 'session'
        ? 'mobile_sessions'
        : 'mobile_measurements'
  const idColumn = operation.kind === 'profile' ? 'id' : 'id'
  const rows = await driver.query<StoredEntityRow & { account_id?: string }>(
    `SELECT id, payload_json${operation.kind === 'profile' ? '' : ', account_id'}
     FROM ${table} WHERE ${idColumn} = ?`,
    [operation.entityId],
  )
  if (rows.length === 0) return null
  if (operation.kind !== 'profile' && rows[0].account_id !== accountId) return null
  return parseStored(rows[0].payload_json, `${operation.kind} outbox entity`)
}

function mergeTimestamped<T>(
  local: T,
  incoming: T,
  timestamp: (value: T) => string,
  label: string,
): T {
  const localTime = Date.parse(timestamp(local))
  const incomingTime = Date.parse(timestamp(incoming))
  if (incomingTime > localTime) return incoming
  if (incomingTime < localTime) return local
  if (stringify(local) !== stringify(incoming)) {
    throw new Error(`Backup ${label} has an ambiguous same-time conflict`)
  }
  return local
}

async function mapBackup(
  backup: ValidBackup,
  targetAccountId?: string,
): Promise<ValidBackup> {
  if (!targetAccountId || targetAccountId === backup.account.id) return backup
  if (backup.account.remoteUserId !== null) {
    throw new Error('Only an unlinked local backup can be remapped')
  }
  const mappedId = (kind: string, sourceId: string) => deterministicCopyId(
    backup.account.id,
    targetAccountId,
    kind,
    sourceId,
  )
  const account = { ...backup.account, id: targetAccountId }
  const mapPlan = async (plan: MobilePlan): Promise<MobilePlan> => ({
    ...plan,
    id: await mappedId('plan', plan.id),
    accountId: targetAccountId,
    workouts: await Promise.all(plan.workouts.map(async (workout) => ({
      ...workout,
      id: await mappedId('workout', workout.id),
      exercises: await Promise.all(workout.exercises.map(async (prescription) => ({
        ...prescription,
        id: await mappedId('prescription', prescription.id),
      }))),
    }))),
  })
  const mapSession = async (session: MobileSession): Promise<MobileSession> => ({
    ...session,
    id: await mappedId('session', session.id),
    accountId: targetAccountId,
    planId: await mappedId('plan', session.planId),
    workoutId: await mappedId('workout', session.workoutId),
    exercises: await Promise.all(session.exercises.map(async (exercise) => ({
      prescription: {
        ...exercise.prescription,
        id: await mappedId('prescription', exercise.prescription.id),
      },
      sets: await Promise.all(exercise.sets.map(async (set) => ({
        ...set,
        id: await mappedId('set', set.id),
      }))),
    }))),
  })
  const mapMeasurement = async (measurement: MobileMeasurement): Promise<MobileMeasurement> => ({
    ...measurement,
    id: await mappedId('measurement', measurement.id),
    accountId: targetAccountId,
  })
  const plans = await Promise.all(backup.data.plans.map(mapPlan))
  const sessions = await Promise.all(backup.data.sessions.map(mapSession))
  const measurements = await Promise.all(backup.data.measurements.map(mapMeasurement))
  const outbox = await Promise.all(backup.outbox.map(async (operation): Promise<OutboxOperation> => {
    const entityId = operation.kind === 'profile'
      ? targetAccountId
      : await mappedId(operation.kind, operation.entityId)
    const payload = operation.kind === 'profile'
      ? account
      : operation.kind === 'plan'
        ? await mapPlan(operation.payload as MobilePlan)
        : operation.kind === 'session'
          ? await mapSession(operation.payload as MobileSession)
          : await mapMeasurement(operation.payload as MobileMeasurement)
    return {
      ...operation,
      id: await mappedId('outbox', operation.id),
      accountId: targetAccountId,
      entityId,
      payload,
    }
  }))
  return {
    ...backup,
    account,
    data: {
      plans,
      sessions,
      measurements,
      activePlanId: backup.data.activePlanId
        ? await mappedId('plan', backup.data.activePlanId)
        : null,
    },
    outbox,
  }
}

async function deterministicCopyId(
  sourceAccountId: string,
  targetAccountId: string,
  kind: string,
  sourceId: string,
): Promise<string> {
  const input = new TextEncoder().encode(
    `vekira-mobile-copy:${sourceAccountId}:${targetAccountId}:${kind}:${sourceId}`,
  )
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', input))
  const bytes = digest.slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x80
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function validateBackup(json: string): ValidBackup {
  let parsed: unknown
  try {
    parsed = JSON.parse(json) as unknown
  } catch {
    throw new Error('Invalid backup JSON')
  }
  const root = object(parsed, 'backup')
  if (root.format !== BACKUP_FORMAT || root.version !== BACKUP_VERSION) {
    throw new Error('Unsupported backup format or version')
  }
  const exportedAt = timestamp(root.exportedAt, 'backup.exportedAt')
  const account = validateAccount(root.account, 'backup.account')
  const data = validateData(root.data, account.id)
  const outbox = array(root.outbox, 'backup.outbox').map((value, index) =>
    validateOutbox(value, account.id, `backup.outbox[${index}]`),
  )
  unique(outbox.map((value) => value.id), 'backup outbox operation IDs')
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt, account, data, outbox }
}

function validateData(value: unknown, accountId: string): MobileData {
  const record = object(value, 'backup.data')
  const plans = array(record.plans, 'backup.data.plans').map((item, index) =>
    validatePlan(item, `backup.data.plans[${index}]`),
  )
  const sessions = array(record.sessions, 'backup.data.sessions').map((item, index) =>
    validateSession(item, `backup.data.sessions[${index}]`),
  )
  const measurements = array(record.measurements, 'backup.data.measurements').map((item, index) =>
    validateMeasurement(item, `backup.data.measurements[${index}]`),
  )
  for (const entity of [...plans, ...sessions, ...measurements]) {
    if (entity.accountId !== accountId) throw new Error('Backup contains cross-account data')
  }
  unique(plans.map((item) => item.id), 'backup plan IDs')
  unique(sessions.map((item) => item.id), 'backup session IDs')
  unique(measurements.map((item) => item.id), 'backup measurement IDs')
  const activePlanId = nullableString(record.activePlanId, 'backup.data.activePlanId')
  if (activePlanId && !plans.some((plan) => plan.id === activePlanId)) {
    throw new Error('Backup active plan is missing from the backup')
  }
  return { plans, sessions, measurements, activePlanId }
}

function validateAccount(value: unknown, path: string): MobileAccount {
  const record = object(value, path)
  return {
    id: requiredString(record.id, `${path}.id`),
    remoteUserId: nullableString(record.remoteUserId, `${path}.remoteUserId`),
    name: requiredString(record.name, `${path}.name`),
    profile: validateProfile(record.profile, `${path}.profile`),
    createdAt: timestamp(record.createdAt, `${path}.createdAt`),
    updatedAt: timestamp(record.updatedAt, `${path}.updatedAt`),
  }
}

function validateProfile(value: unknown, path: string): MobileAccount['profile'] {
  const record = object(value, path)
  const readiness = object(record.readiness, `${path}.readiness`)
  const status = oneOf(
    readiness.status,
    ['pending', 'cleared', 'modified', 'professional_clearance_required'] as const,
    `${path}.readiness.status`,
  )
  return {
    language: oneOf(record.language, ['es', 'en'] as const, `${path}.language`),
    fitnessLevel: oneOf(
      record.fitnessLevel,
      ['beginner', 'intermediate', 'advanced'] as const,
      `${path}.fitnessLevel`,
    ),
    primaryGoal: oneOf(
      record.primaryGoal,
      ['lose_weight', 'build_muscle', 'gain_strength', 'improve_endurance', 'stay_active', 'other'] as const,
      `${path}.primaryGoal`,
    ),
    daysPerWeek: integer(record.daysPerWeek, `${path}.daysPerWeek`, 1),
    sessionDurationMinutes: integer(record.sessionDurationMinutes, `${path}.sessionDurationMinutes`, 1),
    gymType: oneOf(
      record.gymType,
      ['home_no_equipment', 'home_basic', 'full_gym'] as const,
      `${path}.gymType`,
    ),
    availableEquipment: stringArray(record.availableEquipment, `${path}.availableEquipment`),
    preferredWorkoutDays: record.preferredWorkoutDays === null
      ? null
      : array(record.preferredWorkoutDays, `${path}.preferredWorkoutDays`).map((day, index) =>
          integer(day, `${path}.preferredWorkoutDays[${index}]`, 0),
        ),
    cardioPreferences: array(record.cardioPreferences, `${path}.cardioPreferences`).map((item, index) =>
      oneOf(
        item,
        ['walking', 'running', 'cycling', 'elliptical', 'rowing', 'stairs', 'jump_rope'] as const,
        `${path}.cardioPreferences[${index}]`,
      ),
    ),
    age: record.age === null ? null : integer(record.age, `${path}.age`, 0),
    readiness: {
      status,
      currentlyActive: boolean(readiness.currentlyActive, `${path}.readiness.currentlyActive`),
      warningSymptoms: stringArray(readiness.warningSymptoms, `${path}.readiness.warningSymptoms`),
      knownCardiovascularMetabolicOrRenalDisease: boolean(
        readiness.knownCardiovascularMetabolicOrRenalDisease,
        `${path}.readiness.knownCardiovascularMetabolicOrRenalDisease`,
      ),
      medicallyCleared: boolean(readiness.medicallyCleared, `${path}.readiness.medicallyCleared`),
      recentSurgery: boolean(readiness.recentSurgery, `${path}.readiness.recentSurgery`),
      limitations: array(readiness.limitations, `${path}.readiness.limitations`).map((item, index) => {
        const limitation = object(item, `${path}.readiness.limitations[${index}]`)
        return {
          region: requiredString(limitation.region, `${path}.readiness.limitations[${index}].region`),
          side: limitation.side === undefined
            ? undefined
            : limitation.side === null
              ? null
              : oneOf(
                  limitation.side,
                  ['left', 'right', 'both'] as const,
                  `${path}.readiness.limitations[${index}].side`,
                ),
          status: oneOf(
            limitation.status,
            ['stable', 'acute', 'recovering'] as const,
            `${path}.readiness.limitations[${index}].status`,
          ),
          movementsToAvoid: stringArray(
            limitation.movementsToAvoid,
            `${path}.readiness.limitations[${index}].movementsToAvoid`,
          ),
          clinicianCleared: boolean(
            limitation.clinicianCleared,
            `${path}.readiness.limitations[${index}].clinicianCleared`,
          ),
        }
      }),
    },
  }
}

function validatePlan(value: unknown, path: string): MobilePlan {
  const record = object(value, path)
  const workouts = array(record.workouts, `${path}.workouts`).map((item, workoutIndex) => {
    const workout = object(item, `${path}.workouts[${workoutIndex}]`)
    const prescriptions = array(workout.exercises, `${path}.workouts[${workoutIndex}].exercises`).map(
      (entry, exerciseIndex) => validatePrescription(
        entry,
        `${path}.workouts[${workoutIndex}].exercises[${exerciseIndex}]`,
      ),
    )
    unique(prescriptions.map((item) => item.id), `${path} prescription IDs`)
    return {
      id: requiredString(workout.id, `${path}.workouts[${workoutIndex}].id`),
      name: requiredString(workout.name, `${path}.workouts[${workoutIndex}].name`),
      dayOfWeek: integer(workout.dayOfWeek, `${path}.workouts[${workoutIndex}].dayOfWeek`, 0),
      exercises: prescriptions,
    }
  })
  unique(workouts.map((item) => item.id), `${path} workout IDs`)
  return {
    id: requiredString(record.id, `${path}.id`),
    accountId: requiredString(record.accountId, `${path}.accountId`),
    remoteId: nullableString(record.remoteId, `${path}.remoteId`),
    source: oneOf(record.source, ['personal', 'trainer'] as const, `${path}.source`),
    name: requiredString(record.name, `${path}.name`),
    notes: string(record.notes, `${path}.notes`),
    workouts,
    createdAt: timestamp(record.createdAt, `${path}.createdAt`),
    updatedAt: timestamp(record.updatedAt, `${path}.updatedAt`),
  }
}

function validatePrescription(value: unknown, path: string) {
  const record = object(value, path)
  return {
    id: requiredString(record.id, `${path}.id`),
    exerciseId: requiredString(record.exerciseId, `${path}.exerciseId`),
    name: requiredString(record.name, `${path}.name`),
    imageUrl: nullableString(record.imageUrl, `${path}.imageUrl`),
    instructions: string(record.instructions, `${path}.instructions`),
    sets: integer(record.sets, `${path}.sets`, 1),
    reps: nullableNumber(record.reps, `${path}.reps`, 0),
    durationSeconds: nullableNumber(record.durationSeconds, `${path}.durationSeconds`, 0),
    restSeconds: finiteNumber(record.restSeconds, `${path}.restSeconds`, 0),
    weightKg: nullableNumber(record.weightKg, `${path}.weightKg`, 0),
    targetRpe: nullableNumber(record.targetRpe, `${path}.targetRpe`, 0),
  }
}

function validateSession(value: unknown, path: string): MobileSession {
  const record = object(value, path)
  const exercises = array(record.exercises, `${path}.exercises`).map((entry, exerciseIndex) => {
    const exercise = object(entry, `${path}.exercises[${exerciseIndex}]`)
    const sets = array(exercise.sets, `${path}.exercises[${exerciseIndex}].sets`).map((item, setIndex) => {
      const set = object(item, `${path}.exercises[${exerciseIndex}].sets[${setIndex}]`)
      return {
        id: requiredString(set.id, `${path}.exercises[${exerciseIndex}].sets[${setIndex}].id`),
        reps: nullableNumber(set.reps, `${path}.exercises[${exerciseIndex}].sets[${setIndex}].reps`, 0),
        weightKg: nullableNumber(
          set.weightKg,
          `${path}.exercises[${exerciseIndex}].sets[${setIndex}].weightKg`,
          0,
        ),
        durationSeconds: nullableNumber(
          set.durationSeconds,
          `${path}.exercises[${exerciseIndex}].sets[${setIndex}].durationSeconds`,
          0,
        ),
        completed: boolean(set.completed, `${path}.exercises[${exerciseIndex}].sets[${setIndex}].completed`),
      }
    })
    unique(sets.map((item) => item.id), `${path} set IDs`)
    return {
      prescription: validatePrescription(
        exercise.prescription,
        `${path}.exercises[${exerciseIndex}].prescription`,
      ),
      sets,
    }
  })
  const finishedAt = record.finishedAt === null ? null : timestamp(record.finishedAt, `${path}.finishedAt`)
  return {
    id: requiredString(record.id, `${path}.id`),
    accountId: requiredString(record.accountId, `${path}.accountId`),
    planId: requiredString(record.planId, `${path}.planId`),
    workoutId: requiredString(record.workoutId, `${path}.workoutId`),
    workoutName: requiredString(record.workoutName, `${path}.workoutName`),
    source: oneOf(record.source, ['personal', 'trainer'] as const, `${path}.source`),
    startedAt: timestamp(record.startedAt, `${path}.startedAt`),
    finishedAt,
    exercises,
    rpe: nullableNumber(record.rpe, `${path}.rpe`, 0),
    notes: string(record.notes, `${path}.notes`),
    remoteId: nullableString(record.remoteId, `${path}.remoteId`),
  }
}

function validateMeasurement(value: unknown, path: string): MobileMeasurement {
  const record = object(value, path)
  return {
    id: requiredString(record.id, `${path}.id`),
    accountId: requiredString(record.accountId, `${path}.accountId`),
    date: date(record.date, `${path}.date`),
    weightKg: finiteNumber(record.weightKg, `${path}.weightKg`, 0),
    waistCm: nullableNumber(record.waistCm, `${path}.waistCm`, 0),
    notes: string(record.notes, `${path}.notes`),
    updatedAt: timestamp(record.updatedAt, `${path}.updatedAt`),
    deletedAt: record.deletedAt === null ? null : timestamp(record.deletedAt, `${path}.deletedAt`),
  }
}

function validateOutbox(value: unknown, accountId: string, path: string): OutboxOperation {
  const record = object(value, path)
  const kind = oneOf(
    record.kind,
    ['plan', 'session', 'measurement', 'profile'] as const,
    `${path}.kind`,
  )
  const operation: OutboxOperation = {
    id: requiredString(record.id, `${path}.id`),
    accountId: requiredString(record.accountId, `${path}.accountId`),
    kind,
    entityId: requiredString(record.entityId, `${path}.entityId`),
    payload: record.payload,
    createdAt: timestamp(record.createdAt, `${path}.createdAt`),
    attempts: integer(record.attempts, `${path}.attempts`, 0),
    error: nullableString(record.error, `${path}.error`),
  }
  if (operation.accountId !== accountId) throw new Error('Backup outbox contains cross-account data')
  if (kind === 'profile') {
    const payload = validateAccount(operation.payload, `${path}.payload`)
    if (payload.id !== accountId || operation.entityId !== accountId) {
      throw new Error('Backup profile outbox ownership is invalid')
    }
    operation.payload = payload
  } else if (kind === 'plan') {
    const payload = validatePlan(operation.payload, `${path}.payload`)
    if (payload.accountId !== accountId || payload.id !== operation.entityId) {
      throw new Error('Backup plan outbox ownership is invalid')
    }
    operation.payload = payload
  } else if (kind === 'session') {
    const payload = validateSession(operation.payload, `${path}.payload`)
    if (payload.accountId !== accountId || payload.id !== operation.entityId) {
      throw new Error('Backup session outbox ownership is invalid')
    }
    operation.payload = payload
  } else {
    const payload = validateMeasurement(operation.payload, `${path}.payload`)
    if (payload.accountId !== accountId || payload.id !== operation.entityId) {
      throw new Error('Backup measurement outbox ownership is invalid')
    }
    operation.payload = payload
  }
  return operation
}

function parseStored<T>(json: string, label: string): T {
  try {
    return JSON.parse(json) as T
  } catch {
    throw new Error(`Corrupt stored mobile ${label}`)
  }
}

function stringify(value: unknown): string {
  return JSON.stringify(value)
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid backup field ${path}`)
  }
  return value as Record<string, unknown>
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid backup field ${path}`)
  return value
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid backup field ${path}`)
  return value
}

function requiredString(value: unknown, path: string): string {
  const result = string(value, path)
  if (result.trim().length === 0) throw new Error(`Invalid backup field ${path}`)
  return result
}

function nullableString(value: unknown, path: string): string | null {
  return value === null ? null : string(value, path)
}

function finiteNumber(value: unknown, path: string, minimum?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || (minimum !== undefined && value < minimum)) {
    throw new Error(`Invalid backup field ${path}`)
  }
  return value
}

function nullableNumber(value: unknown, path: string, minimum?: number): number | null {
  return value === null ? null : finiteNumber(value, path, minimum)
}

function integer(value: unknown, path: string, minimum?: number): number {
  const result = finiteNumber(value, path, minimum)
  if (!Number.isInteger(result)) throw new Error(`Invalid backup field ${path}`)
  return result
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid backup field ${path}`)
  return value
}

function timestamp(value: unknown, path: string): string {
  const result = string(value, path)
  if (!Number.isFinite(Date.parse(result))) throw new Error(`Invalid backup field ${path}`)
  return result
}

function date(value: unknown, path: string): string {
  const result = string(value, path)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(`${result}T00:00:00.000Z`))) {
    throw new Error(`Invalid backup field ${path}`)
  }
  return result
}

function stringArray(value: unknown, path: string): string[] {
  return array(value, path).map((entry, index) => string(entry, `${path}[${index}]`))
}

function oneOf<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  path: string,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`Invalid backup field ${path}`)
  }
  return value as T[number]
}

function unique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`)
}

function uuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

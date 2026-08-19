import { expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))

import { loadAdminUsers } from '../admin'

type ProfileRequest = {
  columns: string
  ids: string[]
}

function authUser(index: number): User {
  const id = `user-${String(index).padStart(3, '0')}`
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: `${id}@example.test`,
    created_at: `2026-08-${String((index % 28) + 1).padStart(2, '0')}T12:00:00.000Z`,
    last_sign_in_at: index % 2 === 0 ? '2026-08-18T12:00:00.000Z' : undefined,
    app_metadata: {},
    user_metadata: {},
  } as User
}

function adminUserService(options: {
  userCount: number
  failAccessChunk?: number
}) {
  const users = Array.from({ length: options.userCount }, (_, index) => authUser(index + 1))
  const authCalls: Array<{ page: number; perPage: number }> = []
  const profileRequests: ProfileRequest[] = []
  const unrestrictedProfileReads: string[] = []
  let accessChunk = 0

  function rows(columns: string, ids: string[]) {
    const access = columns.includes('account_status')
    return ids.map(id => access ? {
      id,
      account_status: id === users[0]?.id ? 'suspended' : 'active',
      suspension_reason: id === users[0]?.id ? 'Revisión manual' : null,
      suspended_until: id === users[0]?.id ? '2026-09-01T12:00:00.000Z' : null,
    } : {
      id,
      full_name: `Nombre ${id}`,
      username: id,
      avatar_url: null,
      subscription_tier: id === users[0]?.id ? 'pro' : 'free',
    })
  }

  const service = {
    auth: {
      admin: {
        async listUsers({ page, perPage }: { page: number; perPage: number }) {
          authCalls.push({ page, perPage })
          const start = (page - 1) * perPage
          return {
            data: { users: users.slice(start, start + perPage) },
            error: null,
          }
        },
      },
    },
    from(table: string) {
      if (table !== 'profiles') throw new Error(`Unexpected table: ${table}`)
      return {
        select(columns: string) {
          const query = {
            in(column: string, ids: string[]) {
              if (column !== 'id') throw new Error(`Unexpected profile filter: ${column}`)
              profileRequests.push({ columns, ids: [...ids] })
              const access = columns.includes('account_status')
              if (access) accessChunk += 1
              const error = access && accessChunk === options.failAccessChunk
                ? { message: 'access columns unavailable' }
                : null
              return Promise.resolve({ data: error ? null : rows(columns, ids), error })
            },
            then<TResult1 = unknown, TResult2 = never>(
              onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
              onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
            ) {
              unrestrictedProfileReads.push(columns)
              return Promise.resolve({ data: rows(columns, users.map(user => user.id)), error: null })
                .then(onfulfilled, onrejected)
            },
          }
          return query
        },
      }
    },
  }

  return { service, users, authCalls, profileRequests, unrestrictedProfileReads }
}

it('loads every Auth page and queries profile data only for selected ids in bounded chunks', async () => {
  const fixture = adminUserService({ userCount: 201 })

  const result = await loadAdminUsers(fixture.service as never)

  expect(result.users).toHaveLength(201)
  expect(result.users.at(-1)?.id).toBe('user-201')
  expect(fixture.authCalls).toEqual([
    { page: 1, perPage: 200 },
    { page: 2, perPage: 200 },
  ])
  expect(fixture.unrestrictedProfileReads).toEqual([])
  expect(fixture.profileRequests).toHaveLength(6)
  expect(fixture.profileRequests.every(request => request.ids.length <= 100)).toBe(true)
  expect(fixture.profileRequests.filter(request => request.columns.includes('full_name'))
    .flatMap(request => request.ids)).toEqual(fixture.users.map(user => user.id))
  expect(fixture.profileRequests.filter(request => request.columns.includes('account_status'))
    .flatMap(request => request.ids)).toEqual(fixture.users.map(user => user.id))
})

it('discards partial suspension rows when any access chunk is unavailable', async () => {
  const fixture = adminUserService({ userCount: 101, failAccessChunk: 2 })

  const result = await loadAdminUsers(fixture.service as never)

  expect(result.suspensionEnabled).toBe(false)
  expect(result.users[0]).toMatchObject({
    accountStatus: 'active',
    suspensionReason: null,
    suspendedUntil: null,
  })
})

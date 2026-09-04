import { describe, expect, it } from 'vitest'
import {
  hasDashboardNotificationAttention,
  loadUnreadProductNotificationAttention,
  type UnreadProductNotificationClient,
} from '../notificationAttention'

function notificationClient(result: { count: number | null; error: { message?: string } | null }) {
  const calls: Array<[string, ...unknown[]]> = []
  const client: UnreadProductNotificationClient = {
    from(table) {
      calls.push(['from', table])
      return {
        select(columns, options) {
          calls.push(['select', columns, options])
          return {
            eq(column, value) {
              calls.push(['eq', column, value])
              return {
                is(firstColumn, firstValue) {
                  calls.push(['is', firstColumn, firstValue])
                  return {
                    is(secondColumn, secondValue) {
                      calls.push(['is', secondColumn, secondValue])
                      return Promise.resolve(result)
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  }
  return { client, calls }
}

describe('dashboard unread notification attention', () => {
  it.each([
    ['no unread notifications', { count: 0, error: null }, false],
    ['unread notifications', { count: 2, error: null }, true],
    ['an unavailable count', { count: null, error: { message: 'unavailable' } }, false],
  ] as const)('returns %s without loading notification bodies', async (_label, result, expected) => {
    const { client } = notificationClient(result)

    await expect(loadUnreadProductNotificationAttention(client, 'client-123')).resolves.toBe(expected)
  })

  it('uses the authenticated user and unread undismissed head-count filters at the query boundary', async () => {
    const { client, calls } = notificationClient({ count: 1, error: null })

    await loadUnreadProductNotificationAttention(client, 'client-123')

    expect(calls).toEqual([
      ['from', 'product_notifications'],
      ['select', 'id', { count: 'exact', head: true }],
      ['eq', 'user_id', 'client-123'],
      ['is', 'dismissed_at', null],
      ['is', 'read_at', null],
    ])
  })

  it('keeps the bell attentive for either a dashboard notice or unread notifications', () => {
    expect(hasDashboardNotificationAttention({ hasDashboardNotice: false, hasUnreadProductNotifications: false })).toBe(false)
    expect(hasDashboardNotificationAttention({ hasDashboardNotice: true, hasUnreadProductNotifications: false })).toBe(true)
    expect(hasDashboardNotificationAttention({ hasDashboardNotice: false, hasUnreadProductNotifications: true })).toBe(true)
  })
})

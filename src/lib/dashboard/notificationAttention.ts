export type UnreadProductNotificationCountResult = {
  count: number | null
  error: { message?: string } | null
}

export type UnreadProductNotificationClient = {
  from: (table: 'product_notifications') => {
    select: (columns: 'id', options: { count: 'exact'; head: true }) => {
      eq: (column: 'user_id', value: string) => {
        is: (column: 'dismissed_at', value: null) => {
          is: (column: 'read_at', value: null) => Promise<UnreadProductNotificationCountResult>
        }
      }
    }
  }
}

export async function loadUnreadProductNotificationAttention(
  supabase: UnreadProductNotificationClient,
  userId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from('product_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('dismissed_at', null)
    .is('read_at', null)

  return !error && (count ?? 0) > 0
}

export function hasDashboardNotificationAttention({
  hasDashboardNotice,
  hasUnreadProductNotifications,
}: {
  hasDashboardNotice: boolean
  hasUnreadProductNotifications: boolean
}): boolean {
  return hasDashboardNotice || hasUnreadProductNotifications
}

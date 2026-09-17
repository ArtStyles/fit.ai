import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { User } from '@supabase/supabase-js'
import type { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

// Keep the same database-client signature used by existing server actions.
export type MobileApiContext = { user: User; client: ReturnType<typeof createServerClient<Database>> }
const requests = new AsyncLocalStorage<MobileApiContext>()
export const getMobileApiContext = () => requests.getStore()
export const withMobileApiContext = <T>(context: MobileApiContext, operation: () => Promise<T>) => requests.run(context, operation)

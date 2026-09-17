import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { deleteVerifiedAccount } from '@/lib/account/delete'
import { accountApiHeaders, handleAccountDeletion } from '@/lib/account/http'

export async function POST(request: Request) {
  return handleAccountDeletion(request, (confirmation, token) => deleteVerifiedAccount(confirmation, {
    verifyUser: async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!url || !key) throw new Error('Account service is not configured')
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
      const result = await client.auth.getUser(token)
      return result.error ? null : result.data.user
    },
    createAdmin: createServiceClient,
  }))
}
export async function OPTIONS() { return new Response(null, { status: 204, headers: accountApiHeaders }) }

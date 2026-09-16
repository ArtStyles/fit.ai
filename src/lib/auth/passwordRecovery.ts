import type { SupabaseClient } from '@supabase/supabase-js'
export function createPasswordRecovery(client: SupabaseClient | null, online: () => boolean) {
  let proof: { id: string; email: string } | null = null
  let generation = 0, busy = false
  function fail(code: string): never { throw new Error(code) }
  const emailValue = (value: string) => {
    const email = value.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('recovery_email')
    return email
  }
  async function run(operation: (auth: SupabaseClient['auth'], fresh: () => void) => Promise<void>) {
    if (!online()) fail('recovery_offline')
    if (!client) fail('recovery_unconfigured')
    if (busy) fail('recovery_busy')
    busy = true
    const expected = generation
    const fresh = () => { if (expected !== generation) fail('recovery_required') }
    try { await operation(client.auth, fresh); fresh() }
    finally { busy = false }
  }
  return {
    async request(rawEmail: string) {
      const email = emailValue(rawEmail); proof = null
      await run(async auth => { if ((await auth.resetPasswordForEmail(email)).error) fail('recovery_request') })
    },
    async verify(rawEmail: string, rawCode: string) {
      const email = emailValue(rawEmail), token = rawCode.replace(/\s/g, '')
      proof = null
      if (!/^\d{6,8}$/.test(token)) fail('recovery_code')
      await run(async (auth, fresh) => {
        const result = await auth.verifyOtp({ email, token, type: 'recovery' }); fresh()
        if (result.error || !result.data.session || !result.data.user) fail('recovery_code')
        if (result.data.user.email?.toLowerCase() !== email || result.data.session.user.id !== result.data.user.id) fail('recovery_identity')
        proof = { id: result.data.user.id, email }
      })
    },
    async update(password: string, confirmation: string) {
      if (!proof) fail('recovery_required')
      if (password !== confirmation) fail('password_mismatch')
      if (password.length < 8) fail('password_length')
      const owner = proof
      await run(async (auth, fresh) => {
        const verified = await auth.getUser(); fresh()
        if (verified.error || verified.data.user?.id !== owner.id || verified.data.user.email?.toLowerCase() !== owner.email) { proof = null; fail('recovery_identity') }
        const result = await auth.updateUser({ password }); fresh()
        if (result.error || result.data.user?.id !== owner.id) fail('recovery_update')
        proof = null
      })
    },
    // Recovery uses a dedicated memory-only SDK client. Discarding the form
    // never writes an authenticated account or token to the app's own session.
    cancel() { generation++; proof = null },
  }
}

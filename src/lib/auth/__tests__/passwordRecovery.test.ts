import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createPasswordRecovery } from '../passwordRecovery'

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
function fixture() {
  const calls: { path: string; body: Record<string, string>; token: string | null }[] = []
  let rejectCode = false
  const user = { id, email: 'ana@example.invalid', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  const client = createClient('https://auth.example.invalid', 'public-fixture-key', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: async (input, init) => {
    const path = new URL(String(input)).pathname, body = JSON.parse(String(init?.body ?? '{}'))
    calls.push({ path, body, token: new Headers(init?.headers).get('authorization') })
    if (path === '/auth/v1/recover') return Response.json({})
    if (path === '/auth/v1/verify') return rejectCode ? Response.json({ msg: 'expired', error_code: 'otp_expired' }, { status: 403 }) : Response.json({ access_token: 'recovery-a', refresh_token: 'refresh-a', expires_in: 3600, token_type: 'bearer', user })
    if (path === '/auth/v1/user') return Response.json(user)
    throw new Error(`Unexpected HTTP request ${path}`)
  } } })
  return { calls, client, flow: createPasswordRecovery(client, () => true), reject: () => { rejectCode = true } }
}
describe('password recovery with real isolated Supabase SDK', () => {
  it('requests recovery, verifies recovery OTP and changes only the verified account password', async () => {
    const f = fixture()
    await f.flow.request(' Ana@Example.Invalid ')
    await f.flow.verify('ana@example.invalid', '12345678')
    await f.flow.update('NewSecret!123', 'NewSecret!123')
    expect(f.calls.map(call => call.path)).toEqual(['/auth/v1/recover', '/auth/v1/verify', '/auth/v1/user', '/auth/v1/user'])
    expect(f.calls[1].body).toMatchObject({ email: 'ana@example.invalid', token: '12345678', type: 'recovery' })
    expect(f.calls[3]).toMatchObject({ token: 'Bearer recovery-a', body: { password: 'NewSecret!123' } })
    await expect(f.flow.update('OtherSecret!123', 'OtherSecret!123')).rejects.toThrow(/recovery_required/)
  })
  it('does not update on missing proof, expired OTP, mismatched passwords or after cancel/reload', async () => {
    const f = fixture()
    await expect(f.flow.update('NewSecret!123', 'NewSecret!123')).rejects.toThrow(/recovery_required/)
    f.reject(); await expect(f.flow.verify('ana@example.invalid', '12345678')).rejects.toThrow(/recovery_code/)
    expect(f.calls.filter(call => call.path === '/auth/v1/user')).toHaveLength(0)
    const valid = fixture(); await valid.flow.verify('ana@example.invalid', '12345678')
    await expect(valid.flow.update('NewSecret!123', 'different')).rejects.toThrow(/password_mismatch/)
    valid.flow.cancel(); await expect(valid.flow.update('NewSecret!123', 'NewSecret!123')).rejects.toThrow(/recovery_required/)
    await expect(createPasswordRecovery(valid.client, () => true).update('NewSecret!123', 'NewSecret!123')).rejects.toThrow(/recovery_required/)
    expect(valid.calls.filter(call => call.body.password)).toHaveLength(0)
  })
  it('rejects a returned identity with another email and offline requests', async () => {
    const f = fixture()
    await expect(f.flow.verify('bob@example.invalid', '12345678')).rejects.toThrow(/recovery_identity/)
    await expect(f.flow.update('NewSecret!123', 'NewSecret!123')).rejects.toThrow(/recovery_required/)
    await expect(createPasswordRecovery(f.client, () => false).request('ana@example.invalid')).rejects.toThrow(/recovery_offline/)
  })
})
